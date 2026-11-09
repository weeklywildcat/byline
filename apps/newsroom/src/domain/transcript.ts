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
  speaker?: string;
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
  importBytes: 5 * 1024 * 1024
} as const;

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
    out.push({ id, startMs, endMs, ...(speaker ? { speaker } : {}), text });
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
  return normalizeSegments(segments).map((segment) => (segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text)).join("\n").slice(0, 2_000_000);
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
    const speakerHit = (segment.speaker ?? "").toLowerCase().includes(needle);
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
    const { speaker: _old, ...rest } = segment;
    return { ...rest, text, ...(speakerValue ? { speaker: speakerValue } : {}) };
  });
}

/** Renames a speaker everywhere ("SPEAKER_00" → "Coach Smith"). */
export function renameSpeaker(segments: readonly TranscriptSegment[], from: string, to: string): TranscriptSegment[] {
  const next = clean(to, TRANSCRIPT_LIMITS.speaker);
  return segments.map((segment) => {
    if (segment.speaker !== from) return segment;
    const { speaker: _old, ...rest } = segment;
    return next ? { ...rest, speaker: next } : rest;
  });
}

export function speakersOf(segments: readonly TranscriptSegment[]): string[] {
  return [...new Set(segments.map((segment) => segment.speaker).filter((speaker): speaker is string => Boolean(speaker)))];
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
