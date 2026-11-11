"""Byline's optional self-hosted transcription service.

The service owns the long-running CPU work as idempotent jobs so the newsroom
never has to keep a single HTTP request open for an entire interview.

    POST   /jobs/{job_key}  multipart upload; start or reattach to a job
    GET    /jobs/{job_key}  lightweight progress/result polling
    DELETE /jobs/{job_key}  request cancellation
    GET    /health          always responsive while Whisper is working

A job key is supplied by Byline and is stable across automatic queue retries.
That means a dropped connection can reattach to the same Whisper work instead
of starting a second expensive transcription.

With ``WHISPER_DIARIZATION=1`` a job first diarizes the *whole* recording once
(pyannote, see ``diarization.py``) and only then transcribes with faster-whisper,
sequentially so the two never compete for the same CPU cores. Whisper's word
timing is reconciled with the speaker timeline (``speakers.py``) so every
segment, including each progressive prefix, already carries its speaker.
"""
from __future__ import annotations

import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from threading import Event, Lock
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import BatchedInferencePipeline, WhisperModel

import diarization
from speakers import segments_for

app = FastAPI(title="Byline transcription")
TOKEN = os.environ.get("BYLINE_TRANSCRIPTION_TOKEN", "").strip()
JOB_TTL_SECONDS = max(300, int(os.environ.get("WHISPER_JOB_TTL_SECONDS", str(6 * 60 * 60))))
MAX_WORKERS = max(1, int(os.environ.get("WHISPER_MAX_WORKERS", "1")))
DEVICE = os.environ.get("WHISPER_DEVICE", "auto").strip() or "auto"
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "default").strip() or "default"
CPU_THREADS = max(0, int(os.environ.get("WHISPER_CPU_THREADS", "0")))
BATCH_SIZE = max(1, int(os.environ.get("WHISPER_BATCH_SIZE", "1")))
WORD_TIMESTAMPS_DEFAULT = os.environ.get("WHISPER_WORD_TIMESTAMPS", "0").strip().lower() in {"1", "true", "yes", "on"}


def _flag(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _count(name: str) -> int | None:
    """An optional speaker-count setting: a small positive integer, else automatic."""
    try:
        value = int(os.environ.get(name, "").strip())
    except ValueError:
        return None
    return value if 1 <= value <= 20 else None


# Speaker diarization (pyannote). Off unless enabled; the Hugging Face token is
# server-side only: never returned by /health or a job, never logged.
DIARIZATION_ENABLED = _flag("WHISPER_DIARIZATION")
DIARIZATION_MODEL = os.environ.get("WHISPER_DIARIZATION_MODEL", "").strip() or "pyannote/speaker-diarization-community-1"
DIARIZATION_TOKEN = os.environ.get("WHISPER_DIARIZATION_TOKEN", "").strip()
DIARIZATION_DEVICE = os.environ.get("WHISPER_DIARIZATION_DEVICE", "").strip() or ("cuda" if DEVICE.startswith("cuda") else "cpu")
MIN_SPEAKERS = _count("WHISPER_MIN_SPEAKERS")
MAX_SPEAKERS = _count("WHISPER_MAX_SPEAKERS")
ACTIVE_STATES = {"loading-diarization", "diarizing", "loading-model", "transcribing"}
JOB_KEY = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")
EXECUTOR = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="byline-whisper")
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = Lock()


@lru_cache(maxsize=2)
def load(model: str) -> WhisperModel:
    return WhisperModel(
        model,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        cpu_threads=CPU_THREADS,
    )


@lru_cache(maxsize=2)
def load_batched(model: str) -> BatchedInferencePipeline:
    return BatchedInferencePipeline(model=load(model))


def load_diarizer():
    """Seam for tests: the cached pyannote pipeline."""
    return diarization.load_pipeline(DIARIZATION_MODEL, DIARIZATION_TOKEN, DIARIZATION_DEVICE)


