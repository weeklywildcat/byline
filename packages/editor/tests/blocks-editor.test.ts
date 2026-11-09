import { describe, expect, it } from "vitest";
import { ARTICLE_BLOCK_TYPES, ARTICLE_BLOCKS, type ArticleBlock, type MediaId } from "@byline/article-body";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_INTERACTIVE_KEY, FIXTURE_MEDIA, FIXTURE_TRACKER_KEY, FIXTURE_REFERENCES } from "@byline/article-body/fixtures";
import { BLOCK_FIELD_READERS } from "../src/fields";
import { collectReferenceIds, normalizePayloadArticleBody } from "../src/normalize";
import { enforcePrivilegedBlocks, hasPrivilegedBlocks } from "../src/permissions";
import { articleBodyFeatures, BYLINE_FOOTNOTE_BLOCK } from "../src/server";
import { BYLINE_BODY_BLOCKS } from "../src/schema";
import { blockFields, lexicalFromArticleBody } from "./lexical-fixture";

const media = (id: MediaId) => FIXTURE_MEDIA[String(id)] ?? null;
const references = { story: (id: MediaId) => FIXTURE_REFERENCES.stories?.[String(id)] ?? null, poll: (id: MediaId) => FIXTURE_REFERENCES.polls?.[String(id)] ?? null, event: (id: string | number) => FIXTURE_REFERENCES.events?.[String(id)] ?? null, interactive: (key: string) => key === FIXTURE_INTERACTIVE_KEY, tracker: (key: string) => key === FIXTURE_TRACKER_KEY };
const normalize = (state: unknown, refs = references) => normalizePayloadArticleBody(state, { media, references: refs });

const block = (value: ArticleBlock) => ({ type: "block", version: 2, format: "", fields: blockFields(value) });
const paragraph = (text: string) => ({ type: "paragraph", version: 1, children: [{ type: "text", text, format: 0, detail: 0, mode: "normal", style: "", version: 1 }] });
const state = (...children: unknown[]) => ({ root: { type: "root", version: 1, children } });
const footnote = (id: string, text: string) => ({ type: "inlineBlock", version: 1, fields: { id, blockType: "footnote", blockName: "", text } });

describe("Payload block configs for every tool", () => {
  it("name the media they relate to, and only Media", () => {
    const uploads = (fields: unknown[]): Array<{ name: string; relationTo: string }> => fields.flatMap((field) => {
      const value = field as { type?: string; name?: string; relationTo?: string; fields?: unknown[] };
      return [...(value.type === "upload" ? [{ name: value.name ?? "", relationTo: value.relationTo ?? "" }] : []), ...(value.fields ? uploads(value.fields) : [])];
    });
    for (const type of ARTICLE_BLOCK_TYPES) for (const upload of uploads(BYLINE_BODY_BLOCKS[type].fields)) expect(upload.relationTo, `${type}.${upload.name}`).toBe("media");
    expect(uploads(BYLINE_BODY_BLOCKS.audio.fields)).toEqual([{ name: "media", relationTo: "media" }]);
    expect(uploads(BYLINE_BODY_BLOCKS.beforeAfter.fields).map((upload) => upload.name)).toEqual(["before", "after"]);
  });

  it("relate Related Coverage to stories and Poll to polls, never copying their facts", () => {
    const find = (type: "relatedCoverage" | "poll") => JSON.stringify(BYLINE_BODY_BLOCKS[type].fields);
    expect(find("relatedCoverage")).toContain('"relationTo":"stories"');
    expect(find("poll")).toContain('"relationTo":"polls"');
    for (const copied of ["headline", "deck", "thumbnail", "question", "options"]) {
      expect(find("relatedCoverage")).not.toContain(`"name":"${copied}"`);
      expect(find("poll")).not.toContain(`"name":"${copied}"`);
    }
  });

  it("offer no page-builder controls", () => {
    const all = JSON.stringify(ARTICLE_BLOCK_TYPES.map((type) => BYLINE_BODY_BLOCKS[type].fields));
    for (const forbidden of ["color", "fontSize", "fontFamily", "padding", "margin", "width", "columnCount", "html", "css", "script", "iframe", "srcdoc", "embedCode"]) expect(all, forbidden).not.toContain(`"name":"${forbidden}"`);
  });

  it("make Footnote the one inline block, and no standalone Footnotes block", () => {
    expect(BYLINE_FOOTNOTE_BLOCK.slug).toBe("footnote");
    expect(Object.keys(BYLINE_BODY_BLOCKS)).not.toContain("footnote");
    expect(ARTICLE_BLOCKS).not.toHaveProperty("footnote");
    expect(articleBodyFeatures().length).toBeGreaterThan(0);
  });

  it("keep the prose surface small: no tables, uploads, underline or alignment features", () => {
    const keys = articleBodyFeatures().map((feature) => (feature as { key?: string }).key);
    for (const forbidden of ["experimental_table", "upload", "underline", "strikethrough", "align", "indent", "inlineCode", "subscript", "superscript", "textState", "relationship", "horizontalRule"]) expect(keys).not.toContain(forbidden);
  });
});

