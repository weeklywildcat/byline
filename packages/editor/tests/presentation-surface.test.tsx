// @vitest-environment jsdom
import { PHONE_PRESENTATION_OPTIONS, type PhonePresentation } from "@byline/article-body";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_PREVIEWS, PresentationSurface, PresetField } from "../src/client/blocks/presentation";

/**
 * The Presentation surface (docs/story-presentation.md) as a writer meets it:
 * a named trigger, a Popover with a mouse and a bottom Sheet on touch or a
 * narrow screen, labelled groups whose chosen option is pressed and named in
 * words, keyboard reachable, and Escape closing it.
 */
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
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/** `coarse`: touch or a narrow screen, the editor's one query for secondary surfaces. */
function stubPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: coarse, media: query, addEventListener() {}, removeEventListener() {} }));
}

function Harness({ onChange }: { onChange: (value: PhonePresentation) => void }) {
  const [phone, setPhone] = useState<PhonePresentation>("auto");
  // The admin portals every overlay into the Byline UI root; here, the document.
  return (
    <AdminPortalContext.Provider value={document.body}>
      <PresentationSurface blockLabel="Photo">
        <PresetField name="phone" label="On phones" value={phone} options={PHONE_PRESENTATION_OPTIONS} preview={(value) => PHONE_PREVIEWS[value]} onChange={(value) => { setPhone(value); onChange(value); }} />
      </PresentationSurface>
    </AdminPortalContext.Provider>
  );
}

const trigger = () => document.querySelector<HTMLButtonElement>("[data-presentation-trigger]")!;
const surface = () => document.querySelector<HTMLElement>("[data-presentation-surface]");
const option = (value: string) => document.querySelector<HTMLButtonElement>(`[data-preset="phone"] [data-value="${value}"]`)!;
/** A real press: Base UI's triggers listen for the pointer sequence, not only `click`. */
const press = (element: HTMLElement) => act(async () => {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  element.click();
});
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe("the Presentation surface", () => {
  it("is one named trigger in the toolbar, closed until asked", async () => {
    stubPointer(false);
    await act(async () => root.render(<Harness onChange={() => {}} />));
    expect(trigger().getAttribute("aria-label")).toBe("Photo presentation");
    expect(trigger().textContent).toContain("Presentation");
    expect(surface()).toBeNull();
  });

  it("opens a Popover with a mouse, with a labelled group whose chosen preset is pressed and described", async () => {
    stubPointer(false);
    await act(async () => root.render(<Harness onChange={() => {}} />));
    await press(trigger());
    await flush();
    expect(surface()).not.toBeNull();
    expect(surface()!.closest('[data-slot="popover-content"]')).not.toBeNull();
    const group = document.querySelector<HTMLElement>('[data-preset="phone"] [data-slot="toggle-group"]')!;
    const label = document.getElementById(group.getAttribute("aria-labelledby")!);
    expect(label?.textContent).toBe("On phones");
    expect(option("auto").getAttribute("aria-pressed")).toBe("true");
    expect(option("bleed").getAttribute("aria-pressed")).toBe("false");
    // Never colour alone: the chosen option is named in words, and every option has its own visible name.
    expect(document.querySelector('[data-preset="phone"] [data-preset-description]')?.textContent).toMatch(/Column photos stay inset/);
    expect(option("bleed").textContent).toBe("Edge to edge");
    // The mini previews are decoration: hidden from assistive technology.
    expect(option("bleed").querySelector(".byline-preset-preview")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("updates the block's state and the pressed option when a preset is chosen", async () => {
    stubPointer(false);
    const onChange = vi.fn();
    await act(async () => root.render(<Harness onChange={onChange} />));
    await press(trigger());
    await flush();
    await press(option("bleed"));
    expect(onChange).toHaveBeenCalledWith("bleed");
    expect(option("bleed").getAttribute("aria-pressed")).toBe("true");
    expect(option("auto").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector('[data-preset="phone"] [data-preset-description]')?.textContent).toMatch(/reaches both edges/);
  });

  it("reaches every preset by keyboard and closes on Escape", async () => {
    stubPointer(false);
    await act(async () => root.render(<Harness onChange={() => {}} />));
    await press(trigger());
    await flush();
    for (const value of ["auto", "inset", "bleed"]) {
      expect(option(value).tabIndex).toBeGreaterThanOrEqual(-1);
      expect(option(value).disabled).toBe(false);
    }
    await act(async () => {
      option("auto").focus();
      option("auto").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(option("inset"));
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flush();
    await flush();
    expect(surface()).toBeNull();
  });

  it("opens a bottom Sheet on touch or a narrow screen", async () => {
    stubPointer(true);
    await act(async () => root.render(<Harness onChange={() => {}} />));
    await press(trigger());
    await flush();
    const sheet = surface()!.closest('[data-slot="sheet-content"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.getAttribute("data-side") ?? sheet?.className).toMatch(/bottom/);
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    // Touch targets grow to 44px on a coarse pointer (newsroom-ui's any-pointer-coarse sizing).
    expect(option("bleed").className).toMatch(/any-pointer-coarse:min-h-11/);
  });
});
