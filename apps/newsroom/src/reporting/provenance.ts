import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type PayloadRequest } from "payload";
import { normalizeGroundRules } from "../domain/reporting";
import { lockRow } from "../db/locks";

/**
 * Quote provenance from the article body (docs/reporting.md#provenance).
 *
 * A Reported Quote inserted from a verified transcript selection carries the
 * selection's id in a private block field (`reportingSelection`) that the
 * semantic body never includes, so it never reaches Live Preview, a snapshot
 * or the public site. On each Story save this hook maintains the bounded,
 * indexed reverse relationship `transcript-selections.usedIn`, so "where is
 * this quote used?" is one indexed query, never a scan of rich text.
 */

type LexicalNode = { type?: unknown; fields?: Record<string, unknown>; children?: unknown };

/** Selection ids referenced by Reported Quote blocks in a Lexical body. Exported for tests. */
export function referencedSelections(body: unknown): number[] {
  const found = new Set<number>();
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 64) return;
    const record = node as LexicalNode;
    const fields = record.fields;
    if (record.type === "block" && fields && fields.blockType === "reportedQuote") {
      const id = Number(fields.reportingSelection);
      if (Number.isSafeInteger(id) && id > 0) found.add(id);
    }
    if (Array.isArray(record.children)) for (const child of record.children) visit(child, depth + 1);
  };
  visit((body as { root?: unknown } | null)?.root, 0);
  return [...found];
}

/**
 * Off-the-record words cannot be published by reference unless an editor
 * approved it (an audited override on the selection). Typing words by hand is
 * the reporter's own editorial act; Byline only refuses to make the private
 * provenance link to off-the-record material.
 */
export const guardOffRecordQuotes: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (req.context?.bylineImport === true || data.body === undefined) return data;
  const next = referencedSelections(data.body);
  const before = new Set(referencedSelections(originalDoc?.body));
  const added = next.filter((id) => !before.has(id)).sort((a, b) => a - b);
  if (!added.length) return data;

  // Hold each newly referenced quote row until this Story transaction finishes.
  // Deletion takes the same lock before checking usedIn, so a save cannot add a
  // provenance link in the gap between a deletion check and the delete itself.
  for (const id of added) await lockRow(req, "transcript_selections", id);

  const rows = await req.payload.find({ collection: "transcript-selections", where: { id: { in: added } }, pagination: false, depth: 0, overrideAccess: true, select: { groundRules: true, offRecordOverride: true }, req });
  if (rows.docs.length !== added.length) throw new APIError("A saved quote in this story is no longer available. Remove it from the article and try again.", 409);
  for (const row of rows.docs) {
    if (normalizeGroundRules(row.groundRules).rule === "off-record" && !row.offRecordOverride?.at) {
      throw new APIError("A quote in this story is off the record. Remove it, or ask an editor to approve its public use.", 400);
    }
  }
  return data;
};

async function setUsedIn(req: PayloadRequest, selectionId: number, stories: number[]) {
  await req.payload.update({ collection: "transcript-selections", id: selectionId, data: { usedIn: stories }, overrideAccess: true, depth: 0, context: { ...req.context, bylineSystem: true }, req });
}

export const syncQuoteProvenance: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context?.bylineImport === true) return doc;
  const storyId = Number(doc.id);
  if (!Number.isSafeInteger(storyId)) return doc;
  try {
    const referenced = new Set(referencedSelections(doc.body));
    const current = await req.payload.find({ collection: "transcript-selections", where: { usedIn: { in: [storyId] } }, pagination: false, depth: 0, overrideAccess: true, select: { usedIn: true }, req });
    const ids = (value: unknown) => (Array.isArray(value) ? value.map((entry) => Number(typeof entry === "object" && entry ? (entry as { id?: unknown }).id : entry)).filter(Number.isSafeInteger) : []);
    for (const row of current.docs) {
      if (!referenced.has(row.id)) await setUsedIn(req, row.id, ids(row.usedIn).filter((id) => id !== storyId));
      referenced.delete(row.id);
    }
    if (referenced.size) {
      const added = await req.payload.find({ collection: "transcript-selections", where: { id: { in: [...referenced] } }, pagination: false, depth: 0, overrideAccess: true, select: { usedIn: true }, req });
      for (const row of added.docs) await setUsedIn(req, row.id, [...new Set([...ids(row.usedIn), storyId])]);
    }
  } catch (error) {
    // Provenance bookkeeping never costs a writer their save.
    req.payload.logger.warn({ err: error, msg: `Could not update quote provenance for Story ${storyId}.` });
  }
  return doc;
};
