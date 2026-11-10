// @vitest-environment jsdom
import { useFineHoverPointer } from "@byline/newsroom-ui/lib/hooks";
import { trackVisualViewport } from "@byline/newsroom-ui/lib/visual-viewport";
import { useScreenWakeLock } from "@byline/newsroom-ui/lib/wake-lock";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom has no PointerEvent; the browser suites dispatch the real thing in WebKit and Chromium.
class FakePointerEvent extends MouseEvent {
  readonly pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
  }
}
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }));
}

function Probe() {
  return <output>{String(useFineHoverPointer())}</output>;
}

describe("hybrid hover capability", () => {
  // The module remembers an observed pointer for the page's lifetime, so this suite keeps its order: no hover, finger, Pencil.
  it("starts off when the device reports no hover, ignores fingers and Pencil contact, and switches on for a hovering Apple Pencil", () => {
    vi.stubGlobal("PointerEvent", FakePointerEvent);
    stubMatchMedia(false);
    act(() => root.render(<Probe />));
    const value = () => host.querySelector("output")!.textContent;
    expect(value()).toBe("false");

    // A finger on glass is never hover.
    act(() => { window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", buttons: 0, bubbles: true })); });
    expect(value()).toBe("false");
    // A Pencil pressed to the screen (buttons !== 0) is contact, not hover.
    act(() => { window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "pen", buttons: 1, bubbles: true })); });
    expect(value()).toBe("false");

    // Safari reports a hovering Apple Pencil as pen pointer movement with no buttons down, even when any-hover is none.
    act(() => { window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "pen", buttons: 0, bubbles: true })); });
    expect(value()).toBe("true");
  });
});

describe("Screen Wake Lock", () => {
  function Hold({ active }: { active: boolean }) {
    useScreenWakeLock(active);
    return null;
  }
  const flush = () => act(async () => { await Promise.resolve(); });

  function stubWakeLock(request: () => Promise<unknown>) {
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { wakeLock: { request } }));
  }
  function sentinel() {
    const listeners = new Set<() => void>();
    return {
      released: false,
      release: vi.fn(async function (this: { released: boolean }) { this.released = true; }),
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      fire: () => listeners.forEach((fn) => fn())
    };
  }

  it("requests while active and visible, and releases when it stops", async () => {
    const lock = sentinel();
    const request = vi.fn(async () => lock);
    stubWakeLock(request);
    act(() => root.render(<Hold active />));
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    act(() => root.render(<Hold active={false} />));
    await flush();
    expect(lock.release).toHaveBeenCalled();
  });

  it("asks again when the page becomes visible after the browser released the lock", async () => {
    const first = sentinel();
    const second = sentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    stubWakeLock(request);
    act(() => root.render(<Hold active />));
    await flush();
    first.fire(); // the browser released it when the page was hidden
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does nothing when unsupported and swallows a refused request", async () => {
    vi.stubGlobal("navigator", Object.create(navigator));
    expect(() => act(() => root.render(<Hold active />))).not.toThrow();
    const request = vi.fn(async () => { throw new DOMException("denied", "NotAllowedError"); });
    stubWakeLock(request);
    act(() => root.render(<Hold active={false} />));
    act(() => root.render(<Hold active />));
    await flush();
    expect(request).toHaveBeenCalled();
  });
});

describe("Visual Viewport tracking", () => {
  it("publishes the visible rectangle as insets, follows resizes and cleans up", () => {
    const listeners: Record<string, () => void> = {};
    const viewport = { offsetTop: 0, offsetLeft: 0, width: 390, height: 844, addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; }, removeEventListener: (type: string) => { delete listeners[type]; } };
    vi.stubGlobal("visualViewport", viewport);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(844);
    const frames: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const nextFrame = () => frames.splice(0).forEach((fn) => fn());
    const element = document.createElement("div");
    const stop = trackVisualViewport(element);
    expect(element.style.getPropertyValue("--byline-vv-bottom")).toBe("0px");
    // The software keyboard opens: the visible height shrinks.
    viewport.height = 520;
    listeners.resize();
    nextFrame();
    expect(element.style.getPropertyValue("--byline-vv-bottom")).toBe("324px");
    viewport.offsetTop = 40;
    listeners.scroll();
    nextFrame();
    expect(element.style.getPropertyValue("--byline-vv-top")).toBe("40px");
    stop();
    expect(Object.keys(listeners)).toEqual([]);
    expect(element.style.getPropertyValue("--byline-vv-bottom")).toBe("");
  });

  it("is a no-op without window.visualViewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    const element = document.createElement("div");
    expect(() => trackVisualViewport(element)()).not.toThrow();
  });
});
