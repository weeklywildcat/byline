// @vitest-environment jsdom
import { DateButton, DateTimeField, dateFromDay, dayFromDate, formatWallTime, joinWallTime, splitWallTime, timeZoneLabel } from "@byline/newsroom-ui/components/date-fields";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("wall-time helpers", () => {
  it("split and join the exact strings a native datetime-local input produced", () => {
    expect(splitWallTime("2026-11-07T23:30")).toEqual({ day: "2026-11-07", time: "23:30" });
    expect(splitWallTime("2026-11-07T23:30:15")).toEqual({ day: "2026-11-07", time: "23:30:15" });
    expect(splitWallTime("2026-11-07")).toEqual({ day: "2026-11-07", time: "" });
    expect(splitWallTime("")).toBeNull();
    expect(splitWallTime("tomorrow")).toBeNull();
    expect(joinWallTime("2026-11-07", "09:00")).toBe("2026-11-07T09:00");
    expect(joinWallTime("2026-11-07", "")).toBe("2026-11-07");
  });

  it("round-trips a day through a local Date without crossing midnight", () => {
    for (const day of ["2026-03-08", "2026-11-01", "2026-12-31"]) expect(dayFromDate(dateFromDay(day)!)).toBe(day);
    expect(dateFromDay("2026-13-01x")).toBeUndefined();
  });

  it("formats the wall clock as written, whatever the browser's timezone", () => {
    expect(formatWallTime("2026-11-07T23:30", { locale: "en-US" })).toBe("Sat, Nov 7, 2026 at 11:30 PM");
    expect(formatWallTime("2026-11-07T00:05", { locale: "en-US" })).toBe("Sat, Nov 7, 2026 at 12:05 AM");
    expect(formatWallTime("2026-11-07", { locale: "en-US" })).toBe("Sat, Nov 7, 2026");
    expect(formatWallTime("2026-11-07T09:00", { locale: "en-US", withTime: false })).toBe("Sat, Nov 7, 2026");
    expect(formatWallTime("nope")).toBe("");
  });

  it("names the newsroom timezone in words, falling back to the id", () => {
    expect(timeZoneLabel("America/New_York", new Date("2026-11-09T12:00:00Z"), "en-US")).toBe("Eastern Standard Time");
    expect(timeZoneLabel("Not/AZone")).toBe("Not/AZone");
  });
});

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const click = (element: Element | null | undefined) => act(async () => { (element as HTMLElement).click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
const text = (label: string) => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);

function Harness({ initial, seconds = false, onValue }: { initial: string; seconds?: boolean; onValue: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return <AdminPortalContext value={document.body}>
    <DateTimeField label="Publish at" value={value} timeZone="America/New_York" seconds={seconds} onChange={(next) => { setValue(next); onValue(next); }} />
  </AdminPortalContext>;
}

describe("DateTimeField", () => {
  it("opens from its label, names the timezone, picks a day with the default time and keeps the time when the day changes", async () => {
    const seen: string[] = [];
    act(() => root.render(<Harness initial="" onValue={(value) => seen.push(value)} />));
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>("button[id]")!;
    expect(document.querySelector("label")?.getAttribute("for")).toBe(trigger.id);
    expect(trigger.textContent).toContain("Choose a date and time");
    await click(trigger);
    expect(document.body.textContent).toContain("Pick a day first.");
    expect(document.body.textContent).toContain("Times are in");
    const day = [...document.querySelectorAll<HTMLButtonElement>("[data-slot=popover-content] td button")].find((button) => button.textContent === "15")!;
    await click(day);
    expect(seen.at(-1)).toMatch(/^\d{4}-\d{2}-15T09:00$/);
    await click(text("3 PM"));
    expect(seen.at(-1)).toMatch(/^\d{4}-\d{2}-15T15:00$/);
    const other = [...document.querySelectorAll<HTMLButtonElement>("[data-slot=popover-content] td button")].find((button) => button.textContent === "16")!;
    await click(other);
    expect(seen.at(-1)).toMatch(/^\d{4}-\d{2}-16T15:00$/);
    expect(document.body.textContent).not.toContain("Pick a day first.");
  });

  it("keeps second precision when asked and clears back to empty", async () => {
    const seen: string[] = [];
    act(() => root.render(<Harness initial="2026-11-07T23:30:15" seconds onValue={(value) => seen.push(value)} />));
    await flush();
    await click(document.querySelector("button[id]"));
    expect(document.querySelector<HTMLInputElement>("input[type=time]")?.value).toBe("23:30:15");
    await click(text("Noon"));
    expect(seen.at(-1)).toBe("2026-11-07T12:00:00");
    await click(text("Clear"));
    expect(seen.at(-1)).toBe("");
  });
});

describe("DateButton", () => {
  it("shows the chosen day, picks a day and clears it", async () => {
    const seen: string[] = [];
    function Day() {
      const [value, setValue] = useState("2026-11-07");
      return <AdminPortalContext value={document.body}><DateButton aria-label="Due from" value={value} onChange={(next) => { setValue(next); seen.push(next); }} /></AdminPortalContext>;
    }
    act(() => root.render(<Day />));
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>("button[aria-label='Due from']")!;
    expect(trigger.textContent).toContain("Nov 7, 2026");
    await click(trigger);
    await click([...document.querySelectorAll<HTMLButtonElement>("[data-slot=popover-content] td button")].find((button) => button.textContent === "9"));
    expect(seen.at(-1)).toBe("2026-11-09");
    await click(trigger);
    await click(text("Clear date"));
    expect(seen.at(-1)).toBe("");
    expect(trigger.textContent).toContain("Any date");
  });
});
