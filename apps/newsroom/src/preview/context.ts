import type { PublicCorrection, PublicStorySummary } from "@byline/content/story";
import { APIError, type Where } from "payload";
import { relationId } from "../access/user";
import { LIMITS, PUBLIC_COVERAGE_STATUS, type CollectionStatus } from "../domain/vocabulary";
import { plainPublicText } from "../collections/Collections";
import { publicReadingOrder } from "../newsroom/public-coverage";
import type { ScreenContext } from "../newsroom/screen-models";
import { payloadStorySummary, type PayloadImage } from "./payload-story";
import { loadPreviewPublication } from "./publication";

/**
 * The small authenticated read model behind Live Preview's article: what a
 * complete `ArticlePresentation` needs that the Story form does not carry
 * (corrections, related and More by candidates, series placement). It returns
 * canonical data, never HTML and never a finished page, and it is not part of
 * the typing loop: the live Story arrives through Payload's own Live Preview
 * transport, and the page asks for this only when the Story's section,
 * topics or contributors change (or on first load).
 *
 * Every read uses the signed-in user's access (`overrideAccess: false`), so a
 * writer sees only the stories Byline would show them. Private Story
 * Workspace data (plan, brief, tasks, sources) is never read. Series come from
 * the public Collection presentation's allowlisted fields only.
 */
export type PreviewSeriesContext = {
  id: number | string;
  title: string;
  href: string;
  description?: string;
  format: "series" | "coverage";
  complete: boolean;
  /** Members in public reading order. `null` is the story being previewed (it may not be published yet). */
  members: Array<PublicStorySummary<PayloadImage> | null>;
};

export type StoryPreviewContext = {
  corrections: PublicCorrection[];
  relatedCandidates: PublicStorySummary<PayloadImage>[];
  contributorStories: PublicStorySummary<PayloadImage>[];
  series: PreviewSeriesContext[];
};

const RELATED_LIMIT = 40;
const CONTRIBUTOR_STORIES_LIMIT = 12;
const SUMMARY_DEPTH = 1;

export type PreviewContextQuery = { section: number | null; topics: number[]; contributors: number[] };

const positive = (value: unknown): number | null => {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const idList = (value: string | null) => [...new Set((value ?? "").split(",").map(positive).filter((id): id is number => id !== null))].slice(0, 50);

export function parsePreviewContextQuery(params: URLSearchParams): PreviewContextQuery {
  return { section: positive(params.get("section")), topics: idList(params.get("topics")), contributors: idList(params.get("contributors")) };
}

const published = { _status: { equals: "published" } } satisfies Where;

/**
 * Published stories that share this story's section or topics, newest first,
 * read with the user's own access: the candidates Byline's related-story rules
 * (`relatedStories` in @byline/content) rank. Shared by Live Preview's "Related"
 * and Related Coverage's Suggested list, so there is one candidate set.
 */
export async function relatedCandidateDocs(ctx: ScreenContext, storyId: number, query: Pick<PreviewContextQuery, "section" | "topics">) {
  const relatedWhere: Where[] = [];
  if (query.section) relatedWhere.push({ section: { equals: query.section } });
  if (query.topics.length) relatedWhere.push({ topics: { in: query.topics } });
  if (!relatedWhere.length) return [];
  const { docs } = await ctx.req.payload.find({ collection: "stories", where: { and: [published, { id: { not_equals: storyId } }, { or: relatedWhere }] }, depth: SUMMARY_DEPTH, limit: RELATED_LIMIT, sort: "-publishedAt", draft: false, req: ctx.req, overrideAccess: false });
  return docs;
}

export async function storyPreviewContext(ctx: ScreenContext, storyId: number, query: PreviewContextQuery): Promise<StoryPreviewContext> {
  const { payload } = ctx.req;
  const asUser = { req: ctx.req, overrideAccess: false as const };

  // The user must be able to read this Story at all. Story access decides; a story ID is not authorization.
  try {
    await payload.findByID({ collection: "stories", id: storyId, depth: 0, draft: true, select: { headline: true }, ...asUser });
  } catch {
    throw new APIError("You don't have access to this story.", 403);
  }

  const [corrections, related, byContributors, collections] = await Promise.all([
    payload.find({ collection: "corrections", where: { story: { equals: storyId } }, depth: 0, pagination: false, sort: "date", ...asUser }),
    relatedCandidateDocs(ctx, storyId, query).then((docs) => ({ docs })),
    query.contributors.length
      ? payload.find({ collection: "stories", where: { and: [published, { id: { not_equals: storyId } }, { contributors: { in: query.contributors } }] }, depth: SUMMARY_DEPTH, limit: CONTRIBUTOR_STORIES_LIMIT, sort: "-publishedAt", draft: false, ...asUser })
      : Promise.resolve({ docs: [] }),
    // The public presentation's allowlisted fields only, and only after the story read above succeeded.
    payload.find({
      collection: "collections",
      where: { and: [{ stories: { equals: storyId } }, { "publicPresentation.enabled": { equals: true } }, { "publicPresentation.slug": { exists: true } }] },
      select: { status: true, stories: true, publicPresentation: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      context: { bylineSystem: true }
    })
  ]);

  const now = Date.now();
  const shownCorrections: PublicCorrection[] = corrections.docs
    .filter((correction) => {
      const from = Date.parse(String(correction.publishedAt ?? correction.date ?? ""));
      return !Number.isFinite(from) || from <= now;
    })
    .map((correction) => ({ id: String(correction.id), type: correction.type, date: correction.date ?? null, text: correction.text }));

  // Article URLs are dated in the publication's timezone (the published Global), exactly as the public snapshot dates them.
  const publication = await loadPreviewPublication(payload);
  const summary = (doc: unknown) => payloadStorySummary(doc as Record<string, unknown>, publication);
  const series: PreviewSeriesContext[] = [];
  for (const collection of collections.docs) {
    const presentation = collection.publicPresentation;
    if (!presentation?.enabled || !presentation.slug) continue;
    const memberIds = (collection.stories ?? []).map((story) => Number(relationId(story))).filter((id) => id > 0);
    const storyOrder = (presentation.storyOrder ?? []).map((story) => Number(relationId(story))).filter((id) => id > 0);
    const order = publicReadingOrder(memberIds, storyOrder, Number(relationId(presentation.featuredStory)) || null);
    const others = order.filter((id) => id !== storyId);
    const members = others.length
      ? await payload.find({ collection: "stories", where: { and: [published, { id: { in: others } }] }, depth: SUMMARY_DEPTH, pagination: false, draft: false, ...asUser })
      : { docs: [] };
    const byId = new Map(members.docs.map((doc) => [doc.id, doc]));
    series.push({
      id: collection.id,
      title: plainPublicText(presentation.title ?? "", LIMITS.publicTitle),
      href: `/coverage/${presentation.slug}/`,
      ...(presentation.description ? { description: plainPublicText(presentation.description, LIMITS.publicDescription) } : {}),
      format: presentation.format === "series" ? "series" : "coverage",
      complete: ["past", "archived"].includes(PUBLIC_COVERAGE_STATUS[(collection.status ?? "planning") as CollectionStatus] ?? "upcoming"),
      members: order.flatMap((id) => (id === storyId ? [null] : byId.has(id) ? [summary(byId.get(id))] : []))
    });
  }

  return {
    corrections: shownCorrections,
    relatedCandidates: related.docs.map(summary),
    contributorStories: byContributors.docs.map(summary),
    series
  };
}