describe("footnotes in the normalizer", () => {
  it("keeps a reference's id and note, in order, and nothing else from the editor node", () => {
    const { body, issues } = normalize(state({ ...paragraph("Claim."), children: [{ type: "text", text: "Claim.", format: 0 }, footnote("n1", "  The source.  ")] }));
    expect(issues).toEqual([]);
    expect(body.nodes).toEqual([{ type: "paragraph", children: [{ type: "text", text: "Claim." }, { type: "footnote", id: "n1", text: "The source." }] }]);
    expect(JSON.stringify(body)).not.toMatch(/blockType|blockName|inlineBlock/);
  });

  it("drops an empty note with a reported issue, and repairs a duplicated id", () => {
    const { body, issues } = normalize(state({ type: "paragraph", children: [{ type: "text", text: "A", format: 0 }, footnote("x", " "), footnote("y", "One"), footnote("y", "Two")] }));
    expect(issues.map((issue) => (issue.kind === "footnote" ? issue.code : issue.kind))).toEqual(["footnote-empty", "footnote-duplicate"]);
    const ids = (body.nodes[0] as { children: Array<{ type: string; id?: string }> }).children.filter((child) => child.type === "footnote").map((child) => child.id);
    expect(ids).toEqual(["y", "y-2"]);
  });
});

describe("references in the normalizer", () => {
  const related = (...ids: Array<MediaId | null>): ArticleBlock => ({ ...FIXTURE_BLOCKS.relatedCoverage, stories: ids.map((story, i) => ({ id: `s${i}`, story })) });

  it("collects the Stories, Polls and Events a body names", () => {
    expect(collectReferenceIds(lexicalFromArticleBody(FIXTURE_ARTICLE_BODY))).toEqual({ stories: [501, 502], polls: [601], events: [701] });
  });

  it("resolves public-safe facts into the body, never copying them into the block", () => {
    const { body } = normalize(state(block(FIXTURE_BLOCKS.relatedCoverage), block(FIXTURE_BLOCKS.poll), block(FIXTURE_BLOCKS.event)));
    expect(body.references).toEqual(FIXTURE_REFERENCES);
    expect(JSON.stringify(body.nodes)).not.toContain("School board budget vote");
    expect(JSON.stringify(body.nodes)).not.toContain("Greenwood adds a second lunch period");
    expect(Object.keys(body.media)).toEqual(["104"]);
  });

  it("drops a story that is not published and leaves no reference behind for it", () => {
    const { body, issues } = normalize(state(block(related(501, 999))));
    expect(issues).toMatchObject([{ kind: "block", issue: { code: "related-unavailable", effect: "dropped" } }]);
    expect(Object.keys(body.references?.stories ?? {})).toEqual(["501"]);
  });

  it("leaves out the whole block when no story is left, and carries no references", () => {
    const { body, issues } = normalize(state(block(related(999))));
    expect(body.nodes).toEqual([]);
    expect(body.references).toBeUndefined();
    expect(issues.map((issue) => (issue.kind === "block" ? issue.issue.code : issue.kind))).toEqual(["related-unavailable", "related-none"]);
  });

  it("omits a poll that is not public and an interactive that is not registered", () => {
    const { body, issues } = normalize(state(block({ ...FIXTURE_BLOCKS.poll, poll: 999 }), block({ ...FIXTURE_BLOCKS.repositoryInteractive, key: "missing" })));
    expect(body.nodes).toEqual([]);
    expect(issues.map((issue) => (issue.kind === "block" ? issue.issue.code : issue.kind))).toEqual(["poll-unavailable", "interactive-unregistered"]);
  });

  it("publishes nothing that needs references when the host supplies none", () => {
    const { body } = normalizePayloadArticleBody(state(block(FIXTURE_BLOCKS.relatedCoverage), block(FIXTURE_BLOCKS.poll), block(FIXTURE_BLOCKS.repositoryInteractive), block(FIXTURE_BLOCKS.photo)), { media });
    expect(body.nodes.map((node) => node.type)).toEqual(["photo"]);
  });
});

