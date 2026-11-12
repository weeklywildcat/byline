import { describe, expect, it } from "vitest";
import { materialDayGroups, materialMatchesFilter, quoteUse, recordingMimeType, recordingUploadProblem, REPORTING_LIMITS, routeCapture, sortMaterial, type StoryMaterialItem } from "../src/domain/reporting";
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

describe("uploaded recordings", () => {
  it("accepts the audio the collection keeps, by type or by extension when the browser reports none", () => {
    expect(recordingUploadProblem("interview.mp3", "audio/mpeg", 4_000_000)).toBeNull();
    expect(recordingUploadProblem("Voice Memo.m4a", "audio/x-m4a", 4_000_000)).toBeNull();
    expect(recordingUploadProblem("call.webm", "audio/webm;codecs=opus", 4_000_000)).toBeNull();
    expect(recordingUploadProblem("phone.m4a", "", 4_000_000)).toBeNull();
    expect(recordingUploadProblem("phone.WAV", "application/octet-stream", 4_000_000)).toBeNull();
  });

  it("sends a typeless file with the type its extension implies, so the server's MIME list accepts it", () => {
    expect(recordingMimeType("phone.m4a", "")).toBe("audio/mp4");
    expect(recordingMimeType("phone.WAV", "application/octet-stream")).toBe("audio/wav");
    expect(recordingMimeType("call.webm", "audio/webm;codecs=opus")).toBe("audio/webm");
    expect(recordingMimeType("Voice Memo.m4a", "audio/x-m4a")).toBe("audio/x-m4a");
    // A reported type wins over the name: a PDF renamed .mp3 is still a PDF.
    expect(recordingMimeType("notes.mp3", "application/pdf")).toBeNull();
    expect(recordingMimeType("photo.jpg", "image/jpeg")).toBeNull();
  });

  it("explains what it refuses before the upload starts", () => {
    expect(recordingUploadProblem("notes.pdf", "application/pdf", 1000)).toMatch(/MP3, M4A/);
    expect(recordingUploadProblem("take.flac", "audio/flac", 1000)).toMatch(/MP3, M4A/);
    expect(recordingUploadProblem("mystery", "", 1000)).toMatch(/MP3, M4A/);
    expect(recordingUploadProblem("long.mp3", "audio/mpeg", REPORTING_LIMITS.fileBytes + 1)).toMatch(/larger than 300 MB/);
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
  it("decodes cue entities once and keeps escaped markup literal", () => {
    const parsed = parseTranscriptFile("WEBVTT\n\n00:01.000 --> 00:03.000\n<v Casey><i>Thanks</i> &amp;lt; &lt;b&gt; &lt;script&gt;. </v>", "vtt");
    expect(parsed.segments[0]).toMatchObject({ speaker: "Casey", text: "Thanks &lt; <b> <script>." });
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
    expect(edited[1]).toEqual({ id: "ax", startMs: 1000, endMs: 2000, speaker: "SPEAKER_01", speakerKey: "SPEAKER_01", text: "What changed on defense?" });
    expect(renameSpeaker(segments, "SPEAKER_00", "Coach Smith")[0].speaker).toBe("Coach Smith");
    expect(renameSpeaker(segments, "Speaker 1", "Coach Smith")[0].speaker).toBe("Coach Smith");
  });
  it("searches words and speakers, and follows playback", () => {
    expect(searchTranscript(segments, "changed")).toEqual([{ segmentId: "ax", start: 5, end: 12 }]);
    expect(searchTranscript(segments, "speaker 2")).toEqual([{ segmentId: "ax", start: -1, end: -1 }]);
    expect(activeSegmentAt(segments, 1500)).toBe("ax");
  });
  it("snapshots a selection's words, timing and single speaker", () => {
    expect(selectionFromSegments(segments, ["a"], "tackled better")).toEqual({ text: "tackled better", startMs: 0, endMs: 1000, speaker: "Speaker 1", segmentIds: ["a"] });
    expect(selectionFromSegments(segments, ["a", "ax"])?.speaker).toBeNull();
  });
});

describe("quote provenance", () => {
  it("finds Reported Quote selections in a Lexical body", () => {
    const body = { root: { children: [{ type: "paragraph", children: [] }, { type: "block", fields: { blockType: "reportedQuote", reportingSelection: 7 } }, { type: "block", fields: { blockType: "pullQuote", reportingSelection: 9 } }] } };
    expect(referencedSelections(body)).toEqual([7]);
    expect(referencedSelections(null)).toEqual([]);
  });
});

describe("the public body never carries reporting provenance", () => {
  it("drops the private reportingSelection from a Reported Quote", async () => {
    const { normalizePayloadStoryBody } = await import("@byline/editor/normalize");
    const state = { root: { type: "root", version: 1, direction: null, format: "", indent: 0, children: [{ type: "block", version: 2, format: "", fields: { id: "q1", blockName: "", blockType: "reportedQuote", text: "We switched to man coverage.", attribution: "Coach Smith, Head coach", reportingSelection: 4242, sourceUrl: "", sourceLabel: "" } }] } };
    const { body } = normalizePayloadStoryBody({ contentFormat: "byline-v1", body: state }, { media: () => null });
    const json = JSON.stringify(body);
    expect(json).toContain("man coverage");
    expect(json).not.toContain("reportingSelection");
    expect(json).not.toContain("4242");
  });
});