def diarize_recording(path: str, pipeline: Any, hints: dict[str, int], on_progress, cancelled) -> list[dict[str, Any]]:
    """Seam for tests: one whole-recording diarization → a plain speaker timeline."""
    if CPU_THREADS:
        import torch

        torch.set_num_threads(CPU_THREADS)
    return diarization.diarize(
        diarization.load_audio(path),
        pipeline=pipeline,
        on_progress=on_progress,
        cancelled=cancelled,
        **hints,
    )


def authorize(authorization: str | None) -> None:
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def _cleanup_jobs(now: float | None = None) -> None:
    now = now or time.time()
    expired = [
        key
        for key, job in JOBS.items()
        if job.get("finished_at") and now - float(job["finished_at"]) > JOB_TTL_SECONDS
    ]
    for key in expired:
        JOBS.pop(key, None)


def _snapshot(job: dict[str, Any]) -> dict[str, Any]:
    result = {
        "job": job["key"],
        "state": job["state"],
        "progress": job.get("progress"),
        "processed": job.get("processed"),
        "duration": job.get("duration"),
        "message": job.get("message", ""),
        "diarization": bool(job.get("diarize")),
    }
    if job["state"] != "ready":
        result["segments"] = job["segments"].copy()
    if job.get("detail"):
        result["detail"] = job["detail"]
    if job.get("retryable") is not None:
        result["retryable"] = bool(job["retryable"])
    if job.get("result") is not None:
        result["result"] = job["result"]
    return result


def _set_job(job: dict[str, Any], *, segment: dict[str, Any] | None = None, segments: list[dict[str, Any]] | None = None, **changes: Any) -> None:
    with JOBS_LOCK:
        if JOBS.get(job["key"]) is not job:
            return
        if segment is not None:
            job["segments"].append(segment)
        if segments:
            # One Whisper segment may become several speaker turns; publish
            # them together so a status poll never sees half a segment.
            job["segments"].extend(segments)
        job.update(changes)
        job["updated_at"] = time.time()
        if changes.get("state") in {"ready", "failed", "cancelled"}:
            job["finished_at"] = time.time()


def _cancelled(job: dict[str, Any]) -> bool:
    with JOBS_LOCK:
        return JOBS.get(job["key"]) is not job or bool(job["cancel"].is_set())


def _finish_cancelled(job: dict[str, Any]) -> None:
    _set_job(
        job,
        state="cancelled",
        message="Transcription cancelled",
        detail="The transcription was cancelled.",
        retryable=True,
    )


