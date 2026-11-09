import type { BylinePublicationConfig, LiveCoverage } from "@byline/core";
import { createArticleLiveView } from "@byline/ui/live-feed";
import type { Payload } from "payload";
import { hasLiveCoverage, normalizeLiveSettings, type LiveSettings } from "../../domain/live-coverage";
import type { Story } from "../../payload-types";
import { id, iso, publicRead, text } from "./datasets";
import type { PreparedMediaCatalog } from "./media";
import { pageBodyHtml } from "./page-html";

/** Mode and coverage state for these Stories, from their unversioned plans (never from article drafts). */
export async function readLivePlans(payload: Payload, storyIds: number[]): Promise<Map<number, LiveSettings>> {
  if (!storyIds.length) return new Map();
  const { docs } = await payload.find({ collection: "story-plans", ...publicRead, where: { story: { in: storyIds } }, select: { story: true, liveCoverage: true } });
  return new Map(docs.flatMap((plan) => { const story = id(plan.story); return story === null ? [] : [[story, normalizeLiveSettings(plan.liveCoverage)] as const]; }));
}

export async function readLiveUpdates(payload: Payload, storyIds: number[]) {
  if (!storyIds.length) return [];
  const { docs } = await payload.find({ collection: "live-updates", ...publicRead,
    where: { story: { in: storyIds }, state: { equals: "published" } },
    select: { story: true, headline: true, body: true, photo: true, publishedAt: true, updatedAt: true, pinned: true }
  });
  return docs.sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || b.id - a.id);
}

/**
 * The published live projection in the shape the Worker and the static build
 * both validate (`normalizeLiveCoverage`): coverage state, its times and every
 * published update, newest first, as escaped HTML. Null unless coverage is
 * live or ended.
 */
export function liveCoverageProjection(story: Pick<Story, "publishedAt" | "updatedAt">, settings: LiveSettings | undefined | null, rows: Awaited<ReturnType<typeof readLiveUpdates>>, catalog: Pick<PreparedMediaCatalog, "articleAsset">): LiveCoverage | null {
  if (!hasLiveCoverage(settings)) return null;
  const state = settings!.state as "live" | "ended";
  const updates: LiveCoverage["updates"] = rows.map((row) => {
    const title = text(row.headline);
    const image = catalog.articleAsset(id(row.photo) ?? -1);
    return {
      id: row.id, title, html: pageBodyHtml(row.body, { id: row.id, title }),
      date: iso(row.publishedAt ?? row.updatedAt), modified: iso(row.updatedAt), pinned: row.pinned === true,
      author: "", image: image ? { url: image.src, alt: image.alt, width: image.width, height: image.height, credit: image.credit } : null
    };
  });
  return {
    status: state,
    startedAt: iso(settings?.startedAt ?? story.publishedAt ?? story.updatedAt),
    endedAt: settings?.endedAt ? iso(settings.endedAt) : "",
    updates
  };
}

export function collectLiveCoverage(story: Pick<Story, "id" | "publishedAt" | "updatedAt">, settings: LiveSettings | undefined, rows: Awaited<ReturnType<typeof readLiveUpdates>>, catalog: PreparedMediaCatalog, publication: BylinePublicationConfig) {
  const live = liveCoverageProjection(story, settings, rows, catalog);
  if (!live) return null;
  return createArticleLiveView(live, {
    postId: story.id, locale: publication.locale, timeZone: publication.timezone, feedUrl: `/_byline/live/${story.id}.json`
  });
}
