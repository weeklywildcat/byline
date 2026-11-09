import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LiveDeskResponse } from "../src/newsroom/live-coverage";

vi.mock("../src/ui/media/MediaWorkspaceShell", () => ({ useBylineMediaPicker: () => ({ available: () => true, label: "Link from Media", pick: async () => [] }) }));
vi.mock("../src/ui/shell/navigation", () => ({ ShellLink: ({ href, children, ...props }: { href: string; children?: ReactNode }) => <a href={href} {...props}>{children}</a> }));

const { LiveDeliveryButtons } = await import("../src/ui/live/LiveDelivery");
const { LiveCoverageValue } = await import("../src/ui/live/LiveCoverageProvider");
const { StoryModeControl } = await import("../src/ui/live/LiveModeControl");
const { LiveCoverageSection } = await import("../src/ui/live/LiveCoverageSection");
const { LiveTimeline } = await import("../src/ui/live/LiveTimeline");
const { parseRoute } = await import("../src/ui/field/FieldApp");

const desk = (over: Partial<LiveDeskResponse> = {}): LiveDeskResponse => ({
  storyId: 1, mode: "live", status: "live", startedAt: "2026-11-06T23:00:00.000Z", endedAt: null, storyPublished: true,
  canCompose: true, canManage: true, canPublish: true, canPublishNow: true, publishBlock: null, canControl: true,
  publishers: [{ id: 4, name: "Carol Reporter", avatarUrl: null }], updates: [], hasMore: false, ...over
});

function render(value: LiveDeskResponse | undefined, node: ReactNode, over: Record<string, unknown> = {}) {
  const state = {
    api: "/api", admin: "/admin", storyId: 1, timeZone: "America/New_York", readOnly: false, userId: 2, desk: value, loading: false, error: null, busy: false,
    fieldHref: "/admin/field?story=1&from=story", publishRef: createRef<never>(), setMode: () => {}, openSetup: () => {}, openPublishers: () => {}, goLive: async () => true, requestEnd: () => {}, ...over
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LiveCoverageValue value={state as never}>{node}</LiveCoverageValue>
    </QueryClientProvider>
  );
}

describe("live update delivery buttons", () => {
  it("offers Publish now and Send to desk only to someone who can publish right now", () => {
    const html = renderToStaticMarkup(<LiveDeliveryButtons canPublishNow disabled={false} onDeliver={() => {}} />);
    expect(html).toContain("Publish now");
    expect(html).toContain("Send to desk");
    expect(html).toContain("Publish now appears immediately to readers. Send to desk creates a draft for an editor.");
  });

  it("gives everyone else only Send to live desk, never a disabled Publish button", () => {
    const html = renderToStaticMarkup(<LiveDeliveryButtons canPublishNow={false} disabled={false} onDeliver={() => {}} />);
    expect(html).toContain("Send to live desk");
    expect(html).not.toContain("Publish now");
    expect(html).toContain("An editor will review this before readers see it.");
  });
});

describe("Story mode control", () => {
  it("is a labelled Standard/Live group that reflects the real mode", () => {
    const html = render(desk({ mode: "live" }), <StoryModeControl />);
    expect(html).toContain("Story mode");
    expect(html).toMatch(/aria-labelledby="story-mode-label"/);
    expect(html).toContain("Standard");
    expect(html).toContain("Live");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Live/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Standard/);
    const standard = render(desk({ mode: "standard", status: "off", startedAt: null }), <StoryModeControl />);
    expect(standard).toMatch(/aria-pressed="true"[^>]*>Standard/);
  });

  it("is disabled for staff in Live mode and absent for staff in Standard mode", () => {
    const staffLive = render(desk({ canControl: false, canPublish: false, canPublishNow: false }), <StoryModeControl />);
    expect(staffLive).toContain("Only editors can change the story mode.");
    expect(staffLive).toMatch(/disabled/);
    expect(render(desk({ canControl: false, mode: "standard", status: "off" }), <StoryModeControl />)).toBe("");
  });
});

