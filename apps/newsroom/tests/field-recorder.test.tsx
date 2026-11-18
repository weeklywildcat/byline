// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueue, memoryOutbox, QuotaError, type OutboxItem } from "../src/ui/field/outbox";
import { FieldRecorderProvider, RecordingBar, useFieldRecorder, type FieldRecorder, type RecorderOutbox } from "../src/ui/field/recording";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A MediaRecorder that hands over chunks when the test says so. */
class FakeRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  static last: FakeRecorder | null = null;
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  timeslice = 0;
  constructor(readonly stream: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
    FakeRecorder.last = this;
  }
  start(timeslice: number) { this.state = "recording"; this.timeslice = timeslice; }
  emit(text: string) { this.ondataavailable?.({ data: new Blob([text], { type: "audio/webm" }) }); }
  requestData() { this.emit("flush"); }
  stop() {
    if (this.state === "inactive") throw new DOMException("inactive", "InvalidStateError");
    this.state = "inactive";
    this.emit("tail");
    queueMicrotask(() => this.onstop?.());
  }
}

class FakeTrack extends EventTarget {
  stopped = false;
  stop() { this.stopped = true; }
}

let host: HTMLDivElement;
let root: Root;
let track: FakeTrack;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  track = new FakeTrack();
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function setup(store = memoryOutbox()) {
  const memory = new Map<string, OutboxItem>();
  const live = new Set<string>();
  const outbox: RecorderOutbox = { store, memory, live, add: async (item) => (await enqueue(store, memory, item)).safe, refresh: async () => {} };
  const handle: { current: FieldRecorder | null } = { current: null };
  function Harness({ story }: { story: boolean }) {
    const recorder = useFieldRecorder(outbox);
    handle.current = recorder;
    // `story` stands for the Story screen the recording was started from: it can go away without stopping anything.
    return <FieldRecorderProvider recorder={recorder}><RecordingBar />{story ? <p>Story screen</p> : null}</FieldRecorderProvider>;
  }
  const render = (story: boolean) => act(() => root.render(<Harness story={story} />));
  render(true);
  return { store, memory, live, handle, render };
}

/** jsdom's Blob has no text(). */
const read = (blob: Blob) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
const joined = async (parts: Blob[]) => (await Promise.all(parts.map(read))).join("");

const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); await new Promise((done) => setTimeout(done, 0)); });
const target = { storyId: 7, story: "Homecoming", context: { appointmentId: 3 } };

describe("Field recorder", () => {
  it("keeps recording when the drawer closes and the Story screen goes away, saving every chunk as it arrives", async () => {
    const { store, live, handle, render } = setup();
    await act(async () => { handle.current!.openFor(target); await handle.current!.start(target); });
    const key = handle.current!.active!.key;
    expect(FakeRecorder.last!.timeslice).toBe(3000);
    expect(live.has(key)).toBe(true);
    expect(store.items.get(key)).toMatchObject({ state: "recording", kind: "recording", chunked: true, storyId: 7, context: { appointmentId: 3 } });

    act(() => handle.current!.setOpen(false));
    render(false);
    expect(host.textContent).toContain("REC 0:00");
    expect(host.querySelector("[data-field-recording-bar]")).not.toBeNull();
    expect(FakeRecorder.last!.state).toBe("recording");

    await act(async () => { FakeRecorder.last!.emit("one "); FakeRecorder.last!.emit("two "); });
    await flush();
    expect(await joined(await store.chunks!(key))).toBe("one two ");

    await act(async () => { await handle.current!.stop(); });
    await flush();
    expect(store.items.get(key)).toMatchObject({ state: "queued", chunked: true });
    expect(await joined(await store.chunks!(key))).toBe("one two tail");
    expect(track.stopped).toBe(true);
    expect(live.has(key)).toBe(false);
    expect(handle.current!.active).toBeNull();
    expect(host.querySelector("[data-field-recording-bar]")).toBeNull();
  });

  it("saves what was recorded when the phone takes the microphone, and says so", async () => {
    const { store, handle } = setup();
    await act(async () => { await handle.current!.start(target); });
    const key = handle.current!.active!.key;
    await act(async () => { FakeRecorder.last!.emit("before call "); track.dispatchEvent(new Event("ended")); });
    await flush();
    expect(store.items.get(key)?.state).toBe("queued");
    expect(handle.current!.notice?.title).toBe("Recording stopped");
  });

  it("flushes the latest audio when Field goes to the background", async () => {
    const { store, handle } = setup();
    await act(async () => { await handle.current!.start(target); });
    const key = handle.current!.active!.key;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    expect(await read((await store.chunks!(key))[0])).toBe("flush");
  });

  it("hands over the whole take from memory when the phone refuses a chunk", async () => {
    const store = memoryOutbox();
    let refuse = false;
    const append = store.appendChunk!.bind(store);
    store.appendChunk = async (item, seq, part) => { if (refuse) throw new QuotaError("full"); return append(item, seq, part); };
    const { handle } = setup(store);
    await act(async () => { await handle.current!.start(target); });
    const key = handle.current!.active!.key;
    await act(async () => { FakeRecorder.last!.emit("saved "); });
    await flush();
    refuse = true;
    await act(async () => { FakeRecorder.last!.emit("only-in-memory "); });
    await flush();
    expect(handle.current!.unsafe).toBe(true);
    await act(async () => { await handle.current!.stop(); });
    await flush();
    const item = store.items.get(key)!;
    expect(item).toMatchObject({ state: "queued", chunked: false });
    expect(await read(item.blob!)).toBe("saved only-in-memory tail");
    expect(store.chunkMap.has(key)).toBe(false);
  });

  it("deletes the audio only on Discard", async () => {
    const { store, handle } = setup();
    await act(async () => { await handle.current!.start(target); });
    const key = handle.current!.active!.key;
    await act(async () => { FakeRecorder.last!.emit("x"); await handle.current!.discard(); });
    await flush();
    expect(store.items.has(key)).toBe(false);
    expect(store.chunkMap.has(key)).toBe(false);
  });

  it("stops and saves, never drops, when Field itself goes away", async () => {
    const { store, handle } = setup();
    await act(async () => { await handle.current!.start(target); });
    const key = handle.current!.active!.key;
    act(() => root.unmount());
    root = createRoot(host);
    await flush();
    expect(store.items.get(key)?.state).toBe("queued");
  });
});
