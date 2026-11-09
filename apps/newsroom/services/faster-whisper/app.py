"""Byline's optional self-hosted transcription service (docs/reporting.md#transcription).

A small HTTP wrapper around faster-whisper with the contract Byline's
`faster-whisper` provider expects:

    POST /transcribe   multipart: file, model?, language?, vad=true, word_timestamps=true
    200 {"language": "en", "duration": 61.2, "segments": [{"start": 0.0, "end": 4.1, "text": "..."}]}
    4xx {"detail": "..."}   the audio was refused (Byline records it, never retries)
    5xx                      temporary (Byline retries with backoff)

The model and device are configuration, never hard-coded:
  WHISPER_MODEL (default "small"), WHISPER_DEVICE ("auto" | "cpu" | "cuda"),
  WHISPER_COMPUTE_TYPE (default "default"), BYLINE_TRANSCRIPTION_TOKEN (optional bearer token).
Audio never leaves this machine. Keep the service on the newsroom's private network.
"""
import os
import tempfile
from functools import lru_cache

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI(title="Byline transcription")
TOKEN = os.environ.get("BYLINE_TRANSCRIPTION_TOKEN", "").strip()


@lru_cache(maxsize=2)
def load(model: str) -> WhisperModel:
    return WhisperModel(model, device=os.environ.get("WHISPER_DEVICE", "auto"), compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "default"))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str | None = Form(None),
    language: str | None = Form(None),
    vad: bool = Form(True),
    word_timestamps: bool = Form(True),
    authorization: str | None = Header(None),
):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    name = model or os.environ.get("WHISPER_MODEL", "small")
    suffix = os.path.splitext(file.filename or "")[1] or ".audio"
    with tempfile.NamedTemporaryFile(suffix=suffix) as handle:
        handle.write(await file.read())
        handle.flush()
        try:
            segments, info = load(name).transcribe(handle.name, language=language or None, vad_filter=vad, word_timestamps=word_timestamps)
            rows = [{"start": s.start, "end": s.end, "text": s.text} for s in segments]
        except Exception as error:  # Unreadable or unsupported audio: permanent for this file.
            raise HTTPException(status_code=422, detail=f"Could not decode audio: {type(error).__name__}") from error
    return {"language": info.language, "duration": info.duration, "segments": rows}
