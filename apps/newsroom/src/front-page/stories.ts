import { cleanDeckText, type StoryView } from "@byline/ui";
import type { HomepageStoryInput } from "@byline/ui/homepage";
import { publicStoryPath } from "@byline/content";
import { formatEditorialDate } from "@byline/content/story";
import type { BylinePublicationConfig } from "@byline/core";
import type { Payload, PayloadRequest } from "payload";
import { relationId } from "../access/user";
import { readLivePlans } from "../public/snapshot/live";

/**
 * Published Stories as the canonical homepage resolver's input
 * (`HomepageStoryInput`), for the Front Page Desk's preview and validation.
 *
 * Parity with the static build (apps/web/lib/native-archive-views.ts and
 * content.ts `isPublicHomepagePost`): the same pool (an active publication
 * section, Sports only when the sports feature is on, never Behind the
 * Scenes), the same order (newest first), no sticky stories, special coverage
 * and athlete spotlight from the same topic slugs. Selection is the shared
 * resolver's alone. Images are the private Library previews (as Live Preview
 * uses), never publication renditions; layout and selection are identical.
 */
const SPECIAL = "special-coverage";
const ATHLETE = new Set(["athlete-of-the-week", "athlete-of-the-month"]);
const BEHIND_THE_SCENES = "behind-the-scenes";

export type FrontPageStory = { input: HomepageStoryInput; headline: string; section: string; sectionSlug: string; publishedAt: string; thumbnail: string | null };

export async function publishedHomepageStories(payload: Payload, publication: BylinePublicationConfig, req?: PayloadRequest): Promise<FrontPageStory[]> {
  const { docs } = await payload.find({
    collection: "stories", draft: false, where: { _status: { equals: "published" } }, depth: 1, pagination: false, overrideAccess: true, ...(req ? { req } : {}),
    select: { headline: true, deck: true, slug: true, section: true, topics: true, contributors: true, featuredMedia: true, publishedAt: true, deletedAt: true }
  });
  const live = await readLivePlans(payload, docs.map((row) => row.id));
  const sections = new Set(publication.sections.filter((section) => section.active && (section.slug !== "sports" || publication.features.sports)).map((section) => section.slug));
  return docs
    .filter((row) => !row.deletedAt && row.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || b.id - a.id)
    .flatMap((row): FrontPageStory[] => {
      const section = row.section && typeof row.section === "object" ? row.section : null;
      if (!section || section.slug === BEHIND_THE_SCENES || !sections.has(section.slug)) return [];
      const href = publicStoryPath({ slug: row.slug, sectionSlug: section.slug, publishedAt: row.publishedAt, timeZone: publication.timezone });
      if (!href) return [];
      const topics = (row.topics ?? []).flatMap((topic) => (topic && typeof topic === "object" ? [topic] : []));
      const contributor = (row.contributors ?? []).find((person) => person && typeof person === "object");
      const media = row.featuredMedia && typeof row.featuredMedia === "object" ? row.featuredMedia : null;
      const preview = (media?.sizes as { library?: { url?: string | null; width?: number | null; height?: number | null } } | undefined)?.library;
      const image = media ? { src: preview?.url ?? media.url ?? "", alt: media.alt ?? "", width: preview?.width ?? media.width ?? null, height: preview?.height ?? media.height ?? null } : null;
      const deck = (row.deck ?? "").trim();
      const view: StoryView = {
        id: row.id, title: row.headline, href, deck, deckIsHtml: false, isoDate: row.publishedAt!,
        displayDate: formatEditorialDate(row.publishedAt!, publication.locale), readingTime: null,
        category: { name: section.name, href: `/category/${section.slug}/` },
        author: contributor && typeof contributor === "object" ? { name: contributor.name, href: null } : null,
        image,
        ...(live.get(row.id)?.mode === "live" && live.get(row.id)?.state === "live" ? { live: true } : {})
      };
      return [{
        input: {
          id: row.id, sticky: false, categorySlugs: [section.slug], categoryIds: [section.id], tagIds: topics.map((topic) => topic.id),
          authorId: Number(relationId(contributor)) || null, hasFeaturedImage: Boolean(media),
          isAthleteSpotlight: topics.some((topic) => ATHLETE.has(topic.slug)), isSpecialCoverage: topics.some((topic) => topic.slug === SPECIAL),
          view, cleanDeckView: { ...view, deck: cleanDeckText(deck) }
        },
        headline: row.headline, section: section.name, sectionSlug: section.slug, publishedAt: row.publishedAt!, thumbnail: image?.src || null
      }];
    });
}
