import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  editSegment,
  normalizeSegments,
  renameSpeaker,
  searchTranscript,
  selectionFromSegments,
  speakerLabel,
  speakerProfiles,
  speakersOf,
  speakerTurns,
  transcriptSearchText,
  type TranscriptSegment
} from "../src/domain/transcript";
import { fasterWhisperProvider, fromFasterWhisper, speakerHints } from "../src/reporting/transcription/faster-whisper";
import { transcriptionStatus, type TranscriptionProgress } from "../src/reporting/transcription/provider";

/** What the service returns for a two-person interview (seconds; machine labels). */
const service = [
  { start: 0.4, end: 3.0, speaker: "SPEAKER_00", text: "What did you think when you got the call?" },
  { start: 3.2, end: 7.0, speaker: "SPEAKER_01", text: "At first I honestly thought somebody was joking." },
  { start: 7.2, end: 8.0, speaker: "SPEAKER_01", text: "Really." },
  { start: 8.4, end: 11.0, speaker: "SPEAKER_00", text: "When did it start feeling real?" },
  { start: 11.4, end: 12.0, text: "(unclear)" }
];

const transcript = () => fromFasterWhisper({ language: "en", duration: 12, segments: service });

describe("machine speaker labels", () => {
  it("keeps stable machine keys and shows Speaker N until a reporter names the voice", () => {
    const { segments } = transcript();
    expect(segments.map((segment) => segment.speakerKey)).toEqual(["SPEAKER_00", "SPEAKER_01", "SPEAKER_01", "SPEAKER_00", undefined]);
    expect(segments.map(speakerLabel)).toEqual(["Speaker 1", "Speaker 2", "Speaker 2", "Speaker 1", undefined]);
    expect(speakersOf(segments)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("makes machine text searchable by the label a reporter sees", () => {
    const { segments } = transcript();
    expect(searchTranscript(segments, "speaker 2").map((match) => match.segmentId)).toEqual(["s1", "s2"]);
    expect(transcriptSearchText(segments).split("\n")[1]).toBe("Speaker 2: At first I honestly thought somebody was joking.");
  });

  it("never invents a key: only SPEAKER_nn labels become one, and an unattributed passage stays unattributed", () => {
    const [named, other, none] = normalizeSegments([
      { id: "a", text: "x", speaker: "Coach Smith" },
      { id: "b", text: "y", speaker: "Speaker 1", speakerKey: "not-a-key" },
      { id: "c", text: "z" }
    ]);
    expect(named.speakerKey).toBeUndefined();
    expect(other.speakerKey).toBeUndefined();
    expect(none.speaker).toBeUndefined();
  });

  it("scopes SPEAKER_00 to one transcript: renaming one never touches another", () => {
    const first = transcript().segments;
    const second = fromFasterWhisper({ segments: [{ start: 0, end: 2, speaker: "SPEAKER_00", text: "A different recording." }] }).segments;
    const renamed = renameSpeaker(first, "Speaker 1", "Owen Carter", "SPEAKER_00");
    expect(renamed[0].speaker).toBe("Owen Carter");
    expect(second[0].speaker).toBe("SPEAKER_00");
    expect(speakerProfiles(second)[0].key).toBe("SPEAKER_00");
    expect(speakerProfiles(second)[0].named).toBe(false);
  });
});

describe("progressive speaker-labelled text", () => {
  it("keeps ids and speakers identical as the prefix grows into the final transcript", () => {
    const prefix = fromFasterWhisper({ segments: service.slice(0, 2) }).segments;
    const longer = fromFasterWhisper({ segments: service.slice(0, 4) }).segments;
    const final = transcript().segments;
    expect(longer.slice(0, prefix.length)).toEqual(prefix);
    expect(final.slice(0, longer.length)).toEqual(longer);
    expect(final.map((segment) => segment.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });

  it("replays a retried run as the same segments, not duplicate speaker turns", () => {
    const once = fromFasterWhisper({ segments: service }).segments;
    const replay = fromFasterWhisper({ segments: service }).segments;
    expect(replay).toEqual(once);
    expect(replay).toHaveLength(service.length);
    expect(speakerTurns(replay).map((turn) => turn.identity)).toEqual(["SPEAKER_00", "SPEAKER_01", "SPEAKER_00", null]);
  });
});

describe("speaker turns", () => {
  it("groups consecutive passages by one speaker while each keeps its own id and timing", () => {
    const turns = speakerTurns(transcript().segments);
    expect(turns.map((turn) => turn.segments.map((segment) => segment.id))).toEqual([["s0"], ["s1", "s2"], ["s3"], ["s4"]]);
    expect(turns[1].label).toBe("Speaker 2");
    expect(turns[1].segments.map((segment) => segment.startMs)).toEqual([3200, 7200]);
  });

  it("starts a new turn after a long pause, and never folds an unattributed passage into a neighbour", () => {
    const base = { speaker: "SPEAKER_00", speakerKey: "SPEAKER_00" };
    const segments: TranscriptSegment[] = [
      { id: "a", startMs: 0, endMs: 1000, text: "one", ...base },
      { id: "b", startMs: 30_000, endMs: 31_000, text: "two", ...base },
      { id: "c", startMs: 31_500, endMs: 32_000, text: "(unclear)" },
      { id: "d", startMs: 32_500, endMs: 33_000, text: "three", ...base }
    ];
    expect(speakerTurns(segments).map((turn) => turn.segments.map((segment) => segment.id))).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("leaves a transcript without speakers as one row per passage", () => {
    const plain = normalizeSegments([{ text: "a", startMs: 0 }, { text: "b", startMs: 1000 }]);
    expect(speakerTurns(plain)).toHaveLength(2);
  });
});

describe("speaker profiles", () => {
  it("lists each voice once, in order of first appearance, with a representative playable sample", () => {
    const profiles = speakerProfiles(transcript().segments);
    expect(profiles.map((profile) => [profile.key, profile.label, profile.named, profile.passages])).toEqual([
      ["SPEAKER_00", "Speaker 1", false, 2],
      ["SPEAKER_01", "Speaker 2", false, 2]
    ]);
    expect(profiles[1].sample).toEqual({ segmentId: "s1", startMs: 3200, endMs: 7000, text: "At first I honestly thought somebody was joking." });
    expect(profiles[0].spokenMs).toBe(2600 + 2600);
  });
});

describe("naming speakers after the transcript is ready", () => {
  it("renames every passage of a voice without changing words, timing or ids", () => {
    const before = transcript().segments;
    const after = renameSpeaker(before, "SPEAKER_00", "Reporter", "SPEAKER_00");
    const named = renameSpeaker(after, "SPEAKER_01", "Interviewee", "SPEAKER_01");
    expect(named.map((segment) => segment.speaker)).toEqual(["Reporter", "Interviewee", "Interviewee", "Reporter", undefined]);
    expect(named.map(({ id, startMs, endMs, text }) => ({ id, startMs, endMs, text }))).toEqual(before.map(({ id, startMs, endMs, text }) => ({ id, startMs, endMs, text })));
    expect(speakerProfiles(named).map((profile) => [profile.label, profile.named])).toEqual([["Reporter", true], ["Interviewee", true]]);
  });

  it("reaches every passage again after an earlier rename, because the machine key survives", () => {
    const once = renameSpeaker(transcript().segments, "Speaker 1", "Owen", "SPEAKER_00");
    const twice = renameSpeaker(once, "Owen", "Owen Carter", "SPEAKER_00");
    expect(twice.filter((segment) => segment.speaker === "Owen Carter")).toHaveLength(2);
    expect(twice.every((segment) => segment.speaker !== "Owen")).toBe(true);
    // Clearing a name returns the voice to its machine label.
    const cleared = renameSpeaker(twice, "Owen Carter", "", "SPEAKER_00");
    expect(cleared.map(speakerLabel).slice(0, 4)).toEqual(["Speaker 1", "Speaker 2", "Speaker 2", "Speaker 1"]);
  });

  it("keeps two voices apart even when both are given the same name", () => {
    const merged = renameSpeaker(renameSpeaker(transcript().segments, "", "Guest", "SPEAKER_00"), "", "Guest", "SPEAKER_01");
    expect(speakerProfiles(merged).map((profile) => profile.key)).toEqual(["SPEAKER_00", "SPEAKER_01"]);
  });

  it("treats a hand-set speaker on one passage as a correction that a later rename leaves alone", () => {
    const corrected = editSegment(transcript().segments, "s3", { speaker: "Guest" });
    expect(corrected[3].speakerKey).toBeUndefined();
    const renamed = renameSpeaker(corrected, "Speaker 1", "Reporter", "SPEAKER_00");
    expect(renamed.map((segment) => segment.speaker).slice(0, 4)).toEqual(["Reporter", "SPEAKER_01", "SPEAKER_01", "Guest"]);
    // An edit to the words alone keeps the voice.
    expect(editSegment(transcript().segments, "s0", { text: "Changed." })[0].speakerKey).toBe("SPEAKER_00");
  });

  it("snapshots the shown speaker into a selection, never a raw model label", () => {
    expect(selectionFromSegments(transcript().segments, ["s1"])?.speaker).toBe("Speaker 2");
    expect(selectionFromSegments(transcript().segments, ["s0", "s1"])?.speaker).toBeNull();
  });
});

describe("speaker-count hints", () => {
  it("sends nothing for automatic detection and drops contradictory or out-of-range hints", () => {
    expect(speakerHints(undefined)).toEqual({});
    expect(speakerHints({})).toEqual({});
    expect(speakerHints({ exact: 2 })).toEqual({ num_speakers: 2 });
    expect(speakerHints({ exact: 3, min: 2, max: 4 })).toEqual({ num_speakers: 3 });
    expect(speakerHints({ min: 2, max: 4 })).toEqual({ min_speakers: 2, max_speakers: 4 });
    expect(speakerHints({ min: 5, max: 2 })).toEqual({});
    expect(speakerHints({ exact: 0, max: 99 })).toEqual({});
  });
});

describe("service credentials", () => {
  it("never reach the screens: status exposes neither the service address nor a token", () => {
    const status = JSON.stringify(transcriptionStatus({
      BYLINE_TRANSCRIPTION_PROVIDER: "faster-whisper",
      BYLINE_TRANSCRIPTION_URL: "http://asr.internal:9000",
      BYLINE_TRANSCRIPTION_TOKEN: "hf_secret",
      WHISPER_DIARIZATION_TOKEN: "hf_secret"
    }));
    expect(status).not.toContain("hf_secret");
    expect(status).not.toContain("asr.internal");
  });
});

describe("provider speaker stages", () => {
  it("reports loading and identifying speakers before any text, then speaker-labelled drafts, and passes hints through", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "byline-speaker-"));
    const file = path.join(dir, "interview.wav");
    writeFileSync(file, "RIFF");
    const polls = [
      { state: "queued", progress: null, message: "Waiting for transcription worker" },
      { state: "loading-diarization", progress: null, message: "Loading speaker model" },
      { state: "diarizing", progress: 0.42, message: "Identifying speakers" },
      { state: "loading-model", progress: null, message: "Loading Whisper model" },
      { state: "transcribing", progress: 0.18, duration: 12, message: "Transcribing audio", segments: service.slice(0, 2) },
      { state: "ready", progress: 1, result: { language: "en", duration: 12, segments: service } }
    ];
    let index = 0;
    const posted: FormData[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      if (init.method === "POST") {
        posted.push(init.body as FormData);
        return Response.json(polls[0], { status: 202 });
      }
      if (init.method === "GET" && index === 0 && posted.length === 0) return Response.json({ detail: "not found" }, { status: 404 });
      return Response.json(polls[Math.min(++index, polls.length - 1)]);
    }) as unknown as typeof fetch;
    const seen: TranscriptionProgress[] = [];
    try {
      const provider = fasterWhisperProvider({ url: "http://asr.test", model: null, language: null, private: true, timeoutMs: 15_000, fetchImpl, pollIntervalMs: 10 });
      const result = await provider.transcribe(
        { path: file, filename: "interview.wav", mimeType: "audio/wav", jobKey: "job-1", speakers: { min: 2, max: 4 } },
        new AbortController().signal,
        (progress) => { seen.push(progress); }
      );
      expect(seen.map((progress) => [progress.state, progress.message, progress.percent])).toEqual([
        ["queued", "Waiting for transcription worker", null],
        ["loading-diarization", "Loading speaker model", null],
        ["diarizing", "Identifying speakers", 42],
        ["loading-model", "Loading Whisper model", null],
        ["transcribing", "Transcribing audio", 18]
      ]);
      // Nothing is shown as text until speakers are known, and the first text already carries them.
      expect(seen.slice(0, 4).every((progress) => progress.segments === undefined)).toBe(true);
      expect(seen[4].segments?.map(speakerLabel)).toEqual(["Speaker 1", "Speaker 2"]);
      expect(result.segments.map(speakerLabel)).toEqual(["Speaker 1", "Speaker 2", "Speaker 2", "Speaker 1", undefined]);
      expect(posted).toHaveLength(1);
      expect(posted[0].get("min_speakers")).toBe("2");
      expect(posted[0].get("max_speakers")).toBe("4");
      expect(posted[0].get("num_speakers")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
