import { EMPTY_PLANNING_FILTERS } from "@byline/newsroom-screens/planning/planning-model";
import { builtInStoryView, SIDEBAR_STORY_VIEWS, storyViewCount } from "@byline/newsroom-screens/planning/story-views";
import { activeStory } from "@byline/newsroom-screens/home/newsroom-model";
import { planningResponse } from "./planning";
import type { ScreenContext } from "./screen-models";

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

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });

/**
 * `GET /api/byline/navigation-counts`. Every number is read as the signed-in
 * user, through the same access the destination itself applies, so a count
 * never reveals a story, assignment or Collection the reader cannot open.
 * The Stories numbers reuse the Stories read model and the shared view filters.
 */
export async function navigationCounts(ctx: ScreenContext): Promise<NavigationCounts> {
  const [planning, media, collections] = await Promise.all([
    planningResponse(ctx, EMPTY_PLANNING_FILTERS),
    ctx.req.payload.count({ collection: "production-assignments", where: { status: { not_equals: "done" } }, ...asUser(ctx) }),
    ctx.req.payload.count({ collection: "collections", where: { status: { not_equals: "archived" } }, ...asUser(ctx) })
  ]);
  const userId = Number(ctx.user.id);
  const views: Record<string, number> = {};
  for (const id of SIDEBAR_STORY_VIEWS) {
    const view = builtInStoryView(id);
    if (view) views[id] = storyViewCount(planning.stories, view, userId);
  }
  return { stories: planning.stories.filter(activeStory).length, media: media.totalDocs, collections: collections.totalDocs, views };
}
