"""Local speaker diarization with pyannote (the only module that imports it).

Everything pyannote-specific stays behind ``diarize()``. Callers get a plain
timeline, ``[{"start": 0.4, "end": 4.8, "speaker": "SPEAKER_00"}, ...]``, and
never see a pyannote object. The recording is diarized once, whole, so one
consistent speaker clustering covers the entire interview: labels from
separately diarized chunks would not refer to the same people.

The Hugging Face token is read from the environment once, handed to
``Pipeline.from_pretrained`` and never logged, returned or stored on a job.
Errors surface only as their exception class name for the same reason.

Heavy imports (torch, pyannote) happen lazily so a service with diarization
turned off needs neither installed.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any, Callable

from speakers import normalize_turns

log = logging.getLogger("byline.diarization")

# Share of the progress bar each pyannote step represents (steps that report
# `completed`/`total`). Steps not listed leave the bar where it is.
STEP_RANGES: dict[str, tuple[float, float]] = {
    "segmentation": (0.0, 0.35),
    "speaker_counting": (0.35, 0.40),
    "embeddings": (0.40, 0.95),
    "discrete_diarization": (0.95, 0.99),
}


class DiarizationCancelled(Exception):
    """Raised from inside pyannote's progress hook to stop work promptly."""


class DiarizationUnavailable(Exception):
    """The speaker model could not be loaded. ``retryable`` tells the job whether trying again can help."""

    def __init__(self, reason: str, retryable: bool) -> None:
        super().__init__(reason)
        self.retryable = retryable


def hook_progress(step: str, total: Any, completed: Any) -> float | None:
    """Map one pyannote hook call to 0..1 for the whole diarization stage."""
    window = STEP_RANGES.get(step)
    if window is None:
        return None
    try:
        total_n, done_n = float(total), float(completed)
    except (TypeError, ValueError):
        return window[0]
    fraction = 0.0 if total_n <= 0 else max(0.0, min(1.0, done_n / total_n))
    return window[0] + (window[1] - window[0]) * fraction


def _is_auth_failure(error: Exception) -> bool:
    """A missing/invalid token or an ungated model will not fix itself on retry."""
    if type(error).__name__ in {"GatedRepoError", "RepositoryNotFoundError", "LocalEntryNotFoundError", "OfflineModeIsEnabled"}:
        return True
    status = getattr(getattr(error, "response", None), "status_code", None)
    return status in {401, 403, 404} or isinstance(error, (PermissionError, FileNotFoundError))


@lru_cache(maxsize=1)
def load_pipeline(model: str, token: str, device: str) -> Any:
    """Load (and cache) the pyannote pipeline. ``token`` may be empty for a local model directory."""
    try:
        import torch  # noqa: WPS433 (lazy on purpose)
        from pyannote.audio import Pipeline
    except ImportError as error:
        raise DiarizationUnavailable("pyannote.audio is not installed", retryable=False) from error
    try:
        if os.path.exists(model):
            pipeline = Pipeline.from_pretrained(model)
        else:
            pipeline = Pipeline.from_pretrained(model, token=token or None)
    except Exception as error:  # noqa: BLE001
        # Only the class name: the message may echo a URL or header.
        log.warning("Speaker model could not be loaded (%s)", type(error).__name__)
        raise DiarizationUnavailable(type(error).__name__, retryable=not _is_auth_failure(error)) from error
    if pipeline is None:
        # from_pretrained returns None for a gated model the token cannot open.
        raise DiarizationUnavailable("GatedModel", retryable=False)
    pipeline.to(torch.device(device))
    return pipeline


def _timeline(output: Any) -> list[dict[str, Any]]:
    """Exclusive diarization when the model provides it, else the ordinary result."""
    annotation = getattr(output, "exclusive_speaker_diarization", None)
    if annotation is None:
        annotation = getattr(output, "speaker_diarization", None)
    if annotation is None:
        annotation = output
    return [
        {"start": float(turn.start), "end": float(turn.end), "speaker": str(speaker)}
        for turn, _track, speaker in annotation.itertracks(yield_label=True)
    ]


def diarize(
    audio: Any,
    *,
    pipeline: Any,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
    on_progress: Callable[[float], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    """Run speaker diarization once over a whole recording.

    ``audio`` is a pyannote-ready mapping ``{"waveform": (1, n) tensor,
    "sample_rate": 16000}``. Speaker-count hints are optional; automatic
    detection is the normal path.
    """
    last = 0.0

    def hook(step_name: str, step_artifact: Any = None, file: Any = None, total: Any = None, completed: Any = None) -> None:
        nonlocal last
        if cancelled and cancelled():
            raise DiarizationCancelled()
        value = hook_progress(step_name, total, completed)
        if value is not None and on_progress is not None and value >= last:
            last = value
            on_progress(value)

    hints: dict[str, int] = {}
    if num_speakers:
        hints["num_speakers"] = num_speakers
    else:
        if min_speakers:
            hints["min_speakers"] = min_speakers
        if max_speakers:
            hints["max_speakers"] = max_speakers
    output = pipeline(audio, hook=hook, **hints)
    return normalize_turns(_timeline(output))


def load_audio(path: str) -> dict[str, Any]:
    """Decode with the same PyAV path faster-whisper uses, so any recording Whisper reads can be diarized."""
    import torch  # noqa: WPS433
    from faster_whisper.audio import decode_audio

    samples = decode_audio(path, sampling_rate=16000)
    return {"waveform": torch.from_numpy(samples).unsqueeze(0), "sample_rate": 16000}
