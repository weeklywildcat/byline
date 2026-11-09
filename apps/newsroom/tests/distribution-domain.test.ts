import { describe, expect, it } from "vitest";
import { validatePermalink, type DestinationKind } from "../src/distribution/destinations";
import {
  attentionReason, copyText, distributionProblems, distributionSettingsFrom, DISTRIBUTION_STATES,
  effectiveContent, missingIntents, needsApproval, policyFor, sentHistory, sentSnapshot, transitionProblem,
  type DistributionRecord, type DistributionState, type StoryState
} from "../src/distribution/model";

const story: StoryState = {
  headline: "Students restore the greenhouse", deck: "Volunteers reopen it Friday.",
  url: "https://paper.example/stories/greenhouse/", featuredMedia: 12, published: true, everPublished: true
};
const revised: StoryState = {
  ...story, headline: "Greenhouse reopens Friday", deck: "The public is invited.", featuredMedia: 24
};
function record(kind: DestinationKind, overrides: Partial<DistributionRecord> = {}): DistributionRecord {
  return {
    kind, state: "planned", expectation: "prepare", owner: null,
    headlineMode: "story", headline: null, textMode: "story", text: null, mediaMode: "story", media: null,
    plannedFor: null, scheduledFor: null, permalink: null, approvedAt: null, sent: [], failure: null, ...overrides
  };
}

describe("Distribution settings and policy", () => {
  it("prepares Instagram and Facebook, seeds eligible Newsletter, and suggests School TVs", () => {
    const settings = distributionSettingsFrom({ customized: false, destinations: [] });
    expect(policyFor(settings, { preset: null, section: null })).toEqual([
      { kind: "instagram", level: "prepare" }, { kind: "facebook", level: "prepare" },
      { kind: "newsletter", level: "eligible" }, { kind: "school-tvs", level: "optional" }
    ]);
    expect(Object.values(settings.destinations).filter((item) => item.requiresApproval).map((item) => item.kind)).toEqual(["instagram", "facebook"]);
    expect(Object.values(settings.destinations).filter((item) => !item.enabled).map((item) => item.kind)).toEqual(["discord", "youtube", "other"]);
  });

  it("drops invalid settings rows, uses secure account addresses, and treats omitted destinations as off", () => {
    const settings = distributionSettingsFrom({
      customized: true,
      destinations: [null, { kind: "unknown" },
        { kind: "discord", enabled: true, label: " School Discord ", accountUrl: "https://discord.com", requiresApproval: true },
        { kind: "youtube", enabled: true, accountUrl: "https://user:secret@example.com" },
        { kind: "other", enabled: true, accountUrl: "http://example.com" }],
      rules: [null, { destination: "other", level: "automatic" }]
    });
    expect(settings.rules).toEqual([]);
    expect(settings.destinations.discord).toEqual({ kind: "discord", enabled: true, label: "School Discord", accountUrl: "https://discord.com/", requiresApproval: true });
    expect(settings.destinations.youtube.accountUrl).toBeNull();
    expect(settings.destinations.other.accountUrl).toBeNull();
    expect(settings.destinations.instagram.enabled).toBe(false);
  });

  it("uses the first matching rule and never seeds optional, disabled or existing intents", () => {
    const settings = distributionSettingsFrom({
      customized: true,
      destinations: ["instagram", "facebook", "newsletter", "other"].map((kind) => ({ kind, enabled: true })),
      rules: [
        { destination: "instagram", level: "optional", presets: ["news"], sections: [{ id: 42 }] },
        { destination: "instagram", level: "prepare" },
        { destination: "facebook", level: "prepare", sections: [42] },
        { destination: "discord", level: "prepare" },
        { destination: "newsletter", level: "eligible", presets: ["news"] }
      ]
    });
    const news = policyFor(settings, { preset: "news", section: 42 });
    expect(news).toEqual([{ kind: "instagram", level: "optional" }, { kind: "facebook", level: "prepare" }, { kind: "newsletter", level: "eligible" }]);
    expect(missingIntents(news, ["facebook"])).toEqual([{ kind: "newsletter", level: "eligible" }]);
    expect(policyFor(settings, { preset: "blank", section: 9 })).toEqual([{ kind: "instagram", level: "prepare" }]);
  });
});