describe("what drafts keep and publishing removes", () => {
  it("never lets the Video captions flag reach the public body", () => {
    const { body } = normalize(state(block(FIXTURE_BLOCKS.video)));
    expect(JSON.stringify(body)).not.toContain("captionsConfirmed");
    expect(body.nodes).toHaveLength(1);
  });

  it("leaves a Video out until captions are confirmed, and an Audio out until it has a transcript", () => {
    const unconfirmed = { type: "block", fields: { ...blockFields(FIXTURE_BLOCKS.video), captionsConfirmed: false } };
    const noTranscript = { type: "block", fields: { ...blockFields(FIXTURE_BLOCKS.audio), transcript: "" } };
    const { body, issues } = normalize(state(unconfirmed, noTranscript));
    expect(body.nodes).toEqual([]);
    expect(issues.map((issue) => (issue.kind === "block" ? issue.issue.code : issue.kind))).toEqual(["video-captions", "audio-transcript"]);
  });

  it("starts each new tool with something to fill, and never invents row ids twice", () => {
    expect(BLOCK_FIELD_READERS.dataTable({}).columns).toHaveLength(3);
    expect(BLOCK_FIELD_READERS.dataTable({}).rows).toHaveLength(3);
    expect(BLOCK_FIELD_READERS.dataTable({}).rows.every((row) => row.cells.length === 3)).toBe(true);
    expect(BLOCK_FIELD_READERS.keyNumbers({}).items).toHaveLength(2);
    expect(BLOCK_FIELD_READERS.relatedCoverage({}).stories).toEqual([{ id: "draft-0", story: null }]);
    expect(BLOCK_FIELD_READERS.beforeAfter({})).toMatchObject({ beforeLabel: "Before", afterLabel: "After", fit: "cover", placement: "wide" });
    expect(BLOCK_FIELD_READERS.portraitText({}).side).toBe("left");
    expect(BLOCK_FIELD_READERS.visualChapter({})).toMatchObject({ placement: "full", align: "bottom-left" });
    expect(BLOCK_FIELD_READERS.dataTable({}).columns.map((column) => column.id)).toEqual(BLOCK_FIELD_READERS.dataTable({}).columns.map((column) => column.id));
  });
});

describe("privileged blocks (Editor's Note, Repository Interactive)", () => {
  const note = block(FIXTURE_BLOCKS.editorsNote);
  const interactive = block(FIXTURE_BLOCKS.repositoryInteractive);
  const children = (value: unknown) => ((value as { root: { children: unknown[] } }).root.children);
  const types = (value: unknown) => children(value).map((node) => (node as { type: string; fields?: { blockType?: string } }).fields?.blockType ?? (node as { type: string }).type);

  it("finds them", () => {
    expect(hasPrivilegedBlocks(state(paragraph("a"), note))).toBe(true);
    expect(hasPrivilegedBlocks(state(paragraph("a"), block(FIXTURE_BLOCKS.photo)))).toBe(false);
  });

  it("lets an unchanged Editor's Note survive an unrelated staff edit", () => {
    const before = state(paragraph("One."), note, paragraph("Two."));
    const after = state(paragraph("One, edited."), note, paragraph("Two."), paragraph("Three."));
    const result = enforcePrivilegedBlocks(after, before);
    expect(result.body).toBe(after);
    expect(result.restored).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("survives Payload's own additions to the stored block (blockName, populated documents)", () => {
    const before = state(note);
    const decorated = state({ ...note, fields: { ...note.fields, blockName: "Added by Payload" } });
    expect(enforcePrivilegedBlocks(decorated, before).restored).toEqual([]);
  });

  it("restores a changed Editor's Note without discarding the rest of the staff edit", () => {
    const before = state(paragraph("One."), note, paragraph("Two."));
    const tampered = state(paragraph("One, edited."), { ...note, fields: { ...note.fields, body: "I changed the editors' words." } }, paragraph("Two."));
    const result = enforcePrivilegedBlocks(tampered, before);
    expect(result.restored).toEqual(["blk-editors-note"]);
    expect(children(result.body)[0]).toEqual(paragraph("One, edited."));
    expect(children(result.body)[1]).toBe(note);
  });

  it("puts back a removed Editor's Note where it was", () => {
    const before = state(paragraph("One."), note, paragraph("Two."));
    const result = enforcePrivilegedBlocks(state(paragraph("One."), paragraph("Two.")), before);
    expect(result.restored).toEqual(["blk-editors-note"]);
    expect(types(result.body)).toEqual(["paragraph", "editorsNote", "paragraph"]);
    expect(types(enforcePrivilegedBlocks(state(), before).body)).toEqual(["editorsNote"]);
  });

  it("refuses a staff-inserted privileged block, and keeps what they wrote around it", () => {
    const before = state(paragraph("One."));
    const result = enforcePrivilegedBlocks(state(paragraph("One."), note, interactive, paragraph("Two.")), before);
    expect(result.rejected).toEqual(["blk-editors-note", "blk-interactive"]);
    expect(types(result.body)).toEqual(["paragraph", "paragraph"]);
    // A new story (no previous body) behaves the same.
    expect(types(enforcePrivilegedBlocks(state(note), null).body)).toEqual([]);
  });

  it("treats Repository Interactive the same way", () => {
    const before = state(interactive);
    const changed = state({ ...interactive, fields: { ...interactive.fields, key: "another-key" } });
    expect(enforcePrivilegedBlocks(changed, before).restored).toEqual(["blk-interactive"]);
    expect(enforcePrivilegedBlocks(state(), before).restored).toEqual(["blk-interactive"]);
    expect(enforcePrivilegedBlocks(before, before).restored).toEqual([]);
  });

  it("allows an ordinary block to be changed freely, and ignores a body it cannot read", () => {
    const before = state(block(FIXTURE_BLOCKS.photo));
    expect(enforcePrivilegedBlocks(state(), before).body).toEqual(state());
    expect(enforcePrivilegedBlocks(undefined, before).body).toBeUndefined();
  });
});
