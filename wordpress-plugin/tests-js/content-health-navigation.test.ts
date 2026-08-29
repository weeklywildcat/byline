// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { contentHealthFixHref, CONTENT_HEALTH_FIX_TARGET_QUERY_PARAM } from "../src/planning/content-health-navigation";
import { normalizeContentHealthFixTarget, normalizeContentHealthResponse } from "../src/planning/planning-api";
import { resolveContentHealthBlockPath, type ContentHealthEditorBlock } from "../src/planning/planning-model";
import {
  consumeStorySidebarNavigation,
  createStorySidebarPanelOpenState,
  focusStorySidebarPanel,
  normalizeStorySidebarNavigationCommand,
  publishStorySidebarNavigation,
  setStorySidebarPanelOpen,
  STORY_SIDEBAR_NAVIGATION_EVENT,
  STORY_SIDEBAR_PANEL_IDS,
  subscribeToStorySidebarNavigation
} from "../src/editorial/story-sidebar-navigation";

describe("Content Health navigation", () => {
  it("normalizes structured locators without accepting ephemeral clientIds", () => {
    const target = normalizeContentHealthFixTarget({
      kind: "block",
      blockPath: [1, 0],
      blockName: "core/paragraph",
      attribute: "content",
      valueFingerprint: "ABCDEF1234567890",
      clientId: "session-only"
    });

    expect(target).toEqual({
      kind: "block",
      blockPath: [1, 0],
      blockName: "core/paragraph",
      attribute: "content",
      valueFingerprint: "abcdef1234567890"
    });

    const response = normalizeContentHealthResponse({
      issues: [{
        id: "broken-link",
        severity: "error",
        postId: 9,
        fixUrl: "/wp-admin/post.php?post=9&action=edit",
        fixTarget: { kind: "featured-image" }
      }]
    });
    expect(response.issues[0].fixTarget).toEqual({ kind: "featured-image" });
  });

  it("accepts only the closed Story panel vocabulary", () => {
    expect(normalizeContentHealthFixTarget({ kind: "story-sidebar", panel: "tasks" })).toEqual({
      kind: "story-sidebar",
      panel: "tasks"
    });

    for (const value of [
      { kind: "story-sidebar", panel: "story" },
      { kind: "story-sidebar", panel: "tasks", selector: ".components-panel__body" },
      { kind: "story-sidebar", panel: "tasks", clientId: "session-only" },
      { kind: "story-sidebar", panel: "tasks", target: "#arbitrary-dom-node" }
    ]) {
      expect(normalizeContentHealthFixTarget(value)).toBeNull();
    }
  });

  it("resolves an exact saved-tree path to the current runtime block", () => {
    const blocks: ContentHealthEditorBlock[] = [
      { name: "core/heading", clientId: "heading-runtime" },
      {
        name: "core/group",
        clientId: "group-runtime",
        innerBlocks: [
          { name: "core/paragraph", clientId: "paragraph-runtime", attributes: { content: "A broken link" } }
        ]
      }
    ];

    const block = resolveContentHealthBlockPath(blocks, {
      kind: "block",
      blockPath: [1, 0],
      blockName: "core/paragraph",
      attribute: "content"
    });

    expect(block?.clientId).toBe("paragraph-runtime");
  });

  it("falls back to the unchanged generic editor URL when a locator is stale", () => {
    const stale = resolveContentHealthBlockPath(
      [{ name: "core/paragraph", clientId: "current" }],
      { kind: "block", blockPath: [2], blockName: "core/paragraph" }
    );
    expect(stale).toBeNull();

    const generic = "/wp-admin/post.php?post=9&action=edit";
    expect(contentHealthFixHref({ fixUrl: generic, story: null, fixTarget: null })).toBe(generic);

    const targeted = contentHealthFixHref({
      fixUrl: `${generic}#editor`,
      story: null,
      fixTarget: { kind: "block", blockPath: [0], blockName: "core/paragraph" }
    });
    expect(targeted).not.toBeNull();
    if (!targeted) return;
    expect(targeted).toContain(`${CONTENT_HEALTH_FIX_TARGET_QUERY_PARAM}=`);
    expect(targeted).toContain("#editor");
    expect((targeted.match(/clientId/g) || []).length).toBe(0);
  });
});

describe("Story sidebar contextual navigation", () => {
  afterEach(() => {
    delete window.bylineStorySidebarNavigation;
  });

  it.each(STORY_SIDEBAR_PANEL_IDS)("focuses exactly the %s PanelBody", (panel) => {
    const initial = createStorySidebarPanelOpenState();
    const focused = focusStorySidebarPanel(initial, panel);

    expect(focused).toEqual(Object.fromEntries(
      STORY_SIDEBAR_PANEL_IDS.map((id) => [id, id === panel])
    ));
  });

  it("preserves ordinary user toggles but rejects an unknown panel", () => {
    const initial = createStorySidebarPanelOpenState();
    const opened = setStorySidebarPanelOpen(initial, "tasks", true);
    expect(opened.tasks).toBe(true);
    expect(opened.workflow).toBe(true);

    expect(setStorySidebarPanelOpen(initial, "document", true)).toBe(initial);
    expect(focusStorySidebarPanel(initial, "document")).toBe(initial);
  });

  it("publishes and consumes one validated command for every supported panel", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToStorySidebarNavigation(window, (command) => received.push(command));

    for (const panel of STORY_SIDEBAR_PANEL_IDS) {
      expect(publishStorySidebarNavigation({ panel }, window)).toBe(true);
      expect(received.at(-1)).toEqual({ panel });
      expect(consumeStorySidebarNavigation(window)).toEqual({ panel });
      expect(consumeStorySidebarNavigation(window)).toBeNull();
    }

    unsubscribe();
  });

  it("rejects invalid commands and never forwards arbitrary selectors", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToStorySidebarNavigation(window, (command) => received.push(command));

    for (const value of [
      null,
      undefined,
      [],
      { panel: "unknown" },
      { panel: "tasks", selector: ".components-panel__body" },
      { panel: "tasks", clientId: "session-only" },
      { panel: "tasks", domPath: ["#wpadminbar"] }
    ]) {
      expect(normalizeStorySidebarNavigationCommand(value)).toBeNull();
      expect(publishStorySidebarNavigation(value, window)).toBe(false);
    }

    window.dispatchEvent(new CustomEvent(STORY_SIDEBAR_NAVIGATION_EVENT, {
      detail: { panel: "tasks", selector: ".components-panel__body" }
    }));

    expect(received).toEqual([]);
    expect(consumeStorySidebarNavigation(window)).toBeNull();
    unsubscribe();
  });
});