describe("effective content and readiness", () => {
  it("follows each Story slot independently, including switching back with a stored override", () => {
    const inherited = record("facebook");
    expect(effectiveContent(inherited, story)).toEqual({ headline: story.headline, text: story.deck, mediaId: 12, url: story.url });
    expect(effectiveContent(inherited, revised)).toEqual({ headline: revised.headline, text: revised.deck, mediaId: 24, url: story.url });
    const custom = record("facebook", { textMode: "custom", text: "For alumni", mediaMode: "custom", media: 77 });
    expect(effectiveContent(custom, revised)).toMatchObject({ headline: revised.headline, text: "For alumni", mediaId: 77 });
    expect(effectiveContent({ ...custom, textMode: "story", mediaMode: "story" }, revised)).toMatchObject({ text: revised.deck, mediaId: 24 });
    expect(effectiveContent({ ...custom, mediaMode: "none" }, revised).mediaId).toBeNull();
    expect(effectiveContent(record("instagram", { textMode: "custom", text: "Come Friday!" }), revised)).toMatchObject({ text: "Come Friday!", mediaId: 24 });
  });

  it("copies text appropriate to each channel", () => {
    const copy = (kind: DestinationKind) => copyText(kind, effectiveContent(record(kind), story));
    expect(copy("instagram")).toBe([story.headline, story.deck].join("\n\n"));
    expect(copy("facebook")).toBe([story.headline, story.deck, story.url].join("\n\n"));
    expect(copy("discord")).toBe([story.headline, story.url].join("\n\n"));
    expect(copy("school-tvs")).toBe(story.headline);
  });

  it("blocks required and excessive copy, missing images, and ordinary Media gaps", () => {
    const instagram = record("instagram");
    expect(distributionProblems(instagram, { headline: null, text: " ", mediaId: null, url: null }, story)).toEqual([
      { message: "Add a caption.", blocks: "ready" }, { message: "Choose an image.", blocks: "ready" }
    ]);
    const facebook = record("facebook");
    const effective = { headline: " ", text: "x".repeat(2001), mediaId: 77, url: story.url };
    expect(distributionProblems(facebook, effective, story, ["The image is no longer in Media."])).toEqual([
      { message: "Add a headline.", blocks: "ready" },
      { message: "The description is 2,001 characters; Facebook allows 2,000.", blocks: "ready" },
      { message: "The image is no longer in Media.", blocks: "ready" }
    ]);
  });

  it("distinguishes a first publication from an unpublish and blocks both at send", () => {
    const facebook = record("facebook");
    const effective = effectiveContent(facebook, story);
    expect(distributionProblems(facebook, effective, { published: false, everPublished: false })).toEqual([
      { message: "Publish the Story before it goes out.", blocks: "post" }
    ]);
    expect(distributionProblems(facebook, effective, { published: false, everPublished: true })).toEqual([
      { message: "The Story is unpublished. Nothing new goes out until it is published again.", blocks: "post" }
    ]);
  });
});

