import { stableDigest } from "@byline/content";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionSlug,
  GlobalAfterChangeHook,
  GlobalBeforeChangeHook,
  PayloadRequest
} from "payload";
import { advancePublicRevision } from "../db/publication-state";
import { queuePublicSnapshot } from "./queue";

/**
 * Public mutations and the public content revision
 * (docs/payload-build-snapshots.md#revision-semantics).
 *
 * A committed change to anything the public projection reads advances the
 * one public revision and queues `prepare-public-snapshot` IN THE SAME
 * PostgreSQL TRANSACTION as the change: the revision bump and the job row use
 * the request's own transaction, so either the change, its revision and its
 * snapshot work all commit, or none of them do. There is no advisory lock and
 * no writer marker: PostgreSQL's transaction is the consistency boundary.
 *
 * Everything else (drafts, autosaves, private newsroom records, accounts,
 * preparation state, jobs, votes) never calls this.
 */

/** `req.context` key: the revision this transaction already recorded. */
const RECORDED = "bylinePublicRevisionRecorded";
/** `req.context` key: per-document public digests captured before a write. */
const BEFORE = "bylinePublicDigestsBefore";
/** `req.context.bylinePublicRevision = "suppress"`: a controlled system operation records the revision itself. */
export const SUPPRESS_PUBLIC_REVISION = "suppress";

type Context = Record<string, unknown>;

/**
 * True when ordinary per-document bumps are off for this request: the
 * controlled WordPress import (`context.bylineImport === true`, Phase 8) and
 * explicit system suppression. The import must call
 * `recordPublicMutation(req, "import", { force: true })` (or the operational
 * prepare command) exactly once after it completes.
 */
export function publicRevisionSuppressed(req: Pick<PayloadRequest, "context">): boolean {
  const context = (req.context ?? {}) as Context;
  return context.bylineImport === true || context.bylinePublicRevision === SUPPRESS_PUBLIC_REVISION;
}

async function currentTransaction(req: PayloadRequest): Promise<string | number | null> {
  if (!req.transactionID) return null;
  const id = await req.transactionID;
  return id === undefined || id === null ? null : (id as string | number);
}

/**
 * Records one public mutation: advances the public revision and queues
 * snapshot preparation, both with `req` (so inside its transaction), and
 * remembers the result for the rest of THIS transaction so several public
 * hooks in one top-level operation make one revision. Separate requests (and
 * separate transactions on one request) always make separate revisions.
 *
 * Returns the recorded revision, or null when suppressed. Throws when the
 * revision or the job cannot be written: the caller's write then rolls back.
 */
export async function recordPublicMutation(req: PayloadRequest, reason: string, options: { force?: boolean } = {}): Promise<number | null> {
  if (!options.force && publicRevisionSuppressed(req)) return null;
  req.context ??= {};
  const context = req.context as Context;
  const transaction = await currentTransaction(req);
  const recorded = context[RECORDED] as { transaction: string | number; revision: number } | undefined;
  if (transaction !== null && recorded && recorded.transaction === transaction) return recorded.revision;
  if (transaction === null) {
    // Payload always opens a transaction for its write operations on PostgreSQL. Without
    // one the change has already committed, so the bump below cannot be atomic with it.
    req.payload.logger.warn({ msg: `Public mutation (${reason}) ran outside a database transaction; recording its revision separately.` });
  }
  const revision = await advancePublicRevision(req.payload, req);
  await queuePublicSnapshot(req.payload, { revision, reason }, req);
  if (transaction !== null) context[RECORDED] = { transaction, revision };
  return revision;
}

/* ------------------------------------------------------------ change detection */

/**
 * A record's contribution to the public projection: an explicit, plain
 * allowlist of the fields that can reach public output, or null when the
 * record does not currently participate (a draft, trashed, an internal
 * record). Computed from the MAIN row as stored, never from a draft version.
 */
export type PublicSlice = (row: Record<string, unknown>, req: PayloadRequest) => unknown | Promise<unknown>;

const digestOf = (value: unknown): string | null => (value === null || value === undefined ? null : stableDigest(value));

function beforeDigests(req: PayloadRequest): Record<string, string | null> {
  req.context ??= {};
  const context = req.context as Context;
  if (!context[BEFORE] || typeof context[BEFORE] !== "object") context[BEFORE] = {};
  return context[BEFORE] as Record<string, string | null>;
}

/** The main (published/current) row exactly as stored, read in the request's transaction. Never a draft version. */
async function mainRow(req: PayloadRequest, collection: CollectionSlug, id: number | string): Promise<Record<string, unknown> | null> {
  const row = await req.payload.db.findOne({ collection, where: { id: { equals: id } }, req });
  return (row as Record<string, unknown> | null) ?? null;
}

