// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineForm } from "@byline/newsroom-ui/components/inline-form";

/**
 * Inline editors inside Payload's document <form> must never submit it:
 * InlineForm is not a <form>, handles Enter itself, and keeps Textarea
 * newlines (⌘/Ctrl+Enter saves).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

function mount() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const outerSubmit = vi.fn((event: Event) => event.preventDefault());
  const outer = document.createElement("form");
  outer.addEventListener("submit", outerSubmit);
  document.body.append(outer);
  root = createRoot(outer);
  act(() => root!.render(
    <InlineForm label="Add a link" onSubmit={onSubmit} onCancel={onCancel}>
      <input aria-label="Link" />
      <input type="checkbox" aria-label="Private" />
      <textarea aria-label="Note" />
      <button type="button">Save</button>
    </InlineForm>
  ));
  return { outer, onSubmit, onCancel, outerSubmit };
}

const press = (target: Element, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(event); });
  return event;
};

describe("InlineForm", () => {
  it("is a labelled group, never a nested form", () => {
    const { outer } = mount();
    expect(outer.querySelectorAll("form")).toHaveLength(0);
    expect(outer.querySelector("[role=group]")?.getAttribute("aria-label")).toBe("Add a link");
  });

  it("saves on Enter in a single-line input and blocks the outer form's implicit submit", () => {
    const { outer, onSubmit } = mount();
    const event = press(outer.querySelector("input[aria-label=Link]")!, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps Enter as a newline in a textarea and saves on ⌘/Ctrl+Enter", () => {
    const { outer, onSubmit } = mount();
    const textarea = outer.querySelector("textarea")!;
    expect(press(textarea, { key: "Enter" }).defaultPrevented).toBe(false);
    expect(press(textarea, { key: "Enter", shiftKey: true }).defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    press(textarea, { key: "Enter", metaKey: true });
    press(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("leaves Enter on checkboxes and buttons to the control, and cancels on Escape", () => {
    const { outer, onSubmit, onCancel } = mount();
    press(outer.querySelector("input[type=checkbox]")!, { key: "Enter" });
    press(outer.querySelector("button")!, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    press(outer.querySelector("input[aria-label=Link]")!, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter while an IME composition is in progress", () => {
    const { outer, onSubmit } = mount();
    press(outer.querySelector("input[aria-label=Link]")!, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
