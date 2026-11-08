import type { Payload } from "payload";
import { relationId, relationIds } from "../access/user";
import { overviewParagraphs, plainPublicText } from "../collections/Collections";
import { LIMITS, PUBLIC_COVERAGE_STATUS, type CollectionStatus } from "../domain/vocabulary";
import type { Collection, Media, Story } from "../payload-types";

/**
 * Public coverage: the public site's `coverages` dataset, projected from
 * Collections that have an enabled public presentation. A Collection is the
 * newsroom's private project; this is only its optional public face, so the
 * projection reads an explicit allowlist and nothing else (never the brief,
 * team, interviews, tasks or resources), and only published stories.
 *
 * The fields are the public contract's (apps/web `WordPressCoverage`):
 * slug, title, format, description, overview, overviewParagraphs, status,
 * artwork, startDate, endDate, modified and the stories in reading order.
 * Two parts are left to the snapshot build (Phase 11) that will serve this:
 * a story is projected here as its identity and reading position, and the
 * artwork as its Media record; the build turns them into public posts and the
 * artwork's public rendition, as it does for every other public image.
 */
export type PublicCoverageStory = { id: number; slug: string; title: string; publishedAt: string | null; part: number };

export type PublicCoverage = {
  id: number;
  slug: string;
  title: string;
  format: "coverage" | "series";
  description: string;
  overview: string;
  overviewParagraphs: string[];
  status: "upcoming" | "active" | "past" | "archived";
  artwork: { id: number; alt: string; width: number | null; height: number | null } | null;
  startDate?: string;
  endDate?: string;
  modified: string;
  stories: PublicCoverageStory[];
};

/** The member stories in public reading order: the lead story first, then the saved order, then any not yet placed. */
export function publicReadingOrder(members: number[], storyOrder: number[], featured: number | null): number[] {
  const ordered = [...new Set([...storyOrder, ...members])].filter((id) => members.includes(id));
  return featured !== null && ordered.includes(featured) ? [featured, ...ordered.filter((id) => id !== featured)] : ordered;
}

const ids = (value: unknown) => relationIds(value).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);

/**
 * Every public Collection, as the public site reads it. A system read (this
 * is a public build input, not a newsroom screen), limited to what is public
 * by construction.
 */
export async function publicCoverages(payload: Payload): Promise<PublicCoverage[]> {
  const found = await payload.find({
    collection: "collections",
    where: { and: [{ "publicPresentation.enabled": { equals: true } }, { "publicPresentation.slug": { exists: true } }] },
    select: { status: true, startDate: true, endDate: true, createdAt: true, publicModifiedAt: true, stories: true, publicPresentation: true },
    depth: 0,
    pagination: false,
    sort: "id",
    overrideAccess: true
  });
  const docs = found.docs as Collection[];
  const storyIds = [...new Set(docs.flatMap((doc) => ids(doc.stories)))];
  const artworkIds = [...new Set(docs.map((doc) => Number(relationId(doc.publicPresentation?.artwork))).filter((id) => id > 0))];
  // The live (published) documents only: an unpublished story, or an unpublished rewrite of a published one, never appears.
  const [stories, media] = await Promise.all([
    storyIds.length
      ? payload.find({ collection: "stories", where: { and: [{ id: { in: storyIds } }, { _status: { equals: "published" } }] }, select: { headline: true, slug: true, publishedAt: true, _status: true }, depth: 0, pagination: false, overrideAccess: true })
      : Promise.resolve({ docs: [] as Story[] }),
    artworkIds.length
      ? payload.find({ collection: "media", where: { id: { in: artworkIds } }, select: { alt: true, width: true, height: true, mimeType: true }, depth: 0, pagination: false, overrideAccess: true })
      : Promise.resolve({ docs: [] as Media[] })
  ]);
  const published = new Map((stories.docs as Story[]).filter((story) => story._status === "published").map((story) => [story.id, story]));
  const artwork = new Map((media.docs as Media[]).map((item) => [item.id, item]));
  return docs.flatMap((doc): PublicCoverage[] => {
    const p = doc.publicPresentation;
    if (!p?.enabled || !p.slug) return [];
    const order = publicReadingOrder(ids(doc.stories), ids(p.storyOrder), Number(relationId(p.featuredStory)) || null).filter((id) => published.has(id));
    const art = artwork.get(Number(relationId(p.artwork)));
    const overview = plainPublicText(p.overview ?? "", LIMITS.publicOverview, true);
    return [
      {
        id: doc.id,
        slug: p.slug,
        title: plainPublicText(p.title ?? "", LIMITS.publicTitle),
        format: p.format === "series" ? "series" : "coverage",
        description: plainPublicText(p.description ?? "", LIMITS.publicDescription),
        overview,
        overviewParagraphs: overviewParagraphs(overview),
        status: PUBLIC_COVERAGE_STATUS[(doc.status ?? "planning") as CollectionStatus] ?? "upcoming",
        artwork: art && art.mimeType?.startsWith("image/") ? { id: art.id, alt: art.alt ?? "", width: art.width ?? null, height: art.height ?? null } : null,
        ...(doc.startDate ? { startDate: doc.startDate } : {}),
        ...(doc.endDate ? { endDate: doc.endDate } : {}),
        modified: doc.publicModifiedAt ?? doc.createdAt,
        stories: order.map((id, index) => {
          const story = published.get(id)!;
          return { id, slug: story.slug ?? "", title: story.headline?.trim() ?? "", publishedAt: story.publishedAt ?? null, part: index + 1 };
        })
      }
    ];
  });
}
