import { safeWebUrl, type PublicEventReference, type PublicPollReference, type PublicStoryReference } from "@byline/article-body";
import { publicStoryPath } from "@byline/content";

/**
 * Public-safe facts about the records an article names: related Stories and
 * Polls. A block stores only the relationship; these projections are what the
 * normalizer puts in the body's reference table, for Live Preview and the
 * public snapshot alike. They read an allowlist of fields from a populated
 * document and return null for anything that is not public, so a private,
 * draft or deleted record can never be described to readers.
 */
type Doc = Record<string, unknown>;

const isDoc = (value: unknown): value is Doc => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const populated = (value: unknown): Doc | null => (isDoc(value) && value.id !== undefined ? value : null);

/**
 * A published Story as a link. It needs a headline, slug, section (a story
 * without one has no public URL) and publication time; an unpublished,
 * trashed or still-unpopulated story is not linkable. The thumbnail is the
 * populated lead image's Media document, left for the caller to resolve into
 * the body's media table (never a URL here).
 */
export function publicStoryReference(doc: unknown, options: { timeZone: string; excludeId?: number | string | null }): { reference: PublicStoryReference; thumbnail: Doc | null } | null {
  if (!isDoc(doc) || doc.id === undefined) return null;
  if (options.excludeId !== undefined && options.excludeId !== null && String(doc.id) === String(options.excludeId)) return null;
  if (doc._status !== "published" || doc.deletedAt) return null;
  const headline = text(doc.headline);
  const slug = text(doc.slug);
  const section = populated(doc.section);
  const sectionSlug = section ? text(section.slug) : "";
  const publishedAt = text(doc.publishedAt);
  if (!headline || !slug || !sectionSlug || !publishedAt || section?.hidden === true) return null;
  const href = publicStoryPath({ slug, sectionSlug, publishedAt, timeZone: options.timeZone });
  if (!href) return null;
  const featured = populated(doc.featuredMedia);
  const thumbnail = featured && typeof featured.mimeType === "string" && featured.mimeType.startsWith("image/") ? featured : null;
  return {
    reference: {
      id: doc.id as number | string,
      headline,
      href,
      ...(text(section?.name) ? { section: text(section?.name) } : {}),
      publishedAt: new Date(publishedAt).toISOString(),
      ...(thumbnail ? { thumbnail: thumbnail.id as number | string } : {})
    },
    thumbnail
  };
}

/**
 * A Poll's public definition. A draft poll is not public. Voting is open only
 * while the poll is `open` and inside its window (`opensAt` inclusive,
 * `closesAt` exclusive, a half-open window); counts are never read
 * here, so a snapshot of an open poll carries no tallies.
 */
export function publicPollReference(doc: unknown, now: Date = new Date()): PublicPollReference | null {
  if (!isDoc(doc)) return null;
  const status = doc.status;
  if (status !== "open" && status !== "closed") return null;
  const id = text(doc.pollKey);
  const question = text(doc.question);
  const options = (Array.isArray(doc.options) ? doc.options : []).flatMap((option) => {
    if (!isDoc(option)) return [];
    const optionId = text(option.optionId);
    const label = text(option.label);
    return optionId && label ? [{ id: optionId, label }] : [];
  });
  if (!id || !question || options.length < 2) return null;
  const opens = text(doc.opensAt) ? Date.parse(text(doc.opensAt)) : null;
  const closes = text(doc.closesAt) ? Date.parse(text(doc.closesAt)) : null;
  const inWindow = (opens === null || now.getTime() >= opens) && (closes === null || now.getTime() < closes);
  return { id, question, options, votingOpen: status === "open" && inWindow };
}

/**
 * A published Event's public facts, for the Event block. Only a published,
 * untrashed Event with a title and a start resolves; drafts, deleted and
 * malformed events resolve to nothing, so the block is left out (and refused
 * at publication). Times stay instants; the renderer reads them in the
 * publication's timezone.
 */
export function publicEventReference(doc: unknown): PublicEventReference | null {
  if (!isDoc(doc) || doc.id === undefined) return null;
  if (doc._status !== "published" || doc.deletedAt) return null;
  const title = text(doc.title);
  const start = Date.parse(text(doc.startAt));
  if (!title || !Number.isFinite(start)) return null;
  const end = Date.parse(text(doc.endAt));
  const eventType = text(doc.eventType);
  const location = text(doc.location);
  const description = text(doc.description);
  const externalUrl = safeWebUrl(text(doc.externalUrl));
  return {
    id: doc.id as number | string,
    title: title.slice(0, 200),
    ...(eventType ? { eventType: eventType.slice(0, 60) } : {}),
    startAt: new Date(start).toISOString(),
    ...(Number.isFinite(end) && end >= start ? { endAt: new Date(end).toISOString() } : {}),
    allDay: doc.allDay === true,
    ...(location ? { location: location.slice(0, 200) } : {}),
    ...(description ? { description: description.slice(0, 2000) } : {}),
    ...(externalUrl ? { externalUrl } : {}),
    eventStatus: doc.eventStatus === "canceled" ? "canceled" : "scheduled"
  };
}
