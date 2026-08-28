import { describe, expect, it } from "vitest";

import {
  addStoryIdempotently,
  availableNewsletterActions,
  canTransitionNewsletter,
  createBlankNewsletter,
  normalizeNewsletterDraft,
  type NewsletterProvider
} from "./models";

const connectedProvider: NewsletterProvider = {
  id: "test-provider",
  label: "Test provider",
  configured: true,
  connectionStatus: "connected",
  capabilities: {
    signup: true,
    audienceDiscovery: true,
    connectionTest: true,
    sendTest: true,
    immediateSend: true,
    remoteScheduling: false,
    stats: true
  }
};

describe("newsletter issue model", () => {
  it("offers only explicitly supported provider actions", () => {
    expect(availableNewsletterActions({ status: "draft" }, connectedProvider)).toEqual(["sendTest", "send"]);
    expect(availableNewsletterActions({ status: "scheduled" }, connectedProvider)).toEqual(["cancel"]);
    expect(availableNewsletterActions({ status: "sent" }, connectedProvider)).toEqual(["stats"]);
    expect(availableNewsletterActions({ status: "draft" }, { ...connectedProvider, configured: false })).toEqual([]);
    expect(availableNewsletterActions({ status: "draft" }, { ...connectedProvider, capabilities: { ...connectedProvider.capabilities, remoteScheduling: true } })).toContain("schedule");
  });

  it("keeps send states directional and sent issues terminal", () => {
    expect(canTransitionNewsletter("draft", "scheduled")).toBe(true);
    expect(canTransitionNewsletter("scheduled", "draft")).toBe(true);
    expect(canTransitionNewsletter("sending", "sent")).toBe(true);
    expect(canTransitionNewsletter("sent", "draft")).toBe(false);
    expect(canTransitionNewsletter("draft", "sent")).toBe(false);
  });

  it("adds stories idempotently and keeps lead/additional ordering distinct", () => {
    const blank = createBlankNewsletter();
    const withAdditional = addStoryIdempotently(blank, 12, "additional");
    expect(addStoryIdempotently(withAdditional, 12, "additional")).toEqual(withAdditional);
    const withLead = addStoryIdempotently(withAdditional, 12, "lead");
    expect(withLead.leadStoryId).toBe(12);
    expect(withLead.additionalStoryIds).toEqual([]);
    expect(addStoryIdempotently(withLead, 13, "additional").additionalStoryIds).toEqual([13]);
  });

  it("normalizes duplicate and invalid story IDs before a save", () => {
    const draft = createBlankNewsletter();
    const normalized = normalizeNewsletterDraft({
      ...draft,
      title: "  Weekly issue  ",
      subject: "  Subject  ",
      leadStoryId: 10,
      additionalStoryIds: [10, 11, 11, 0, -2, 12.4]
    });
    expect(normalized.title).toBe("Weekly issue");
    expect(normalized.subject).toBe("Subject");
    expect(normalized.additionalStoryIds).toEqual([11]);
  });
});
