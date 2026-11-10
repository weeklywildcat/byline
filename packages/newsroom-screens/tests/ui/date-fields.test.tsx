// @vitest-environment jsdom
import { calendarBounds, DateButton, DateRangeButton, DateTimeField, dateFromDay, dayFromDate, formatWallTime, joinWallTime, splitWallTime, timeZoneLabel } from "@byline/newsroom-ui/components/date-fields";
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

const setNative = (element: HTMLInputElement | HTMLSelectElement, value: string, event: "input" | "change") => act(async () => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(event, { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});
const popover = () => document.querySelector("[data-slot=popover-content]")!;
const time = () => popover().querySelector<HTMLInputElement>("input[type=time]")!;
const days = () => [...popover().querySelectorAll<HTMLElement>("td[data-day]")].map((cell) => cell.dataset.day!);

describe("DateTimeField never reports half a date-and-time", () => {
  it("reports an empty value, not a day alone, while the clock is cleared, and restores the opening value on Done", async () => {
    const seen: string[] = [];
    act(() => root.render(<Harness initial="2026-11-07T10:00" onValue={(value) => seen.push(value)} />));
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>("button[id]")!;
    await click(trigger);
    await setNative(time(), "", "input");
    // The old behavior emitted "2026-11-07", which a form read as noon.
    expect(seen.at(-1)).toBe("");
    expect(seen.some((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))).toBe(false);
    expect(trigger.textContent).toContain("pick a time");
    expect(document.body.textContent).toContain("Enter a time to finish");
    // Finishing the clock reports the whole value again.
    await setNative(time(), "14:30", "input");
    expect(seen.at(-1)).toBe("2026-11-07T14:30");
    // Abandoning a half-finished pick puts back what the field opened with.
    await setNative(time(), "", "input");
    await click(text("Done"));
    expect(seen.at(-1)).toBe("2026-11-07T10:00");
  });

  it("restores the opening value exactly, and Clear still clears", async () => {
    const seen: string[] = [];
    act(() => root.render(<Harness initial="2026-11-07T10:00" onValue={(value) => seen.push(value)} />));
    await flush();
    await click(document.querySelector("button[id]"));
    await setNative(time(), "", "input");
    await click(text("Done"));
    expect(seen.at(-1)).toBe("2026-11-07T10:00");
    expect(document.querySelector("button[id]")!.textContent).toContain("Nov 7, 2026 at 10:00 AM");
    await click(document.querySelector("button[id]"));
    await setNative(time(), "", "input");
    await click(text("Clear"));
    expect(seen.at(-1)).toBe("");
    expect(document.querySelector("button[id]")!.textContent).toContain("Choose a date and time");
  });

  it("names the timezone for the chosen date, not for today", async () => {
    act(() => root.render(<Harness key="summer" initial="2026-07-04T10:00" onValue={() => {}} />));
    await flush();
    expect(document.querySelector("button[id]")!.textContent).toContain("EDT");
    act(() => root.render(<Harness key="winter" initial="2026-01-15T10:00" onValue={() => {}} />));
    await flush();
    expect(document.querySelector("button[id]")!.textContent).toContain("EST");
    await click(document.querySelector("button[id]"));
    expect(document.body.textContent).toContain("Eastern Standard Time");
  });

  it("reaches a date twenty years back from the year dropdown, not month by month", async () => {
    const seen: string[] = [];
    act(() => root.render(<Harness initial="2026-11-07T10:00" onValue={(value) => seen.push(value)} />));
    await flush();
    await click(document.querySelector("button[id]"));
    const selects = [...popover().querySelectorAll<HTMLSelectElement>("select")];
    const year = selects.find((select) => [...select.options].some((option) => option.value === "2006"))!;
    expect(year).toBeTruthy();
    expect([...year.options].some((option) => option.value === "1980")).toBe(true);
    await setNative(year, "2006", "change");
    expect(days().every((day) => day.startsWith("2006-"))).toBe(true);
    await click(popover().querySelector("td[data-day='2006-11-07'] button"));
    expect(seen.at(-1)).toBe("2006-11-07T10:00");
  });

  it("widens the dropdown range to hold a value outside it", () => {
    const old = calendarBounds(new Date(1975, 5, 1), new Date(2026, 10, 9));
    expect([old.startMonth.getFullYear(), old.endMonth.getFullYear()]).toEqual([1975, 2036]);
    const far = calendarBounds(new Date(2050, 0, 1), new Date(2026, 10, 9));
    expect([far.startMonth.getFullYear(), far.endMonth.getFullYear()]).toEqual([1980, 2050]);
  });
});

describe("DateRangeButton", () => {
  function Range({ initial, today, onValue }: { initial: { from: string; to: string }; today?: string; onValue: (range: { from: string; to: string }) => void }) {
    const [range, setRange] = useState(initial);
    return <AdminPortalContext value={document.body}><DateRangeButton aria-label="Deadline" from={range.from} to={range.to} today={today} onChange={(from, to) => { setRange({ from, to }); onValue({ from, to }); }} /></AdminPortalContext>;
  }
  const pressed = (label: string) => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === label)?.getAttribute("aria-pressed");

  it("can leave the start open: Until sets only an end day, From only a start day", async () => {
    const seen: Array<{ from: string; to: string }> = [];
    act(() => root.render(<Range initial={{ from: "2026-11-03", to: "2026-11-10" }} onValue={(range) => seen.push(range)} />));
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>("button[aria-label='Deadline']")!;
    expect(trigger.textContent).toContain("Nov 3, 2026 – Nov 10, 2026");
    await click(trigger);
    expect(pressed("Between")).toBe("true");
    await click(text("Until"));
    expect(pressed("Until")).toBe("true");
    await click(popover().querySelector("td[data-day='2026-11-25'] button"));
    expect(seen.at(-1)).toEqual({ from: "", to: "2026-11-25" });
    expect(trigger.textContent).toContain("Until Nov 25, 2026");
    // Reopened, an end-only filter opens on Until.
    await click(trigger);
    expect(pressed("Until")).toBe("true");
    await click(text("From"));
    await click(popover().querySelector("td[data-day='2026-11-02'] button"));
    expect(seen.at(-1)).toEqual({ from: "2026-11-02", to: "" });
    expect(trigger.textContent).toContain("From Nov 2, 2026");
  });

  it("still picks a first and last day, applies a quick range and clears", async () => {
    const seen: Array<{ from: string; to: string }> = [];
    act(() => root.render(<Range initial={{ from: "2026-11-03", to: "" }} today="2026-11-09" onValue={(range) => seen.push(range)} />));
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>("button[aria-label='Deadline']")!;
    await click(trigger);
    await click(text("Next 7 days"));
    expect(seen.at(-1)).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    await click(trigger);
    await click(text("Clear"));
    expect(seen.at(-1)).toEqual({ from: "", to: "" });
    expect(trigger.textContent).toContain("Any date");
  });
});
