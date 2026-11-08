import { relationId } from "../access/user";
import { effectiveWorkflow } from "../domain/workflow";
import { primaryProduction, readableStories, type ScreenContext } from "./screen-models";

/** The sidebar's counts: open work per destination and per promoted Stories view. */
export type NavigationCounts = {
  /** Active stories: not published, not dropped. */
  stories: number;
  /** Production assignments not yet done. */
  media: number;
  /** Collections not archived. */
  collections: number;
  /** Built-in Stories views by id (`review`, `unassigned`, `art-needed`). */
  views: Record<string, number>;
};

/** The few facts the counts need about one story, as the Stories read model derives them. */
export type CountedStory = { workflow: string; editorId: number | null; visualStatus: string };

/**
 * Active stories and the promoted built-in views (SIDEBAR_STORY_VIEWS), with
 * the same rules the views' shared filters apply to the Stories read model:
 * Ready for review is the `ready` stage, Unassigned has no editor, Art needed
 * a visual status of `needed` (which is also what a story with no assignment
 * reports).
 */
export function countStories(rows: readonly CountedStory[]): Pick<NavigationCounts, "stories" | "views"> {
  const active = rows.filter((row) => row.workflow !== "published" && row.workflow !== "dropped");
  return {
    stories: active.length,
    views: {
      review: active.filter((row) => row.workflow === "ready").length,
      unassigned: active.filter((row) => row.editorId === null).length,
      "art-needed": active.filter((row) => row.visualStatus === "needed").length
    }
  };
}

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });

/**
 * `GET /api/byline/navigation-counts`. Every number is read as the signed-in
 * user, through the access the destination itself applies, so a count never
 * reveals a story, assignment or Collection the reader cannot open. It reads
 * only what the counts need (each plan's stage and editor, each readable
 * story's publication status, each assignment's status), never the full
 * Stories read model with its tasks, sources and appointments.
 */
export async function navigationCounts(ctx: ScreenContext): Promise<NavigationCounts> {
  const [plans, media, collections] = await Promise.all([
    // Complete reads: Payload applies `limit` even with pagination off, so none is passed.
    ctx.req.payload.find({ collection: "story-plans", depth: 0, pagination: false, select: { story: true, workflow: true, editor: true }, ...asUser(ctx) }),
    ctx.req.payload.count({ collection: "production-assignments", where: { status: { not_equals: "done" } }, ...asUser(ctx) }),
    ctx.req.payload.count({ collection: "collections", where: { status: { not_equals: "archived" } }, ...asUser(ctx) })
  ]);
  const planByStory = new Map(plans.docs.map((plan) => [Number(relationId(plan.story)), plan] as const).filter(([id]) => Number.isSafeInteger(id)));
  const ids = [...planByStory.keys()];
  const [stories, production] = await Promise.all([
    readableStories(ctx, ids, {}),
    ids.length ? ctx.req.payload.find({ collection: "production-assignments", where: { story: { in: ids } }, depth: 0, pagination: false, sort: "createdAt", select: { story: true, status: true }, ...asUser(ctx) }) : Promise.resolve({ docs: [] })
  ]);
  const assignments = new Map<number, Array<{ status?: string | null }>>();
  for (const row of production.docs as Array<{ story?: unknown; status?: string | null }>) {
    const id = Number(relationId(row.story));
    assignments.set(id, [...(assignments.get(id) ?? []), row]);
  }
  const rows = stories.map((story): CountedStory => {
    const plan = planByStory.get(story.id);
    const editor = relationId(plan?.editor);
    return {
      workflow: effectiveWorkflow(plan?.workflow, story._status),
      editorId: editor === null ? null : Number(editor),
      visualStatus: primaryProduction(assignments.get(story.id) ?? [])?.status ?? "needed"
    };
  });
  return { ...countStories(rows), media: media.totalDocs, collections: collections.totalDocs };
}
