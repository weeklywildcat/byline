import { describe, expect, it } from "vitest";
import { materialDayGroups, materialMatchesFilter, quoteUse, routeCapture, sortMaterial, type StoryMaterialItem } from "../src/domain/reporting";
import {
  activeSegmentAt,
  editSegment,
  formatPosition,
  normalizeSegments,
  parseTimestamp,
  parseTranscriptFile,
  renameSpeaker,
  searchTranscript,
  selectionFromSegments,
  TranscriptImportError
} from "../src/domain/transcript";
import { fromFasterWhisper } from "../src/reporting/transcription/faster-whisper";
import { PermanentTranscriptionError, transcriptionConfig, transcriptionStatus } from "../src/reporting/transcription/provider";
import { referencedSelections } from "../src/reporting/provenance";

describe("capture routing", () => {
  it("routes each capture to its one canonical home", () => {
    expect(routeCapture({ intent: "note" })).toBe("reporting-note");
    expect(routeCapture({ intent: "live" })).toBe("live-update");
    expect(routeCapture({ intent: "photo", mimeType: "image/jpeg" })).toBe("media");
    expect(routeCapture({ intent: "recording", mimeType: "audio/webm" })).toBe("reporting-file");
    expect(routeCapture({ intent: "file", mimeType: "application/pdf" })).toBe("reporting-file");
    // An attached image stays private unless the person explicitly chose public Media.
    expect(routeCapture({ intent: "file", mimeType: "image/png" })).toBe("reporting-file");
    expect(routeCapture({ intent: "file", mimeType: "image/png", publicMedia: true })).toBe("media");
    expect(routeCapture({ intent: "link" })).toBe("resource");
    expect(routeCapture({ intent: "transcript" })).toBe("reporting-transcript");
  });
});

describe("ground rules", () => {
  it("blocks off-the-record insertion unless overridden, and never writes attribution for background", () => {
    expect(quoteUse("on-record").action).toBe("insert");
    expect(quoteUse("background").action).toBe("caution");
    expect(quoteUse("unspecified").action).toBe("caution");
    expect(quoteUse("off-record").action).toBe("blocked");
    expect(quoteUse("off-record", true).action).toBe("caution");
  });
});

describe("material feed", () => {
  const base = { author: null, confidential: false, canEdit: true, source: null, appointment: null };
  const items: StoryMaterialItem[] = [
    { ...base, kind: "note", key: "note:1", id: 1, occurredAt: "2026-11-08T14:00:00Z", text: "a" },
    { ...base, kind: "file", key: "file:2", id: 2, occurredAt: "2026-11-08T20:00:00Z", fileKind: "audio", filename: "x.wav", mimeType: "audio/wav", filesize: 1, durationMs: null, url: "", groundRules: { rule: "unspecified", recordingPermission: false, note: "", sourceId: null, capturedAt: null }, transcript: null },
    { ...base, kind: "media", key: "media:3", id: 3, occurredAt: "2026-11-07T20:00:00Z", filename: "p.jpg", previewUrl: null, alt: "", via: "capture" }
  ];
  it("sorts newest first and filters as views, not destinations", () => {
    expect(sortMaterial(items).map((item) => item.key)).toEqual(["file:2", "note:1", "media:3"]);
    expect(items.filter((item) => materialMatchesFilter(item, "audio")).map((item) => item.key)).toEqual(["file:2"]);
    expect(items.filter((item) => materialMatchesFilter(item, "photos")).map((item) => item.key)).toEqual(["media:3"]);
    expect(items.filter((item) => materialMatchesFilter(item, "notes")).map((item) => item.key)).toEqual(["note:1"]);
  });
  it("groups by the newsroom's day", () => {
    const groups = materialDayGroups(sortMaterial(items), "America/New_York", new Date("2026-11-08T22:00:00Z"));
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
  });
});

describe("transcript import", () => {
  it("reads SRT with timing and speakers", () => {
    const parsed = parseTranscriptFile("1\n00:12:41,000 --> 00:12:56,500\nCoach Smith: We knew going into the second half.\n\n2\n00:12:57,000 --> 00:13:02,000\nWhat changed defensively?\n", "srt");
    expect(parsed.segments).toEqual([
      { id: "s0", startMs: 761000, endMs: 776500, speaker: "Coach Smith", text: "We knew going into the second half." },
      { id: "s1", startMs: 777000, endMs: 782000, text: "What changed defensively?" }
    ]);
  });
  it("reads WebVTT voices and requires the header", () => {
    const parsed = parseTranscriptFile("WEBVTT\n\nNOTE comment\n\n00:01.000 --> 00:03.000\n<v Gibson>Thanks.</v>\n", "vtt");
    expect(parsed.segments[0]).toMatchObject({ speaker: "Gibson", text: "Thanks.", startMs: 1000, endMs: 3000 });
    expect(() => parseTranscriptFile("00:01.000 --> 00:03.000\nHi\n", "vtt")).toThrow(TranscriptImportError);
  });
  it("makes untimed segments from plain text, honoring optional [mm:ss] stamps", () => {
    const parsed = parseTranscriptFile("First paragraph.\n\n[01:05] Second paragraph.", "txt");
    expect(parsed.segments).toEqual([
      { id: "s0", startMs: null, endMs: null, text: "First paragraph." },
      { id: "s1", startMs: 65000, endMs: null, text: "Second paragraph." }
    ]);
    expect(() => parseTranscriptFile("   ", "txt")).toThrow(TranscriptImportError);
  });
  it("parses timestamps strictly", () => {
    expect(parseTimestamp("1:02:03.4")).toBe(3723400);
    expect(parseTimestamp("00:61:00")).toBeNull();
    expect(formatPosition(761000)).toBe("12:41");
    expect(formatPosition(3723400)).toBe("1:02:03");
  });
});

