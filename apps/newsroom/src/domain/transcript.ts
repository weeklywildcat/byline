/**
 * Transcripts (docs/reporting.md#transcripts): Byline's own provider-neutral
 * representation. A provider (faster-whisper, a manual import) produces a
 * `NormalizedTranscript`; nothing provider-shaped is stored as the canonical
 * record or reaches the screens.
 *
 * Segment ids are stable: editing text or a speaker keeps a segment's id and
 * timing, so selections and links into a transcript survive edits.
 *
 * Pure: shared by the server, the import endpoint and the transcript screen.
 */

export type TranscriptSegment = {
  id: string;
  startMs: number | null;
  endMs: number | null;
  /** What the transcript shows: a machine label (`SPEAKER_00`) until a reporter names the person. */
  speaker?: string;
  /**
   * The stable machine identity of a diarized voice (`SPEAKER_00`), scoped to
   * this one transcript. Renaming changes `speaker`, never this key, so a
   * second rename still reaches every passage that voice spoke. It is not an
   * identity across recordings.
   */
  speakerKey?: string;
  text: string;
};

export type NormalizedTranscript = {
  language: string | null;
  durationMs: number | null;
  segments: TranscriptSegment[];
};

export const TRANSCRIPT_LIMITS = {
  segments: 20_000,
  segmentText: 4000,
  speaker: 120,
  speakerKey: 40,
  importBytes: 5 * 1024 * 1024
} as const;

/** A machine diarization label: `SPEAKER_00`, `SPEAKER_01`... Valid only within one transcript. */
const MACHINE_SPEAKER = /^SPEAKER_\d{2,3}$/;

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

function ms(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

/** A short, stable id for a new segment: `s` + index, kept for the transcript's lifetime. */
export function segmentId(index: number): string {
  return `s${index.toString(36)}`;
}

/**
 * Validates and bounds segments from any producer. Unknown fields are dropped;
 * missing ids are assigned in order; duplicate ids are made unique; an end
 * before its start is dropped rather than trusted.
 */
export function normalizeSegments(input: unknown): TranscriptSegment[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: TranscriptSegment[] = [];
  for (const raw of input.slice(0, TRANSCRIPT_LIMITS.segments)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const text = clean(record.text, TRANSCRIPT_LIMITS.segmentText);
    if (!text) continue;
    let id = typeof record.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(record.id) ? record.id : segmentId(out.length);
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const startMs = ms(record.startMs);
    let endMs = ms(record.endMs);
    if (startMs !== null && endMs !== null && endMs < startMs) endMs = null;
    const speaker = clean(record.speaker, TRANSCRIPT_LIMITS.speaker);
    // A machine label stored before keys existed is its own key.
    const given = typeof record.speakerKey === "string" ? record.speakerKey : speaker;
    const key = MACHINE_SPEAKER.test(given) ? given : "";
    out.push({ id, startMs, endMs, ...(speaker ? { speaker } : {}), ...(key ? { speakerKey: key } : {}), text });
  }
  return out;
}

export function normalizeTranscript(input: { language?: unknown; durationMs?: unknown; segments?: unknown }): NormalizedTranscript {
  const segments = normalizeSegments(input.segments);
  const language = typeof input.language === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(input.language) ? input.language : null;
  const lastEnd = segments.reduce<number | null>((max, segment) => (segment.endMs !== null && (max === null || segment.endMs > max) ? segment.endMs : max), null);
  return { language, durationMs: ms(input.durationMs) ?? lastEnd, segments };
}

/** The plain-text projection stored for search (speaker and words, one segment per line). */
export function transcriptSearchText(segments: readonly unknown[]): string {
  return normalizeSegments(segments).map((segment) => {
    const label = speakerLabel(segment);
    return label ? `${label}: ${segment.text}` : segment.text;
  }).join("\n").slice(0, 2_000_000);
}

/* ------------------------------------------------------------------ import */

export type TranscriptFormat = "txt" | "srt" | "vtt";

export class TranscriptImportError extends Error {}

export function transcriptFormat(filename: string, mimeType = ""): TranscriptFormat | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".vtt") || mimeType === "text/vtt") return "vtt";
  if (name.endsWith(".srt") || mimeType === "application/x-subrip") return "srt";
  if (name.endsWith(".txt") || mimeType === "text/plain") return "txt";
  return null;
}