def _run_job(job: dict[str, Any]) -> None:
    path = str(job["path"])
    with JOBS_LOCK:
        if JOBS.get(job["key"]) is not job:
            return
        model_name = str(job["model"])
        language = job.get("language")
        vad = bool(job["vad"])
        diarize = bool(job.get("diarize"))
        hints = dict(job.get("speaker_hints") or {})
        # Speaker attribution needs word timing; otherwise stay segment-only (faster).
        word_timestamps = bool(job["word_timestamps"]) or diarize

    try:
        if _cancelled(job):
            _finish_cancelled(job)
            return

        turns: list[dict[str, Any]] = []
        if diarize:
            # Whole recording, once, before any text: one consistent speaker
            # clustering for the entire interview.
            _set_job(job, state="loading-diarization", message="Loading speaker model", progress=None)
            try:
                pipeline = load_diarizer()
            except diarization.DiarizationUnavailable as error:
                _set_job(
                    job,
                    state="failed",
                    message="The speaker model could not be loaded",
                    detail="Speaker identification is unavailable: check the service's diarization model, access and cache.",
                    retryable=error.retryable,
                )
                return
            except Exception as error:  # noqa: BLE001
                _set_job(
                    job,
                    state="failed",
                    message="The speaker model could not be loaded",
                    detail=f"Could not load the speaker model ({type(error).__name__}).",
                    retryable=True,
                )
                return
            if _cancelled(job):
                _finish_cancelled(job)
                return
            _set_job(job, state="diarizing", message="Identifying speakers", progress=0.0, processed=None)
            try:
                turns = diarize_recording(
                    path,
                    pipeline,
                    hints,
                    lambda fraction: _set_job(job, progress=min(0.99, float(fraction))),
                    lambda: _cancelled(job),
                )
            except diarization.DiarizationCancelled:
                _finish_cancelled(job)
                return
            except Exception as error:  # noqa: BLE001
                _set_job(
                    job,
                    state="failed",
                    message="Speakers could not be identified",
                    detail=f"Could not identify speakers ({type(error).__name__}).",
                    retryable=False,
                )
                return
            if _cancelled(job):
                _finish_cancelled(job)
                return

        _set_job(job, state="loading-model", message="Loading Whisper model", progress=None)
        try:
            model = load(model_name)
            transcriber = load_batched(model_name) if BATCH_SIZE > 1 else model
        except Exception as error:
            _set_job(
                job,
                state="failed",
                message="Whisper could not load the model",
                detail=f"Could not load the transcription model ({type(error).__name__}).",
                retryable=True,
            )
            return

        if _cancelled(job):
            _finish_cancelled(job)
            return

        _set_job(job, state="transcribing", message="Transcribing audio", progress=0.0, processed=0.0)
        try:
            if BATCH_SIZE > 1:
                segments, info = transcriber.transcribe(
                    path,
                    language=language or None,
                    vad_filter=vad,
                    word_timestamps=word_timestamps,
                    batch_size=BATCH_SIZE,
                )
            else:
                segments, info = transcriber.transcribe(
                    path,
                    language=language or None,
                    vad_filter=vad,
                    word_timestamps=word_timestamps,
                )
            duration = float(info.duration) if getattr(info, "duration", None) else None
            _set_job(job, duration=duration)
            processed = 0.0
            for segment in segments:
                if _cancelled(job):
                    _finish_cancelled(job)
                    return
                processed = max(processed, float(segment.end or 0.0))
                progress = min(0.99, processed / duration) if duration and duration > 0 else None
                if diarize:
                    words = [
                        {"start": word.start, "end": word.end, "word": word.word}
                        for word in (getattr(segment, "words", None) or [])
                    ]
                    pieces = segments_for(start=segment.start, end=segment.end, text=segment.text, words=words, turns=turns)
                else:
                    pieces = [{"start": segment.start, "end": segment.end, "text": segment.text}]
                _set_job(
                    job,
                    segments=pieces,
                    progress=progress,
                    processed=processed,
                    duration=duration,
                    message="Transcribing audio",
                )
        except Exception as error:
            _set_job(
                job,
                state="failed",
                message="Whisper could not read the recording",
                detail=f"Could not decode audio ({type(error).__name__}).",
                retryable=False,
            )
            return

        result = {
            "language": info.language,
            "duration": duration,
            "segments": job["segments"],
        }
        _set_job(
            job,
            state="ready",
            progress=1.0,
            processed=duration,
            duration=duration,
            message="Transcript ready",
            result=result,
            retryable=False,
        )
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


def _should_diarize(requested: bool | None) -> bool:
    """The service decides whether it can diarize; a job may only opt out."""
    return DIARIZATION_ENABLED and requested is not False


def _speaker_hints(exact: int | None, low: int | None, high: int | None) -> dict[str, int]:
    """Optional speaker-count hints; automatic detection when none are given.

    Per-job values win over the service defaults. An exact count excludes a range.
    """
    def valid(value: int | None) -> int | None:
        return value if value is not None and 1 <= value <= 20 else None

    exact = valid(exact)
    if exact:
        return {"num_speakers": exact}
    low, high = valid(low) or MIN_SPEAKERS, valid(high) or MAX_SPEAKERS
    if low and high and low > high:
        low = high = None
    hints: dict[str, int] = {}
    if low:
        hints["min_speakers"] = low
    if high:
        hints["max_speakers"] = high
    return hints