describe("transcript editing and search", () => {
  const segments = normalizeSegments([
    { id: "a", startMs: 0, endMs: 1000, speaker: "SPEAKER_00", text: "We tackled better." },
    { id: "a", startMs: 1000, endMs: 2000, speaker: "SPEAKER_01", text: "What changed?" },
    { startMs: 2000, endMs: 1500, text: "  bad   end  " }
  ]);
  it("normalizes ids, whitespace and impossible timing", () => {
    expect(segments.map((segment) => segment.id)).toEqual(["a", "ax", "s2"]);
    expect(segments[2]).toEqual({ id: "s2", startMs: 2000, endMs: null, text: "bad end" });
  });
  it("edits keep ids and timing; renames apply everywhere", () => {
    const edited = editSegment(segments, "ax", { text: "What changed on defense?" });
    expect(edited[1]).toEqual({ id: "ax", startMs: 1000, endMs: 2000, speaker: "SPEAKER_01", text: "What changed on defense?" });
    expect(renameSpeaker(segments, "SPEAKER_00", "Coach Smith")[0].speaker).toBe("Coach Smith");
  });
  it("searches words and speakers, and follows playback", () => {
    expect(searchTranscript(segments, "changed")).toEqual([{ segmentId: "ax", start: 5, end: 12 }]);
    expect(searchTranscript(segments, "speaker_01")).toEqual([{ segmentId: "ax", start: -1, end: -1 }]);
    expect(activeSegmentAt(segments, 1500)).toBe("ax");
  });
  it("snapshots a selection's words, timing and single speaker", () => {
    expect(selectionFromSegments(segments, ["a"], "tackled better")).toEqual({ text: "tackled better", startMs: 0, endMs: 1000, speaker: "SPEAKER_00", segmentIds: ["a"] });
    expect(selectionFromSegments(segments, ["a", "ax"])?.speaker).toBeNull();
  });
});

describe("transcription provider boundary", () => {
  it("is off unless configured, and never exposes the service URL", () => {
    expect(transcriptionConfig({}).enabled).toBe(false);
    expect(transcriptionStatus({}).message).toBe("Transcription is not configured.");
    expect(transcriptionConfig({ BYLINE_TRANSCRIPTION_PROVIDER: "faster-whisper", BYLINE_TRANSCRIPTION_URL: "https://u:p@asr.local" }).enabled).toBe(false);
    const config = transcriptionConfig({ BYLINE_TRANSCRIPTION_PROVIDER: "faster-whisper", BYLINE_TRANSCRIPTION_URL: "http://asr.internal:9000/", BYLINE_TRANSCRIPTION_MODEL: "small.en" });
    expect(config).toMatchObject({ enabled: true, url: "http://asr.internal:9000", model: "small.en", autoQueue: true });
    // A provider that leaves the newsroom is never queued automatically.
    expect(transcriptionConfig({ BYLINE_TRANSCRIPTION_PROVIDER: "faster-whisper", BYLINE_TRANSCRIPTION_URL: "https://asr.example", BYLINE_TRANSCRIPTION_PRIVATE: "0" })).toMatchObject({ autoQueue: false });
    expect(JSON.stringify(transcriptionStatus({ BYLINE_TRANSCRIPTION_PROVIDER: "faster-whisper", BYLINE_TRANSCRIPTION_URL: "http://asr.internal:9000" }))).not.toContain("asr.internal");
  });
  it("normalizes faster-whisper's seconds into Byline segments", () => {
    const transcript = fromFasterWhisper({ language: "EN", duration: 12.5, segments: [{ start: 0.2, end: 4.01, text: " Hello there. " }] });
    expect(transcript).toEqual({ language: "en", durationMs: 12500, segments: [{ id: "s0", startMs: 200, endMs: 4010, text: "Hello there." }] });
    expect(() => fromFasterWhisper({ segments: [] })).toThrow(PermanentTranscriptionError);
    expect(() => fromFasterWhisper("<html>")).toThrow(PermanentTranscriptionError);
  });
});

describe("quote provenance", () => {
  it("finds Reported Quote selections in a Lexical body", () => {
    const body = { root: { children: [{ type: "paragraph", children: [] }, { type: "block", fields: { blockType: "reportedQuote", reportingSelection: 7 } }, { type: "block", fields: { blockType: "pullQuote", reportingSelection: 9 } }] } };
    expect(referencedSelections(body)).toEqual([7]);
    expect(referencedSelections(null)).toEqual([]);
  });
});
