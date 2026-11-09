import { describe, expect, it } from "vitest";
import { validateArticleBody, type MediaId } from "@byline/article-body";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_MEDIA, FIXTURE_NATIVE_CHART, FIXTURE_REFERENCES, FIXTURE_TRACKER_KEY } from "@byline/article-body/fixtures";
import { BLOCK_FIELD_READERS, articleBlockFromFields } from "../src/fields";
import { collectMediaIds, collectMediaUses, normalizePayloadArticleBody } from "../src/normalize";
import { enforcePrivilegedBlocks } from "../src/permissions";
import { BYLINE_BODY_BLOCKS, BYLINE_SOURCE_BLOCK } from "../src/schema";
import { blockFields, lexicalFromArticleBody } from "./lexical-fixture";

const media = (id: MediaId) => FIXTURE_MEDIA[String(id)] ?? null;
const references = { event: (id: MediaId) => FIXTURE_REFERENCES.events?.[String(id)] ?? null, tracker: (key: string) => key === FIXTURE_TRACKER_KEY };
const text = (value: string) => ({ type: "text", text: value, format: 0, detail: 0, mode: "normal", style: "", version: 1 });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", children, direction: "ltr", format: "", indent: 0, version: 1 });
const inline = (fields: Record<string, unknown>) => ({ type: "inlineBlock", version: 1, fields: { blockName: "", ...fields } });
const state = (...children: unknown[]) => ({ root: { type: "root", children } });
const block = (fields: Record<string, unknown>) => ({ type: "block", version: 2, format: "", fields });

describe("inline Source references", () => {
  const web = (id: string, url = "https://example.org/report") => inline({ id, blockType: "source", kind: "web", url, label: "The report", note: "" });
  const pdf = (id: string, page: number | null = 4) => inline({ id, blockType: "source", kind: "document", url: "", media: 201, page, label: "Budget request", note: "" });
  const footnote = (id: string) => inline({ id, blockType: "footnote", text: "A note." });

  it("normalize next to footnotes and number apart from them", () => {
    const { body, issues } = normalizePayloadArticleBody(state(paragraph(text("A claim."), footnote("f1"), web("s1"), text(" Another."), pdf("s2"))), { media });
    expect(issues).toEqual([]);
    expect(body.nodes[0]).toEqual({ type: "paragraph", children: [
      { type: "text", text: "A claim." },
      { type: "footnote", id: "f1", text: "A note." },
      { type: "source", id: "s1", kind: "web", url: "https://example.org/report", label: "The report" },
      { type: "text", text: " Another." },
      { type: "source", id: "s2", kind: "document", media: 201, page: 4, label: "Budget request" }
    ] });
    // The PDF a source points at joins the media table, and the whole body validates.
    expect(Object.keys(body.media)).toEqual(["201"]);
    expect(validateArticleBody(body).ok).toBe(true);
    expect(collectMediaIds(state(paragraph(pdf("s2"))))).toEqual([201]);
  });

  it("requires publication-ready media for inline PDFs alongside block media", () => {
    const body = state(block({ blockType: "document", media: 201 }), paragraph(web("s1"), pdf("s2"), inline({ blockType: "source", kind: "document" })));
    expect(collectMediaIds(body)).toEqual([201]);
    expect(collectMediaUses(body)).toEqual([{ id: 201, hasAltOverride: false }, { id: 201, hasAltOverride: false }]);
  });

  it("report an unfinished source instead of publishing a dead reference", () => {
    const { body, issues } = normalizePayloadArticleBody(state(paragraph(text("Claim."), web("s1", "javascript:alert(1)"))), { media });
    expect(body.nodes[0]).toEqual({ type: "paragraph", children: [{ type: "text", text: "Claim." }] });
    expect(issues).toMatchObject([{ kind: "source", code: "source-incomplete" }]);
  });

  it("renumber a copied source id so anchors stay unique", () => {
    const { body, issues } = normalizePayloadArticleBody(state(paragraph(text("Claim."), web("s1"), web("s1"))), { media });
    expect((body.nodes[0] as { children: Array<{ id?: string }> }).children.flatMap((child) => (child.id ? [child.id] : []))).toEqual(["s1", "s1-2"]);
    expect(issues).toMatchObject([{ kind: "source", code: "source-duplicate" }]);
  });

  it("is a bounded Payload inline block that never names the private sources collection", () => {
    expect(BYLINE_SOURCE_BLOCK.slug).toBe("source");
    const relations = JSON.stringify(BYLINE_SOURCE_BLOCK.fields);
    expect(relations).toContain('"relationTo":"media"');
    expect(relations).not.toContain('"relationTo":"sources"');
  });
});

