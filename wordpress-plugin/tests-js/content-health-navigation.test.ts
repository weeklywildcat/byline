import { describe, expect, it } from "vitest";

import { contentHealthFixHref, CONTENT_HEALTH_FIX_TARGET_QUERY_PARAM } from "../src/planning/content-health-navigation";
import { normalizeContentHealthFixTarget, normalizeContentHealthResponse } from "../src/planning/planning-api";
import { resolveContentHealthBlockPath, type ContentHealthEditorBlock } from "../src/planning/planning-model";

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
