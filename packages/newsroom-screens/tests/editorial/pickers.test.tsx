// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { DatePicker, pickerTime } from "../../src/editorial/pickers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function renderPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn();
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <AdminPortalContext value={document.body}>
        <DatePicker
          label="Publication target"
          value="2026-11-17T19:30:00.000Z"
          timezone="America/New_York"
          onChange={onChange}
          {...props}
        />
      </AdminPortalContext>
    );
  });
  return onChange;
}

describe("DatePicker", () => {
  it("shows an editable newsroom-local time for date-and-time values", async () => {
    const onChange = await renderPicker();

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[aria-label='Change publication target']")!.click();
    });

    const input = document.body.querySelector<HTMLInputElement>("input[type=time]")!;
    expect(input).not.toBeNull();
    expect(input.value).toBe("14:30");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "15:45");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenLastCalledWith("2026-11-17T15:45:00");
  });

  it("keeps date-only pickers date-only", async () => {
    await renderPicker({ label: "Story deadline", value: "2026-11-20", dateOnly: true });

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[aria-label='Change story deadline']")!.click();
    });

    expect(document.body.querySelector("input[type=time]")).toBeNull();
  });

  it("reads both stored instants and offset-free newsroom wall times", () => {
    expect(pickerTime("2026-11-17T19:30:00.000Z", "America/New_York")).toBe("14:30");
    expect(pickerTime("2026-11-17T08:05:00", "America/New_York")).toBe("08:05");
    expect(pickerTime(null, "America/New_York")).toBe("12:00");
  });
});
