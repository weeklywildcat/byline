import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "@payloadcms/db-postgres";
import { type PublicBuildSnapshotV2 } from "@byline/content";
import type { ContentHealthIssue, ContentHealthResponse } from "@byline/newsroom-screens/planning/planning-model";
import { APIError, commitTransaction, initTransaction, killTransaction, type PayloadRequest, type TaskConfig } from "payload";
import { atLeast, relationId } from "../../access/user";
import { readPublicationState } from "../../db/publication-state";
import { SnapshotStore } from "../../public/snapshot/store";
import { drizzleFor } from "../../publication-media/state";
import type { ScreenContext } from "../screen-models";
import { healthDefinitions, scanPublishedStory, type Finding } from "./checks";

const QUEUE = "maintenance";
const TASK = "scan-content-health";
type Scan = { revision: number; checked: number; total: number; failed: number; cursor: number; running: boolean; startedAt: string; lastFullScanAt?: string };
type Result = { revision: number; id: number; checkedAt: string; findings: Finding[]; resolved: string[] };
type Disposition = { by: number; at: string; reason?: string; scope: "story" | "global"; checkId: string; storyId?: number };

const editor = (ctx: ScreenContext) => {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can use Content Health.", 403);
};
const system = (req: PayloadRequest) => ({ req, depth: 0, overrideAccess: true as const });
const get = async <T>(req: PayloadRequest, key: string): Promise<T | undefined> => {
  const { docs } = await req.payload.find({ collection: "content-health", where: { key: { equals: key } }, limit: 1, ...system(req) });
  return docs[0]?.data as T | undefined;
};
async function put(req: PayloadRequest, key: string, kind: "scan" | "story" | "disposition", data: object | null) {
  const opts = system(req);
  const { docs } = await req.payload.find({ collection: "content-health", where: { key: { equals: key } }, limit: 1, ...opts });
  if (docs[0]) {
    if (data) await req.payload.update({ collection: "content-health", id: docs[0].id, data: { data: data as never }, ...opts });
    else await req.payload.delete({ collection: "content-health", id: docs[0].id, ...opts });
  } else if (data) await req.payload.create({ collection: "content-health", data: { key, kind, data: data as never }, ...opts });
}
async function transaction<T>(req: PayloadRequest, run: () => Promise<T>) {
  const started = await initTransaction(req);
  try {
    await (await drizzleFor(req.payload, req)).execute(sql`select pg_advisory_xact_lock(461230122, 1)`);
    const result = await run();
    if (started) await commitTransaction(req);
    return result;
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}
const currentSnapshot = async (req: PayloadRequest, revision?: number) => {
  const state = await readPublicationState(req.payload, req);
  const pointer = state.completed;
  if (!pointer || pointer.revision !== state.currentRevision || (revision !== undefined && revision !== pointer.revision)) {
    throw new APIError("The current public snapshot is not ready. Try a new scan after it finishes.", 409);
  }
  return pointer;
};
async function assertPublished(ctx: ScreenContext, id: number) {
  const { docs } = await ctx.req.payload.find({ collection: "stories", where: { and: [{ id: { equals: id } }, { _status: { equals: "published" } }] }, limit: 1, depth: 0, overrideAccess: false, req: ctx.req, select: {} });
  if (!docs.length) throw new APIError("Only published stories can be checked.", 404);
}
const enqueue = (req: PayloadRequest, revision: number, storyId?: number) =>
  req.payload.jobs.queue({ task: TASK, queue: QUEUE, req, input: { revision, storyId } });

export async function startHealthScan(ctx: ScreenContext, storyId?: number) {
  editor(ctx);
  return transaction(ctx.req, async () => {
    const { revision } = await currentSnapshot(ctx.req);
    if (storyId) await assertPublished(ctx, storyId);
    else {
      const previous = await get<Scan>(ctx.req, "full");
      if (previous?.running && previous.revision === revision && Date.now() - Date.parse(previous.startedAt) < 6 * 3600_000) return { queued: true };
      await put(ctx.req, "full", "scan", { revision, checked: 0, total: 0, failed: 0, cursor: 0, running: true, startedAt: ctx.now.toISOString(), lastFullScanAt: previous?.lastFullScanAt });
    }
    await enqueue(ctx.req, revision, storyId);
    return { queued: true };
  });
}

async function saveFindings(req: PayloadRequest, revision: number, storyId: number, findings: Finding[]) {
  const previous = await get<Result>(req, `story:${storyId}`);
  const active = new Set(previous?.findings.map((item) => item.id));
  const resolved = new Set(previous?.resolved);
  const current = new Set(findings.map((item) => item.id));
  for (const id of active) if (!current.has(id)) resolved.add(id);
  const checks = findings.map((item): Finding => ({ ...item, state: active.has(item.id) ? "existing" : resolved.has(item.id) ? "regressed" : "new" }));
  for (const id of current) resolved.delete(id);
  await put(req, `story:${storyId}`, "story", { revision, id: storyId, checkedAt: new Date().toISOString(), findings: checks, resolved: [...resolved].slice(-200) });
}

export const contentHealthTask: TaskConfig = {
  slug: TASK,
  label: "Scan published content",
  inputSchema: [{ name: "revision", type: "number", required: true }, { name: "storyId", type: "number" }],
  concurrency: { key: ({ input }) => { const id = (input as { storyId?: number }).storyId; return id ? `content-health:${id}` : "content-health:full"; }, exclusive: true },
  handler: async ({ req, input }) => {
    const job = input as { revision: number; storyId?: number };
    const revision = Number(job.revision);
    const storyId = Number(job.storyId) || undefined;
    const run = storyId ? undefined : await get<Scan>(req, "full");
    if (!storyId && (!run?.running || run.revision !== revision)) return { output: {} };
    try {
      const pointer = await currentSnapshot(req, revision);
      const file = new SnapshotStore().pathFor(pointer.filename);
      if (!file) throw new Error("Invalid snapshot location.");
      const bytes = await readFile(file);
      if (bytes.length !== pointer.bytes || createHash("sha256").update(bytes).digest("hex") !== pointer.sha256) throw new Error("Snapshot did not match its published digest.");
      const snapshot = JSON.parse(bytes.toString("utf8")) as PublicBuildSnapshotV2;
      const story = storyId ? snapshot.datasets.stories.find((item) => item.id === storyId) :
        snapshot.datasets.stories.filter((item) => item.id > run!.cursor).sort((a, b) => a.id - b.id)[0];
      const findings = story ? await scanPublishedStory(snapshot, story) : [];
      await transaction(req, async () => {
        await currentSnapshot(req, revision);
        if (story) await saveFindings(req, revision, story.id, findings);
        if (run) {
          const checked = run.checked + (story ? 1 : 0);
          const total = snapshot.datasets.stories.length;
          const running = Boolean(story && checked < total);
          await put(req, "full", "scan", { ...run, total, checked, running, cursor: story?.id ?? run.cursor, lastFullScanAt: running ? run.lastFullScanAt : new Date().toISOString() });
          if (running) await enqueue(req, revision);
        }
      });
      return { output: {} };
    } catch (error) {
      if (run) await transaction(req, async () => {
        const latest = await get<Scan>(req, "full");
        if (latest?.running && latest.startedAt === run.startedAt) await put(req, "full", "scan", { ...latest, running: false, failed: latest.failed + 1 });
      });
      throw error;
    }
  }
};

export async function healthDisposition(ctx: ScreenContext, input: { checkId?: unknown; scope?: unknown; storyId?: unknown; restore?: unknown; reason?: unknown }) {
  editor(ctx);
  const checkId = String(input.checkId ?? "");
  if (!Object.hasOwn(healthDefinitions, checkId)) throw new APIError("Unknown check.", 400);
  const scope = input.scope === "global" ? "global" : "story";
  const storyId = Number(input.storyId);
  if (scope === "story") {
    if (!Number.isSafeInteger(storyId) || storyId <= 0) throw new APIError("Choose a story.", 400);
    await assertPublished(ctx, storyId);
  }
  const disposition: Disposition = { scope, checkId, ...(scope === "story" ? { storyId } : {}), at: ctx.now.toISOString(), by: Number(ctx.user.id), reason: typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : undefined };
  return transaction(ctx.req, () => put(ctx.req, `disposition:${scope === "story" ? storyId : "global"}:${checkId}`, "disposition", input.restore === true ? null : disposition));
}

export async function contentHealth(ctx: ScreenContext): Promise<ContentHealthResponse> {
  editor(ctx);
  const { req } = ctx;
  const [state, records, stories, sections] = await Promise.all([
    readPublicationState(req.payload, req),
    req.payload.find({ collection: "content-health", pagination: false, ...system(req) }),
    req.payload.find({ collection: "stories", where: { _status: { equals: "published" } }, select: { headline: true, section: true }, pagination: false, req, depth: 0, overrideAccess: false }),
    req.payload.find({ collection: "sections", where: { hidden: { not_equals: true } }, pagination: false, select: {}, req, depth: 0, overrideAccess: false })
  ]);
  const visible = new Set(sections.docs.map((row) => String(row.id)));
  const live = new Map(stories.docs.filter((row) => visible.has(String(relationId(row.section)))).map((row) => [row.id, row]));
  const scan = records.docs.find((row) => row.key === "full")?.data as Scan | undefined;
  const disposition = new Map(records.docs.filter((row) => row.kind === "disposition").map((row) => [row.key, row.data as Disposition]));
  const disabledChecks = Object.fromEntries([...disposition.values()].filter((row) => row.scope === "global").map((row) => [row.checkId, row]));
  const issues: ContentHealthIssue[] = [], ignored: ContentHealthIssue[] = [];
  let scanned = 0, lastRunAt: string | null = null, stale = false;
  for (const entry of records.docs) {
    if (entry.kind !== "story") continue;
    const record = entry.data as Result;
    const story = live.get(record.id);
    if (!story) continue;
    scanned += 1;
    if (record.revision !== state.currentRevision) stale = true;
    if (!lastRunAt || record.checkedAt > lastRunAt) lastRunAt = record.checkedAt;
    for (const { mediaId, ...finding } of record.findings) {
      const dispositionRecord = disabledChecks[finding.checkId] ?? disposition.get(`disposition:${record.id}:${finding.checkId}`);
      const row = { ...finding, lastCheckedAt: record.checkedAt, story: { id: story.id, title: story.headline, editUrl: `${ctx.admin}/collections/stories/${story.id}` }, ...(mediaId ? { fixUrl: `${ctx.admin}/media?asset=${mediaId}` } : {}), ignored: dispositionRecord ?? null };
      (dispositionRecord ? ignored : issues).push(row);
    }
  }
  return {
    issues, ignored, definitions: healthDefinitions, disabledChecks,
    lastRunAt, scanned, eligible: live.size, stale: stale || scanned < live.size || !scan?.lastFullScanAt || ctx.now.getTime() - Date.parse(scan.lastFullScanAt) > 24 * 3600_000,
    scannerAvailable: true, canScan: true, canManageChecks: true,
    scan: scan ? { running: scan.running, checked: scan.checked, total: scan.total, failed: scan.failed, startedAt: scan.startedAt, lastFullScanAt: scan.lastFullScanAt } : undefined
  };
}