async function sliceDigest(req: PayloadRequest, slice: PublicSlice, row: Record<string, unknown> | null): Promise<string | null> {
  return row ? digestOf(await slice(row, req)) : null;
}

export type PublicTrackingOptions = {
  /** A new record cannot be referenced by public content yet (Media uploads): its creation is not a public change. */
  ignoreCreate?: boolean;
};

export type PublicChangeHooks = {
  beforeChange: CollectionBeforeChangeHook;
  afterChange: CollectionAfterChangeHook;
  beforeDelete: CollectionBeforeDeleteHook;
  afterDelete: CollectionAfterDeleteHook;
};

/**
 * Hooks that compare a collection record's public slice before and after a
 * write, both read from the main row inside the write's transaction, and
 * record a public mutation only when it differs. A draft or autosave never
 * writes the main row of a versioned collection, so it never differs; a
 * publish, an edit of published content, an unpublish, trash/restore and a
 * scheduled publish do. Deletion records a mutation when the record was
 * public at the time it was deleted.
 */
export function trackPublicChanges(collection: CollectionSlug, slice: PublicSlice, options: PublicTrackingOptions = {}): PublicChangeHooks {
  const key = (id: unknown) => `${collection}:${String(id)}`;
  return {
    beforeChange: async ({ data, operation, originalDoc, req }) => {
      if (operation === "update" && originalDoc?.id !== undefined && !publicRevisionSuppressed(req)) {
        beforeDigests(req)[key(originalDoc.id)] = await sliceDigest(req, slice, await mainRow(req, collection, originalDoc.id));
      }
      return data;
    },
    afterChange: async ({ doc, operation, req }) => {
      if (publicRevisionSuppressed(req) || (operation === "create" && options.ignoreCreate)) return doc;
      const digests = beforeDigests(req);
      const id = key(doc.id);
      const before = operation === "create" ? null : id in digests ? digests[id] : undefined;
      delete digests[id];
      const after = await sliceDigest(req, slice, await mainRow(req, collection, doc.id));
      // An update whose before-state was never captured is treated as changed when it is public now.
      if (before === undefined ? after !== null : before !== after) await recordPublicMutation(req, `${collection} ${operation} ${String(doc.id)}`);
      return doc;
    },
    beforeDelete: async ({ id, req }) => {
      if (publicRevisionSuppressed(req)) return;
      beforeDigests(req)[`delete:${key(id)}`] = await sliceDigest(req, slice, await mainRow(req, collection, id));
    },
    afterDelete: async ({ doc, id, req }) => {
      if (publicRevisionSuppressed(req)) return doc;
      const digests = beforeDigests(req);
      const wasPublic = digests[`delete:${key(id)}`];
      delete digests[`delete:${key(id)}`];
      if (wasPublic) await recordPublicMutation(req, `${collection} delete ${String(id)}`);
      return doc;
    }
  };
}

/** Attaches public change tracking to a collection's hooks (after its own hooks, so it sees the final write). */
export function withPublicChangeTracking<T extends { slug: string; hooks?: Record<string, unknown[] | undefined> }>(collection: T, slice: PublicSlice, options: PublicTrackingOptions = {}): T {
  const hooks = trackPublicChanges(collection.slug as CollectionSlug, slice, options);
  const existing = (collection.hooks ?? {}) as Record<string, unknown[] | undefined>;
  return {
    ...collection,
    hooks: {
      ...existing,
      beforeChange: [...(existing.beforeChange ?? []), hooks.beforeChange],
      afterChange: [...(existing.afterChange ?? []), hooks.afterChange],
      beforeDelete: [...(existing.beforeDelete ?? []), hooks.beforeDelete],
      afterDelete: [...(existing.afterDelete ?? []), hooks.afterDelete]
    }
  };
}

/** The same comparison for a Global (`publication`): its main row is written only when it is published. */
export function trackPublicGlobalChanges(slug: string, slice: PublicSlice): { beforeChange: GlobalBeforeChangeHook; afterChange: GlobalAfterChangeHook } {
  const key = `global:${slug}`;
  const read = async (req: PayloadRequest) => (await req.payload.db.findGlobal({ slug, req })) as Record<string, unknown> | null;
  return {
    beforeChange: async ({ data, req }) => {
      if (!publicRevisionSuppressed(req)) beforeDigests(req)[key] = await sliceDigest(req, slice, await read(req));
      return data;
    },
    afterChange: async ({ doc, req }) => {
      if (publicRevisionSuppressed(req)) return doc;
      const digests = beforeDigests(req);
      const before = key in digests ? digests[key] : undefined;
      delete digests[key];
      const after = await sliceDigest(req, slice, await read(req));
      if (before === undefined ? after !== null : before !== after) await recordPublicMutation(req, `global ${slug} change`);
      return doc;
    }
  };
}