describe("workflow", () => {
  const allowed: Record<DistributionState, DistributionState[]> = {
    planned: ["draft", "ready", "scheduled", "posted", "skipped"],
    draft: ["ready", "scheduled", "posted", "skipped"], ready: ["draft", "scheduled", "posted", "skipped"],
    scheduled: ["ready", "posted", "skipped"], posted: ["draft"], skipped: ["planned"], failed: ["draft", "ready", "skipped"]
  };
  it.each(DISTRIBUTION_STATES)("enforces every transition from %s for staff and editors", (from) => {
    for (const to of DISTRIBUTION_STATES) {
      const editorAllowed = from === to || allowed[from].includes(to);
      const staffAllowed = from === to || (editorAllowed && to !== "skipped" && !["posted", "skipped", "failed"].includes(from));
      expect(transitionProblem(from, to, { editor: true }) === null, `editor: ${from} → ${to}`).toBe(editorAllowed);
      expect(transitionProblem(from, to, { editor: false }) === null, `staff: ${from} → ${to}`).toBe(staffAllowed);
    }
  });

  it("requires approval for unapproved staff work only where configured", () => {
    expect(needsApproval({ requiresApproval: true }, { approvedAt: null }, { editor: false })).toBe(true);
    expect(needsApproval({ requiresApproval: true }, { approvedAt: "2026-11-09" }, { editor: false })).toBe(false);
    expect(needsApproval({ requiresApproval: true }, { approvedAt: null }, { editor: true })).toBe(false);
    expect(needsApproval({ requiresApproval: false }, { approvedAt: null }, { editor: false })).toBe(false);
  });

  const overdue = "2026-11-09T09:00:00Z";
  const upcoming = "2026-11-09T13:00:00Z";
  it.each<[Partial<DistributionRecord>, string | null]>([
    [{ state: "failed" }, "Failed"], [{ state: "ready" }, "Needs approval"],
    [{ state: "ready", approvedAt: overdue }, null], [{ plannedFor: overdue }, "Overdue"],
    [{ state: "draft", plannedFor: overdue }, "Overdue"], [{ state: "draft" }, "Choose an image"],
    [{}, "Not started"], [{ plannedFor: upcoming }, null], [{ expectation: "eligible" }, null],
    [{ expectation: "optional" }, null], [{ state: "scheduled", scheduledFor: overdue }, "Not confirmed"],
    [{ state: "scheduled", scheduledFor: "2026-11-09T10:00:00Z" }, null],
    [{ state: "posted", plannedFor: overdue }, null], [{ state: "skipped", plannedFor: overdue }, null]
  ])("gives work in %j the correct attention cue", (overrides, reason) => {
    expect(attentionReason(record("instagram", overrides), [{ message: "Choose an image.", blocks: "ready" }], {
      now: Date.parse("2026-11-09T12:00:00Z"), requiresApproval: true
    })).toBe(reason);
  });

  it("freezes sent facts and retains earlier attempts alongside a repost", () => {
    const item = record("facebook");
    const at = "2026-11-09T12:00:00Z";
    const first = sentSnapshot(item, effectiveContent(item, story), { at, by: 9, label: "Facebook", permalink: "https://www.facebook.com/paper/posts/12345" });
    const second = sentSnapshot(item, effectiveContent(item, revised), { at, by: 10, label: "Facebook", permalink: "https://www.facebook.com/paper/posts/12346" });
    expect(sentHistory([first, null, "legacy", { at, destination: "unknown" }, second])).toEqual([first, second]);
    expect(first).toEqual({
      at, by: 9, destination: "facebook", label: "Facebook", headline: story.headline, text: story.deck,
      mediaIds: [12], storyUrl: story.url, permalink: "https://www.facebook.com/paper/posts/12345"
    });
    expect(second).toMatchObject({ headline: revised.headline, text: revised.deck, mediaIds: [24] });
    expect(sentHistory(null)).toEqual([]);
  });
});

describe("final permalinks", () => {
  it.each<[DestinationKind, string, string]>([
    ["instagram", "https://instagram.com/p/Abc123/?igsh=tracking", "https://www.instagram.com/p/Abc123/"],
    ["instagram", "https://www.instagram.com/reel/Abc123/", "https://www.instagram.com/reel/Abc123/"],
    ["facebook", "https://m.facebook.com/paper/posts/123456?ref=feed", "https://www.facebook.com/paper/posts/123456"],
    ["facebook", "https://www.facebook.com/reel/123456/", "https://www.facebook.com/reel/123456"],
    ["youtube", "https://youtu.be/dQw4w9WgXcQ?t=1", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["discord", "https://canary.discord.com/channels/12345/23456/34567/?ref=x", "https://discord.com/channels/12345/23456/34567"],
    ["other", "https://example.com/posts/123#comments", "https://example.com/posts/123"]
  ])("canonicalizes a %s post address %s", (kind, input, url) => {
    expect(validatePermalink(kind, input)).toEqual({ ok: true, url });
  });

  it.each<[DestinationKind, string]>([
    ["instagram", "https://instagram.com/paper/"], ["instagram", "https://instagram.com/stories/paper/123456/"],
    ["instagram", "http://instagram.com/p/Abc123/"], ["instagram", "https://instagram.com.example.test/p/Abc123/"],
    ["instagram", "https://facebook.com/paper/posts/123456"], ["instagram", "https://instagr.am/p/Abc123/"], ["instagram", "invalid"],
    ["facebook", "https://facebook.com/paper"], ["facebook", "https://facebook.com/profile.php?id=123456"],
    ["facebook", "https://instagram.com/p/Abc123/"], ["facebook", "https://evil.facebook.com/paper/posts/123456"],
    ["facebook", "https://facebook.com/share/p/Abc123/"], ["facebook", "not a URL"],
    ["youtube", "https://youtube.com/@weeklywildcat"], ["discord", "https://discord.com/channels/12345/23456"],
    ["discord", "https://discord.com.example.test/channels/12345/23456/34567"],
    ["other", "https://user:pass@example.com/post"], ["other", "https://example.com:444/post"],
    ["other", "https://exam\tple.com/post"], ["other", "javascript:alert(1)"]
  ])("rejects an invalid %s address %s", (kind, input) => {
    expect(validatePermalink(kind, input)).toMatchObject({ ok: false, message: expect.any(String) });
  });
});