/** `HH:MM:SS,mmm`, `HH:MM:SS.mmm` or `MM:SS.mmm` → milliseconds. */
export function parseTimestamp(value: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const [, hours = "0", minutes, seconds, fraction = "0"] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, "0"));
}

/** A leading `Speaker:` / `<v Speaker>` on a cue becomes the segment's speaker. */
function splitSpeaker(text: string): { speaker?: string; text: string } {
  const voice = /^<v(?:\.[^ >]+)?\s+([^>]{1,120})>([\s\S]*)$/.exec(text);
  if (voice) return { speaker: voice[1].trim(), text: voice[2].trim().replace(/<\/v>$/, "") };
  const label = /^([A-Z][\w .'-]{0,60}):\s+(.+)$/.exec(text);
  if (label && label[1].split(" ").length <= 4) return { speaker: label[1].trim(), text: label[2].trim() };
  return { text };
}

const CUE_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };

/** Turn subtitle formatting into plain text. Read each entity once and leave
 * unsupported markup as spoken text for the renderer to escape. */
function cueText(value: string): string {
  return value.replace(/<\/?(?:b|i|u|c|ruby|rt|lang|v)(?:[ .][^<>]*)?>|<(?:\d{1,3}:)?\d{1,2}:\d{2}\.\d{3}>|&(?:amp|lt|gt|nbsp);/gi,
    (token) => CUE_ENTITIES[token.toLowerCase()] ?? "").trim();
}

function parseCues(source: string, format: "srt" | "vtt"): TranscriptSegment[] {
  const blocks = source.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split(/\n{2,}/);
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;
    if (format === "vtt" && /^(NOTE|STYLE|REGION)\b/.test(lines[0] ?? "")) continue;
    const [start, end] = lines[timeIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const startMs = parseTimestamp(start ?? "");
    const endMs = parseTimestamp(end ?? "");
    if (startMs === null) throw new TranscriptImportError(`Line "${lines[timeIndex]}" has an unreadable timestamp.`);
    const raw = lines.slice(timeIndex + 1).join(" ").trim();
    const parts = splitSpeaker(raw);
    const text = cueText(parts.text);
    if (!text) continue;
    segments.push({ id: segmentId(segments.length), startMs, endMs: endMs !== null && endMs >= startMs ? endMs : null, ...(parts.speaker ? { speaker: cueText(parts.speaker) } : {}), text });
  }
  return segments;
}

/** Plain text: one paragraph per segment, untimed; a `[00:12:41]` prefix is honored when present. */
function parsePlain(source: string): TranscriptSegment[] {
  const paragraphs = source.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split(/\n\s*\n|\n(?=\[\d{1,2}:\d{2}(?::\d{2})?\])/);
  const segments: TranscriptSegment[] = [];
  for (const paragraph of paragraphs) {
    let text = paragraph.replace(/\s+/g, " ").trim();
    if (!text) continue;
    let startMs: number | null = null;
    const stamp = /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\]\s*/.exec(text);
    if (stamp) {
      startMs = parseTimestamp(stamp[1]);
      text = text.slice(stamp[0].length);
    }
    const parts = splitSpeaker(text);
    segments.push({ id: segmentId(segments.length), startMs, endMs: null, ...(parts.speaker ? { speaker: parts.speaker } : {}), text: parts.text });
  }
  return segments;
}

/**
 * Parses an imported transcript file. A manual import is labelled MANUAL
 * TRANSCRIPT; plain text without timestamps produces untimed segments.
 */
export function parseTranscriptFile(source: string, format: TranscriptFormat): NormalizedTranscript {
  if (source.length > TRANSCRIPT_LIMITS.importBytes) throw new TranscriptImportError("That transcript is too large to import.");
  const segments = format === "txt" ? parsePlain(source) : parseCues(source, format);
  if (format === "vtt" && !/^﻿?WEBVTT/.test(source.trimStart())) throw new TranscriptImportError("A .vtt file must start with WEBVTT.");
  if (!segments.length) throw new TranscriptImportError("That file has no transcript text.");
  // Consecutive untimed end times: each cue ends where the next begins.
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const next = segments[index + 1];
    if (segment.endMs === null && segment.startMs !== null && next.startMs !== null && next.startMs >= segment.startMs) segment.endMs = next.startMs;
  }
  return normalizeTranscript({ segments });
}

/* ------------------------------------------------------------------ search */

