import type { BylinePublicationConfig, LiveCoverage } from "@byline/core";
import { createArticleLiveView } from "@byline/ui/live-feed";
import type { Payload } from "payload";
import type { Story } from "../../payload-types";
import { id, iso, publicRead, text } from "./datasets";
import type { PreparedMediaCatalog } from "./media";
import { pageBodyHtml } from "./page-html";

export function hasLiveCoverage(story: Pick<Story, "liveCoverage">) {
  return story.liveCoverage?.state === "live" || story.liveCoverage?.state === "ended";
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
export function liveCoverageProjection(story: Pick<Story, "liveCoverage" | "publishedAt" | "updatedAt">, rows: Awaited<ReturnType<typeof readLiveUpdates>>, catalog: Pick<PreparedMediaCatalog, "articleAsset">): LiveCoverage | null {
  const state = story.liveCoverage?.state;
  if (state !== "live" && state !== "ended") return null;
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
    startedAt: iso(story.liveCoverage?.startedAt ?? story.publishedAt ?? story.updatedAt),
    endedAt: story.liveCoverage?.endedAt ? iso(story.liveCoverage.endedAt) : "",
    updates
  };
}

export function collectLiveCoverage(story: Pick<Story, "id" | "liveCoverage" | "publishedAt" | "updatedAt">, rows: Awaited<ReturnType<typeof readLiveUpdates>>, catalog: PreparedMediaCatalog, publication: BylinePublicationConfig) {
  const live = liveCoverageProjection(story, rows, catalog);
  if (!live) return null;
  return createArticleLiveView(live, {
    postId: story.id, locale: publication.locale, timeZone: publication.timezone, feedUrl: `/_byline/live/${story.id}.json`
  });
}