@app.get("/health")
async def health():
    with JOBS_LOCK:
        _cleanup_jobs()
        states = [job["state"] for job in JOBS.values()]
    return {
        "ok": True,
        "active": sum(state in ACTIVE_STATES for state in states),
        "queued": states.count("queued"),
        "workers": MAX_WORKERS,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "cpu_threads": CPU_THREADS or None,
        "batch_size": BATCH_SIZE,
        "word_timestamps": WORD_TIMESTAMPS_DEFAULT or DIARIZATION_ENABLED,
        # The model name is public; the Hugging Face token is never exposed.
        "diarization": DIARIZATION_ENABLED,
        "diarization_model": DIARIZATION_MODEL if DIARIZATION_ENABLED else None,
    }


@app.post("/jobs/{job_key}")
async def start_job(
    job_key: str,
    file: UploadFile = File(...),
    model: str | None = Form(None),
    language: str | None = Form(None),
    vad: bool = Form(True),
    word_timestamps: bool = Form(WORD_TIMESTAMPS_DEFAULT),
    diarize: bool | None = Form(None),
    num_speakers: int | None = Form(None),
    min_speakers: int | None = Form(None),
    max_speakers: int | None = Form(None),
    authorization: str | None = Header(None),
):
    authorize(authorization)
    if not JOB_KEY.fullmatch(job_key):
        raise HTTPException(status_code=400, detail="Invalid transcription job key")

    with JOBS_LOCK:
        _cleanup_jobs()
        existing = JOBS.get(job_key)
        # A cancelled run or a temporary service-side failure may be restarted
        # by Payload's retry using the same logical key. Ready work is reused.
        if existing and (existing["state"] == "cancelled" or (existing["state"] == "failed" and existing.get("retryable") is True)):
            JOBS.pop(job_key, None)
            try:
                os.unlink(str(existing["path"]))
            except FileNotFoundError:
                pass
            existing = None
        if existing:
            return JSONResponse(_snapshot(existing), status_code=200 if existing["state"] == "ready" else 202)

    suffix = os.path.splitext(file.filename or "")[1] or ".audio"
    fd, path = tempfile.mkstemp(prefix="byline-whisper-", suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
    except Exception:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
        raise

    now = time.time()
    job = {
        "key": job_key,
        "state": "queued",
        "progress": None,
        "processed": None,
        "duration": None,
        "message": "Waiting for transcription worker",
        "detail": None,
        "retryable": None,
        "result": None,
        "segments": [],
        "path": path,
        "model": model or os.environ.get("WHISPER_MODEL", "small"),
        "language": language,
        "vad": vad,
        "word_timestamps": word_timestamps,
        "diarize": _should_diarize(diarize),
        "speaker_hints": _speaker_hints(num_speakers, min_speakers, max_speakers),
        "cancel": Event(),
        "created_at": now,
        "updated_at": now,
        "finished_at": None,
    }
    with JOBS_LOCK:
        # Another request may have won while this upload was being copied.
        existing = JOBS.get(job_key)
        if existing:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass
            return JSONResponse(_snapshot(existing), status_code=200 if existing["state"] == "ready" else 202)
        JOBS[job_key] = job
        snapshot = _snapshot(job)
    EXECUTOR.submit(_run_job, job)
    return JSONResponse(snapshot, status_code=202)


@app.get("/jobs/{job_key}")
async def get_job(job_key: str, authorization: str | None = Header(None)):
    authorize(authorization)
    with JOBS_LOCK:
        _cleanup_jobs()
        job = JOBS.get(job_key)
        if not job:
            raise HTTPException(status_code=404, detail="Transcription job not found")
        return _snapshot(job)


@app.delete("/jobs/{job_key}")
async def cancel_job(job_key: str, authorization: str | None = Header(None)):
    authorize(authorization)
    with JOBS_LOCK:
        job = JOBS.get(job_key)
        if not job:
            raise HTTPException(status_code=404, detail="Transcription job not found")
        if job["state"] not in {"ready", "failed", "cancelled"}:
            job["cancel"].set()
            if job["state"] == "queued":
                job.update(
                    state="cancelled",
                    message="Transcription cancelled",
                    detail="The transcription was cancelled.",
                    retryable=True,
                    finished_at=time.time(),
                    updated_at=time.time(),
                )
        return _snapshot(job)