export type TranscriptMatch = { segmentId: string; start: number; end: number };

/** Case-insensitive matches in segment text and speaker names, in reading order. */
export function searchTranscript(segments: readonly TranscriptSegment[], query: string): TranscriptMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const matches: TranscriptMatch[] = [];
  for (const segment of segments) {
    const speakerHit = (speakerLabel(segment) ?? "").toLowerCase().includes(needle);
    const haystack = segment.text.toLowerCase();
    let from = 0;
    let found = false;
    while (matches.length < 5000) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      matches.push({ segmentId: segment.id, start: at, end: at + needle.length });
      found = true;
      from = at + needle.length;
    }
    if (!found && speakerHit) matches.push({ segmentId: segment.id, start: -1, end: -1 });
  }
  return matches;
}

/** The segment playing at `positionMs`: the last one that started at or before it. */
export function activeSegmentAt(segments: readonly TranscriptSegment[], positionMs: number): string | null {
  let active: string | null = null;
  for (const segment of segments) {
    if (segment.startMs === null) continue;
    if (segment.startMs > positionMs) break;
    active = segment.endMs === null || positionMs <= segment.endMs + 1500 ? segment.id : active;
  }
  return active;
}

/* ------------------------------------------------------------------- edits */

/** Edits one segment's words or speaker, keeping its id and timing (provenance). */
export function editSegment(segments: readonly TranscriptSegment[], id: string, patch: { text?: string; speaker?: string | null }): TranscriptSegment[] {
  return segments.map((segment) => {
    if (segment.id !== id) return segment;
    const text = patch.text !== undefined ? clean(patch.text, TRANSCRIPT_LIMITS.segmentText) || segment.text : segment.text;
    const speakerValue = patch.speaker === undefined ? segment.speaker : clean(patch.speaker ?? "", TRANSCRIPT_LIMITS.speaker);
    // A hand-set speaker for one passage is a correction, not the machine's
    // voice: it leaves the diarized identity so renaming that voice later does
    // not overwrite the reporter's correction.
    const { speaker: _old, speakerKey: key, ...rest } = segment;
    const keepKey = patch.speaker === undefined && key ? { speakerKey: key } : {};
    return { ...rest, ...keepKey, text, ...(speakerValue ? { speaker: speakerValue } : {}) };
  });
}

/** `SPEAKER_00` → `Speaker 1`; anything that is not a machine label → null. */
export function machineSpeakerLabel(raw: string | undefined): string | null {
  const match = raw ? /^SPEAKER_(\d{2,3})$/.exec(raw) : null;
  return match ? `Speaker ${Number(match[1]) + 1}` : null;
}

/** The speaker as shown: a reporter's name, else `Speaker N` for a machine label, else nothing. */
export function speakerLabel(segment: Pick<TranscriptSegment, "speaker" | "speakerKey">): string | undefined {
  if (segment.speaker) return machineSpeakerLabel(segment.speaker) ?? segment.speaker;
  return machineSpeakerLabel(segment.speakerKey) ?? undefined;
}

/** The stable identity a passage belongs to within this transcript, or null when unattributed. */
export function speakerIdentity(segment: Pick<TranscriptSegment, "speaker" | "speakerKey">): string | null {
  return segment.speakerKey ?? segment.speaker ?? null;
}

/**
 * Renames a speaker everywhere ("Speaker 1" → "Coach Smith"). Timing, ids and
 * words never change. By `key` (a diarized voice) it reaches every passage that
 * voice spoke, even after an earlier rename; otherwise it matches the shown
 * name. An empty name returns a diarized voice to its machine label.
 */
export function renameSpeaker(segments: readonly TranscriptSegment[], from: string, to: string, key?: string | null): TranscriptSegment[] {
  const next = clean(to, TRANSCRIPT_LIMITS.speaker);
  return segments.map((segment) => {
    const matches = key ? segment.speakerKey === key : segment.speaker === from || speakerLabel(segment) === from;
    if (!matches || (!key && !segment.speaker)) return segment;
    const { speaker: _old, ...rest } = segment;
    if (next) return { ...rest, speaker: next };
    return segment.speakerKey ? { ...rest, speaker: segment.speakerKey } : rest;
  });
}

/** The distinct speakers as shown, in order of first appearance. */
export function speakersOf(segments: readonly TranscriptSegment[]): string[] {
  return [...new Set(segments.map(speakerLabel).filter((speaker): speaker is string => Boolean(speaker)))];
}

