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
from faster_whisper import WhisperModel

app = FastAPI(title="Byline transcription")
TOKEN = os.environ.get("BYLINE_TRANSCRIPTION_TOKEN", "").strip()
JOB_TTL_SECONDS = max(300, int(os.environ.get("WHISPER_JOB_TTL_SECONDS", str(6 * 60 * 60))))
MAX_WORKERS = max(1, int(os.environ.get("WHISPER_MAX_WORKERS", "1")))
JOB_KEY = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")
EXECUTOR = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="byline-whisper")
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = Lock()


@lru_cache(maxsize=2)
def load(model: str) -> WhisperModel:
    return WhisperModel(
        model,
        device=os.environ.get("WHISPER_DEVICE", "auto"),
        compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "default"),
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
    }
    if job.get("detail"):
        result["detail"] = job["detail"]
    if job.get("retryable") is not None:
        result["retryable"] = bool(job["retryable"])
    if job.get("result") is not None:
        result["result"] = job["result"]
    return result


def _set_job(job: dict[str, Any], **changes: Any) -> None:
    with JOBS_LOCK:
        if JOBS.get(job["key"]) is not job:
            return
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
        word_timestamps = bool(job["word_timestamps"])

    try:
        if _cancelled(job):
            _finish_cancelled(job)
            return

        _set_job(job, state="loading-model", message="Loading Whisper model", progress=None)
        try:
            model = load(model_name)
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
            segments, info = model.transcribe(
                path,
                language=language or None,
                vad_filter=vad,
                word_timestamps=word_timestamps,
            )
            duration = float(info.duration) if getattr(info, "duration", None) else None
            _set_job(job, duration=duration)
            rows: list[dict[str, Any]] = []
            processed = 0.0
            for segment in segments:
                if _cancelled(job):
                    _finish_cancelled(job)
                    return
                processed = max(processed, float(segment.end or 0.0))
                progress = min(0.99, processed / duration) if duration and duration > 0 else None
                rows.append({"start": segment.start, "end": segment.end, "text": segment.text})
                _set_job(
                    job,
                    state="transcribing",
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
            "segments": rows,
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


@app.get("/health")
async def health():
    with JOBS_LOCK:
        _cleanup_jobs()
        states = [job["state"] for job in JOBS.values()]
    return {
        "ok": True,
        "active": sum(state in {"loading-model", "transcribing"} for state in states),
        "queued": states.count("queued"),
        "workers": MAX_WORKERS,
    }


@app.post("/jobs/{job_key}")
async def start_job(
    job_key: str,
    file: UploadFile = File(...),
    model: str | None = Form(None),
    language: str | None = Form(None),
    vad: bool = Form(True),
    word_timestamps: bool = Form(True),
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
        "path": path,
        "model": model or os.environ.get("WHISPER_MODEL", "small"),
        "language": language,
        "vad": vad,
        "word_timestamps": word_timestamps,
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
    EXECUTOR.submit(_run_job, job)
    return JSONResponse(_snapshot(job), status_code=202)


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