describe("stored fields of the new and changed tools", () => {
  it("reads galleries saved before layouts as a grid", () => {
    const old = { items: FIXTURE_BLOCKS.gallery.items, fit: "crop" };
    expect(BLOCK_FIELD_READERS.gallery(old).layout).toBe("grid");
    expect(articleBlockFromFields("gallery", "g", { ...old, layout: "featured" })).toMatchObject({ layout: "featured", fit: "crop" });
  });

  it("stores only a permalink for a Social Post and derives the rest", () => {
    const fields = BYLINE_BODY_BLOCKS.socialPost.fields.map((field) => ("name" in field ? field.name : ""));
    expect(fields).toEqual(["url", "caption"]);
    expect(articleBlockFromFields("socialPost", "s", { url: "https://www.instagram.com/p/C0ffEeLunch1/" })).toMatchObject({ provider: "instagram", postId: "C0ffEeLunch1" });
    const { body, issues } = normalizePayloadArticleBody(state(block({ id: "s", blockType: "socialPost", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "" })), { media });
    expect(body.nodes).toEqual([]);
    expect(issues).toMatchObject([{ kind: "block", issue: { code: "social-url", effect: "omitted" } }]);
  });

  it("stores only the Event relationship, resolved from the published Event", () => {
    const fields = BYLINE_BODY_BLOCKS.event.fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ name: "event", type: "relationship", relationTo: "events", filterOptions: { _status: { equals: "published" } } });
    const { body } = normalizePayloadArticleBody(state(block(blockFields(FIXTURE_BLOCKS.event))), { media, references });
    expect(body.references?.events).toEqual(FIXTURE_REFERENCES.events);
    expect(normalizePayloadArticleBody(state(block(blockFields(FIXTURE_BLOCKS.event))), { media }).issues).toMatchObject([{ kind: "block", issue: { code: "event-unavailable" } }]);
  });

  it("gives Final Score no sports relationships, only typed text and numbers", () => {
    const fields = BYLINE_BODY_BLOCKS.finalScore.fields;
    expect(fields.every((field) => "type" in field && ["text", "number", "select"].includes(field.type))).toBe(true);
    expect(JSON.stringify(fields)).not.toMatch(/relationTo|games|teams|seasons/);
  });

  it("round-trips a native chart and its table through Lexical", () => {
    const { body } = normalizePayloadArticleBody(state(block(blockFields(FIXTURE_NATIVE_CHART))), { media });
    expect(body.nodes).toEqual([FIXTURE_NATIVE_CHART]);
  });

  it("keeps a tracker privileged: a staff writer cannot add one", () => {
    const previous = state();
    const next = state(block(blockFields(FIXTURE_BLOCKS.repositoryTracker)));
    expect(enforcePrivilegedBlocks(next, previous).rejected).toEqual(["blk-tracker"]);
  });

  it("round-trips the whole fixture, Sources, Context formatting and all", () => {
    const { body, issues } = normalizePayloadArticleBody(lexicalFromArticleBody(FIXTURE_ARTICLE_BODY), {
      media,
      references: { story: (id) => FIXTURE_REFERENCES.stories?.[String(id)] ?? null, poll: (id) => FIXTURE_REFERENCES.polls?.[String(id)] ?? null, interactive: () => true, ...references }
    });
    expect(issues).toEqual([]);
    expect(body.nodes).toEqual(FIXTURE_ARTICLE_BODY.nodes);
    expect(body.references).toEqual(FIXTURE_REFERENCES);
  });
});
