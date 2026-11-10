// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import type { ContributorEntry } from "../../src/editorial/editorial-model";
import { AssigneePicker, WritersPicker } from "../../src/editorial/pickers";
import { hintFor, useWorkloadHints, type GetWorkloadHints, type WorkloadHints } from "../../src/editorial/workload-hints";

/**
 * Workload hints are advisory context in the people pickers
 * (docs/newsroom-roles.md#workload): quiet secondary text, never a reason to
 * disable, hide, reorder or recommend anyone.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const people: ContributorEntry[] = [
  { id: 1, name: "Caroline Elrod", kind: "user" },
  { id: 2, name: "Maycie Krajewski", kind: "user" },
  { id: 3, name: "Jordan Lee", kind: "user" },
  { id: 9, name: "Guest Photographer", kind: "guest" }
];
const hints: WorkloadHints = { "2": "2 active Stories · 1 review · 1 due this week", "9": "should never show for a guest" };

let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

async function render(node: React.ReactNode) {
  root = createRoot(host);
  await act(async () => { root!.render(<AdminPortalContext value={document.body}>{node}</AdminPortalContext>); });
}
async function open(label: string) {
  await act(async () => { host.querySelector<HTMLElement>(`[aria-label^='${label}']`)!.click(); });
}
const options = () => Array.from(document.body.querySelectorAll<HTMLElement>("[role=option]"));
const hintsShown = () => Array.from(document.body.querySelectorAll("[data-workload-hint]")).map((node) => node.textContent);

describe("people pickers with workload hints", () => {
  it("shows the hint under the name in the writers picker, for users who have one", async () => {
    await render(<WritersPicker people={people} value={[]} onChange={vi.fn()} hints={hints} />);
    await open("Writers:");
    expect(options().map((option) => option.textContent)).toEqual(["Caroline Elrod", "Maycie Krajewski2 active Stories · 1 review · 1 due this week", "Jordan Lee", "Guest Photographer"]);
    expect(hintsShown()).toEqual(["2 active Stories · 1 review · 1 due this week"]);
  });

  it("shows the hint in the editor (single) picker and keeps the name primary", async () => {
    await render(<AssigneePicker label="Editor" people={people} value={null} onChange={vi.fn()} hints={hints} />);
    await open("Editor:");
    const busy = options().find((option) => option.textContent?.startsWith("Maycie"))!;
    expect(busy.querySelector("span.truncate")?.textContent).toBe("Maycie Krajewski");
    expect(busy.querySelector("[data-workload-hint]")?.className).toContain("text-muted-foreground");
  });

  it("is advisory only: no one is disabled, hidden or reordered for being busy, and the busy person can be chosen", async () => {
    const onChange = vi.fn();
    await render(<AssigneePicker label="Editor" people={people} value={null} onChange={onChange} hints={hints} />);
    await open("Editor:");
    const rows = options();
    expect(rows.map((row) => row.textContent?.replace(/\d.*/, ""))).toEqual(["Caroline Elrod", "Maycie Krajewski", "Jordan Lee", "Guest Photographer"]);
    for (const row of rows) { expect(row.getAttribute("aria-disabled")).not.toBe("true"); expect(row.hasAttribute("data-disabled")).toBe(false); }
    await act(async () => { rows[1].click(); });
    expect(onChange.mock.calls[0][0]).toMatchObject({ id: 2, name: "Maycie Krajewski" });
  });

  it("renders names alone when the host supplies no hints", async () => {
    await render(<WritersPicker people={people} value={[]} onChange={vi.fn()} />);
    await open("Writers:");
    expect(hintsShown()).toEqual([]);
    expect(options().map((option) => option.textContent)).toEqual(people.map((person) => person.name));
  });

  it("hintFor only describes newsroom users", () => {
    expect(hintFor({ id: 2, kind: "user" }, hints)).toBe("2 active Stories · 1 review · 1 due this week");
    expect(hintFor({ id: 9, kind: "guest" }, hints)).toBeUndefined();
    expect(hintFor({ id: 3, kind: "user" }, hints)).toBeUndefined();
    expect(hintFor({ id: 2, kind: "user" }, undefined)).toBeUndefined();
  });
});

describe("useWorkloadHints", () => {
  function Probe({ get, enabled }: { get?: GetWorkloadHints; enabled?: boolean }) {
    const value = useWorkloadHints(get, enabled);
    return <output>{value ? JSON.stringify(value) : "none"}</output>;
  }
  const mount = async (children: React.ReactNode[], client = new QueryClient()) => {
    root = createRoot(host);
    await act(async () => { root!.render(<QueryClientProvider client={client}>{children}</QueryClientProvider>); });
    await act(async () => { await Promise.resolve(); });
  };

  it("fetches once for every picker on screen", async () => {
    const get = vi.fn<GetWorkloadHints>(async () => hints);
    await mount([<Probe key="a" get={get} />, <Probe key="b" get={get} />]);
    await vi.waitFor(() => expect(host.textContent).toBe(`${JSON.stringify(hints)}${JSON.stringify(hints)}`));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not fetch for someone who may not see workload, or when the host has no source", async () => {
    const get = vi.fn<GetWorkloadHints>(async () => hints);
    await mount([<Probe key="a" get={get} enabled={false} />, <Probe key="b" />]);
    expect(get).not.toHaveBeenCalled();
    expect(host.textContent).toBe("nonenone");
  });

  it("falls back to names alone if the hints fail to load", async () => {
    await mount([<Probe key="a" get={async () => { throw new Error("down"); }} />]);
    expect(host.textContent).toBe("none");
  });
});
