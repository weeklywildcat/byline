"""Speaker attribution for Byline transcripts: pure, deterministic, model-free.

The neural work (pyannote) lives in ``diarization.py``. This module only turns
its simple speaker timeline plus faster-whisper's timed words into
speaker-labelled transcript segments, so it can be tested with fixtures and
never needs torch, pyannote or a Hugging Face token.

    turns   [{"start": 0.4, "end": 4.8, "speaker": "SPEAKER_00"}, ...]
    words   [{"start": 10.0, "end": 10.3, "word": " Did"}, ...]
    →       [{"start": 10.0, "end": 12.8, "text": "Did you expect that?", "speaker": "SPEAKER_00"}, ...]

Rules (docs/reporting.md#speaker-diarization):

* A word belongs to the speaker whose turn overlaps it most; a tie goes to the
  speaker at the word's midpoint.
* A word in a gap between turns (silence, a VAD edge) joins the nearest turn
  only when it is within ``MAX_GAP_SECONDS``; otherwise it is *unknown*.
  Unknown words are never attributed to a person. They carry no speaker.
* Consecutive words for one speaker become one segment; a change of speaker
  starts a new one. Start/end come from the first/last timed word.
* Machine labels (``SPEAKER_00``...) are scoped to one recording. They are
  renumbered by first appearance so ``SPEAKER_00`` is whoever speaks first.
"""
from __future__ import annotations

from typing import Any, Iterable, Sequence

# A word this close to a turn (but outside it) still belongs to that turn.
MAX_GAP_SECONDS = 0.75

Turn = dict[str, Any]
Word = dict[str, Any]
Segment = dict[str, Any]


def machine_label(index: int) -> str:
    return f"SPEAKER_{index:02d}"


def normalize_turns(raw: Iterable[Turn]) -> list[Turn]:
    """Validate, sort and relabel a speaker timeline.

    Drops empty or malformed turns, orders by time, and renames speakers
    ``SPEAKER_00``, ``SPEAKER_01``... in order of first appearance so the labels
    do not depend on the model's internal cluster numbering.
    """
    cleaned: list[tuple[float, float, str]] = []
    for turn in raw:
        try:
            start = float(turn["start"])
            end = float(turn["end"])
            speaker = str(turn["speaker"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (start >= 0 and end > start):
            continue
        cleaned.append((start, end, speaker))
    cleaned.sort(key=lambda item: (item[0], item[1]))
    names: dict[str, str] = {}
    turns: list[Turn] = []
    for start, end, speaker in cleaned:
        if speaker not in names:
            names[speaker] = machine_label(len(names))
        turns.append({"start": start, "end": end, "speaker": names[speaker]})
    return turns


def _overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def speaker_for_span(turns: Sequence[Turn], start: float, end: float) -> str | None:
    """The speaker for one span of audio, or ``None`` when no turn supports it."""
    if end < start:
        start, end = end, start
    midpoint = (start + end) / 2
    overlaps: dict[str, float] = {}
    at_midpoint: str | None = None
    nearest: tuple[float, str] | None = None
    for turn in turns:
        t_start, t_end = float(turn["start"]), float(turn["end"])
        if t_start > end + MAX_GAP_SECONDS:
            break  # turns are sorted: nothing later can be close enough
        shared = _overlap(start, end, t_start, t_end)
        if shared > 0 or (start == end and t_start <= start <= t_end):
            overlaps[turn["speaker"]] = overlaps.get(turn["speaker"], 0.0) + max(shared, 1e-9)
        if t_start <= midpoint <= t_end and at_midpoint is None:
            at_midpoint = turn["speaker"]
        gap = 0.0 if t_start <= midpoint <= t_end else min(abs(midpoint - t_start), abs(midpoint - t_end))
        if nearest is None or gap < nearest[0]:
            nearest = (gap, turn["speaker"])
    if overlaps:
        best = max(overlaps.values())
        leaders = [speaker for speaker, value in overlaps.items() if abs(value - best) < 1e-6]
        if len(leaders) == 1:
            return leaders[0]
        # Genuinely ambiguous (overlapping speech): the midpoint decides.
        if at_midpoint in leaders:
            return at_midpoint
        return leaders[0]
    if nearest is not None and nearest[0] <= MAX_GAP_SECONDS:
        return nearest[1]
    return None


def _clean(text: str) -> str:
    return " ".join(text.split())


def _word_span(word: Word) -> tuple[float, float] | None:
    try:
        start, end = float(word["start"]), float(word["end"])
    except (KeyError, TypeError, ValueError):
        return None
    if start < 0 or end < start:
        return None
    return start, end


def segments_for(
    *,
    start: float,
    end: float,
    text: str,
    words: Sequence[Word] | None,
    turns: Sequence[Turn],
) -> list[Segment]:
    """Speaker-labelled Byline segments for one Whisper segment.

    Falls back to a single segment attributed by the Whisper segment's own span
    when it has no usable word timing. Never invents or drops words.
    """
    timed = [(word, span) for word in (words or []) if (span := _word_span(word)) is not None and _clean(str(word.get("word", "")))]
    if not timed:
        result: Segment = {"start": start, "end": end, "text": text}
        speaker = speaker_for_span(turns, start, end)
        if speaker:
            result["speaker"] = speaker
        return [result]

    runs: list[dict[str, Any]] = []
    for word, (w_start, w_end) in timed:
        speaker = speaker_for_span(turns, w_start, w_end)
        if runs and runs[-1]["speaker"] == speaker:
            run = runs[-1]
            run["end"] = w_end
            run["words"].append(str(word["word"]))
        else:
            runs.append({"speaker": speaker, "start": w_start, "end": w_end, "words": [str(word["word"])]})

    segments: list[Segment] = []
    for run in runs:
        piece = _clean("".join(run["words"]))
        if not piece:
            continue
        segment: Segment = {"start": run["start"], "end": run["end"], "text": piece}
        if run["speaker"]:
            segment["speaker"] = run["speaker"]
        segments.append(segment)
    return segments


def speaker_count(segments: Iterable[Segment]) -> int:
    return len({segment["speaker"] for segment in segments if segment.get("speaker")})