export type SpeakerProfile = {
  /** Stable within this transcript: the diarized key, or the name for an import. */
  key: string;
  label: string;
  /** A reporter (or an import) supplied this name; false for `Speaker N`. */
  named: boolean;
  /** The `speaker` value stored on the passages today (for a rename by name). */
  stored: string;
  passages: number;
  spokenMs: number;
  /** A representative passage to play and recognise the voice by. */
  sample: { segmentId: string; startMs: number; endMs: number | null; text: string } | null;
};

/** Passages long enough to be recognisable, short enough to read at a glance. */
const SAMPLE_MIN = 24;
const SAMPLE_MAX = 200;

/** One entry per detected voice (the Speakers panel), in order of first appearance. */
export function speakerProfiles(segments: readonly TranscriptSegment[]): SpeakerProfile[] {
  const byKey = new Map<string, TranscriptSegment[]>();
  for (const segment of segments) {
    const key = speakerIdentity(segment);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), segment]);
  }
  return [...byKey].map(([key, own]) => {
    const first = own[0];
    const stored = first.speaker ?? first.speakerKey ?? key;
    const timed = own.filter((segment) => segment.startMs !== null);
    const candidates = timed.filter((segment) => segment.text.length >= SAMPLE_MIN && segment.text.length <= SAMPLE_MAX);
    const pick = candidates.reduce<TranscriptSegment | null>((best, segment) => (best === null || segment.text.length > best.text.length ? segment : best), null) ?? timed[0] ?? null;
    return {
      key,
      label: speakerLabel(first) ?? key,
      named: machineSpeakerLabel(first.speaker) === null && Boolean(first.speaker),
      stored,
      passages: own.length,
      spokenMs: own.reduce((total, segment) => total + (segment.startMs !== null && segment.endMs !== null ? Math.max(0, segment.endMs - segment.startMs) : 0), 0),
      sample: pick ? { segmentId: pick.id, startMs: pick.startMs!, endMs: pick.endMs, text: pick.text } : null
    };
  });
}

export type SpeakerTurn = {
  /** The first passage's id, stable while later passages join the turn. */
  id: string;
  identity: string | null;
  label: string | undefined;
  segments: TranscriptSegment[];
};

/** A pause longer than this starts a new turn even for the same speaker. */
export const TURN_GAP_MS = 8000;

/**
 * Groups consecutive passages by the same speaker into conversational turns
 * (display only: every segment keeps its own id and timing). An unattributed
 * passage never joins a neighbour, so it is never read as someone's words.
 */
export function speakerTurns(segments: readonly TranscriptSegment[], gapMs: number = TURN_GAP_MS): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  for (const segment of segments) {
    const identity = speakerIdentity(segment);
    const turn = turns.at(-1);
    const previous = turn?.segments.at(-1);
    const gap = previous && previous.endMs !== null && segment.startMs !== null ? segment.startMs - previous.endMs : 0;
    if (turn && identity !== null && turn.identity === identity && gap <= gapMs) {
      turn.segments.push(segment);
    } else {
      turns.push({ id: segment.id, identity, label: speakerLabel(segment), segments: [segment] });
    }
  }
  return turns;
}

/** `12:41` / `1:02:03` for a position. */
export function formatPosition(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "--:--";
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(hours ? 2 : 1, "0");
  return `${hours ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The words and timing a selection snapshots, from the segments it spans.
 * `text` is the exact selected words when given (a part of one segment);
 * otherwise the segments' full text.
 */
export function selectionFromSegments(segments: readonly TranscriptSegment[], ids: readonly string[], text?: string): { text: string; startMs: number | null; endMs: number | null; speaker: string | null; segmentIds: string[] } | null {
  const chosen = segments.filter((segment) => ids.includes(segment.id));
  if (!chosen.length) return null;
  const words = clean(text ?? chosen.map((segment) => segment.text).join(" "), 4000);
  if (!words) return null;
  const speakers = speakersOf(chosen);
  return {
    text: words,
    startMs: chosen[0].startMs,
    endMs: chosen.at(-1)!.endMs ?? chosen.at(-1)!.startMs,
    speaker: speakers.length === 1 ? speakers[0] : null,
    segmentIds: chosen.map((segment) => segment.id)
  };
}