describe("live coverage section under Write", () => {
  it("renders nothing in Standard mode, even with updates kept from earlier coverage", () => {
    const kept = [{ id: 1, title: "", text: "Earlier update", state: "published" as const, pinned: false, publishedAt: "2026-11-06T23:10:00.000Z", updatedAt: "2026-11-06T23:10:00.000Z", author: null, photo: null }];
    expect(render(desk({ mode: "standard", status: "ended", updates: kept }), <LiveCoverageSection />)).toBe("");
  });

  it("shows the prepared state with Go live and Open Field Mode for an editor on a public Story", () => {
    const html = render(desk({ status: "off", startedAt: null, canPublishNow: false, publishBlock: "coverage-not-started" }), <LiveCoverageSection />);
    expect(html).toContain("Ready for live coverage");
    expect(html).toContain("Direct publishers: Carol Reporter.");
    expect(html).toContain(">Go live<");
    expect(html).toContain("Open Field Mode");
    expect(html).toContain("/admin/field?story=1&amp;from=story");
    expect(html).toContain("Manage publishers");
    // Not started: no composer yet.
    expect(html).not.toContain("Post a live update");
  });

  it("says Publish & go live for a Story that was never published", () => {
    const html = render(desk({ status: "off", startedAt: null, storyPublished: false, canPublishNow: false, publishBlock: "story-not-public" }), <LiveCoverageSection />);
    expect(html).toContain("Publish &amp; go live");
  });

  it("gives staff the prepared message and no way to start coverage", () => {
    const html = render(desk({ status: "off", startedAt: null, canControl: false, canPublish: false, canPublishNow: false }), <LiveCoverageSection />);
    expect(html).toContain("Live coverage is ready but hasn&#x27;t started yet. You can continue reporting and use Field Mode.");
    expect(html).not.toContain("Go live");
    expect(html).not.toContain("Manage publishers");
    expect(html).toContain("Open Field Mode");
  });

  it("while live shows the badge, the composer with Publish now / Send to desk, and the controls", () => {
    const html = render(desk(), <LiveCoverageSection />);
    expect(html).toContain("LIVE");
    expect(html).toContain("Post a live update");
    expect(html).toContain("Publish now");
    expect(html).toContain("Send to desk");
    expect(html).toContain("End coverage");
    expect(html).toContain("Direct publishers");
  });

  it("gives a reporter without the grant only Send to live desk", () => {
    const html = render(desk({ canControl: false, canPublish: false, canPublishNow: false, canManage: false }), <LiveCoverageSection />);
    expect(html).toContain("Send to live desk");
    expect(html).not.toContain("Publish now");
    expect(html).not.toContain("End coverage");
  });

  it("removes the composer and every Publish now control once coverage ended, and offers Resume to editors", () => {
    const ended = desk({ status: "ended", endedAt: "2026-11-07T03:42:00.000Z", canPublishNow: false, publishBlock: "coverage-ended" });
    const html = render(ended, <LiveCoverageSection />);
    expect(html).toContain("Coverage ended");
    expect(html).toContain("Resume live coverage");
    expect(html).not.toContain("Post a live update");
    expect(html).not.toContain("Publish now");
    const staff = render({ ...ended, canControl: false, canPublish: false }, <LiveCoverageSection />);
    expect(staff).not.toContain("Resume live coverage");
    expect(staff).not.toContain("Publish now");
  });
});

describe("live timeline", () => {
  const update = (over: Record<string, unknown>) => ({ id: 1, title: "", text: "Final", state: "published" as const, pinned: false, publishedAt: "2026-11-07T03:40:00.000Z", updatedAt: "2026-11-07T03:40:00.000Z", author: { id: 2, name: "Alice Reporter", avatarUrl: null }, photo: null, ...over });

  it("names every state in words: Published, Draft · at desk, Key update", () => {
    const html = renderToStaticMarkup(<LiveTimeline timeZone="America/New_York" storyPublished updates={[update({ id: 1, pinned: true }), update({ id: 2, state: "draft", text: "Waiting" })]} />);
    expect(html).toContain("Published");
    expect(html).toContain("Draft · at desk");
    expect(html).toContain("Key update");
    expect(html).toContain("Alice Reporter");
    expect(html).toContain('dateTime="2026-11-07T03:40:00.000Z"');
  });

  it("shows no actions without controls (Field's read-only timeline)", () => {
    expect(renderToStaticMarkup(<LiveTimeline timeZone="America/New_York" storyPublished updates={[update({})]} />)).not.toContain("Actions for the update");
  });
});

describe("Field routing", () => {
  it("opens a Story straight from its link, skipping the picker, and remembers only that it came from the Story", () => {
    expect(parseRoute("?story=12&from=story")).toEqual({ story: 12, appointment: null, from: "story" });
    expect(parseRoute("?story=12&appointment=3")).toEqual({ story: 12, appointment: 3, from: null });
    expect(parseRoute("")).toEqual({ story: null, appointment: null, from: null });
  });

  it("never accepts a free-form return address (no open redirect)", () => {
    for (const from of ["https://evil.example/", "//evil.example", "/admin/collections/stories/1", "javascript:alert(1)", "Story", ""]) {
      expect(parseRoute(`?story=12&from=${encodeURIComponent(from)}`).from).toBeNull();
    }
    // `from` means nothing without a Story.
    expect(parseRoute("?from=story").from).toBeNull();
  });
});
