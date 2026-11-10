import type { ArticleMediaAsset, MediaId } from "@byline/article-body";
import { mediaKey } from "@byline/article-body";
import {
  escapeHtml,
  formatEditorialDate,
  reportingNoteParagraphs,
  type ArticleImageView,
  type ArticlePresentationContext,
  type PublicCorrection,
  type PublicSeriesInput,
  type PublicStory,
  type PublicStoryContributor,
  type PublicStorySummary,
  type PublicTerm,
  type StoryImageUsage
} from "@byline/content/story";
import { formatVideoDuration, parseYouTubeVideoId, youTubeEmbedUrl } from "@byline/core";
import { publicStoryPath } from "@byline/content";
import { publicEventReference, publicPollReference, publicStoryReference } from "../public/references";
import { articleMediaFromPayload, normalizePayloadStoryBody, type NormalizeIssue } from "@byline/editor/normalize";
import type { PreviewPublication } from "./publication";

/**
 * Payload → canonical Story: the provider boundary. Live Preview feeds it the
 * unsaved, populated form state; the future public snapshot feeds it the
 * published document. Nothing Payload-shaped (documents, Lexical JSON, upload
 * records) leaves this file: the renderer gets `PublicStory`, built into
 * `ArticlePresentation` by the shared builder in `@byline/content/story`.
 *
 * Relationships may arrive populated (objects) or, while Payload is still
 * populating, as IDs. A bare ID is never rendered as data: a contributor,
 * section or image that is not populated yet is simply absent from this pass.
 */

type Doc = Record<string, unknown>;
type Relation = number | string | Doc | null | undefined;

export type PayloadImage = {
  media: Doc;
  /** This story's caption for this use (the lead image's `featuredCaption`); credit always comes from Media. */
  caption?: string;
};

const isDoc = (value: unknown): value is Doc => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const populated = (value: Relation): Doc | null => (isDoc(value) && value.id !== undefined ? value : null);
const populatedList = (value: unknown): Doc[] => (Array.isArray(value) ? value.map((item) => populated(item as Relation)).filter((item): item is Doc => item !== null) : []);
const relationId = (value: Relation): number | string | null => (isDoc(value) ? (value.id as number | string) ?? null : value ?? null);
const relationIds = (value: unknown): Array<number | string> => (Array.isArray(value) ? value.map((item) => relationId(item as Relation)).filter((id): id is number | string => id !== null) : []);

/** The authenticated newsroom URL of a Media file (Payload's file route enforces Media `read`). */
function mediaUrl(doc: Doc): string | null {
  return text(doc.url) || null;
}

function isImage(doc: Doc) {
  return typeof doc.mimeType === "string" && doc.mimeType.startsWith("image/");
}

/** A Media document as the renderer's media record, with the newsroom's private URLs. */
export function previewMediaAsset(doc: Doc): ArticleMediaAsset | null {
  const asset = articleMediaFromPayload(doc, mediaUrl);
  if (!asset) return null;
  const library = isDoc(doc.sizes) && isDoc(doc.sizes.library) ? text(doc.sizes.library.url) : "";
  return library ? { ...asset, previewSrc: library } : asset;
}

/**
 * The host half of image projection: private Payload URLs, the builder's
 * geometry (`sizes`, priority, crop intent) unchanged. The original and the
 * Library preview make the `srcset`, so a phone frame does not download a
 * camera original.
 */
export function projectPayloadImage(image: PayloadImage, usage: StoryImageUsage): ArticleImageView | null {
  const { media } = image;
  if (!isImage(media)) return null;
  const asset = previewMediaAsset(media);
  if (!asset) return null;
  const library = isDoc(media.sizes) && isDoc(media.sizes.library) ? media.sizes.library : null;
  const candidates = [
    library && text(library.url) && typeof library.width === "number" ? `${text(library.url)} ${library.width}w` : "",
    asset.width ? `${asset.src} ${asset.width}w` : ""
  ].filter(Boolean);
  const caption = text(image.caption);
  const focal = asset.focalPoint;
  return {
    src: asset.src,
    ...(candidates.length > 1 ? { srcSet: candidates.join(", ") } : {}),
    sizes: usage.sizes,
    alt: asset.alt,
    width: asset.width,
    height: asset.height,
    ...(caption ? { fallbackCaption: caption } : {}),
    ...(asset.credit ? { credit: asset.credit } : {}),
    ...(focal && (Math.abs(focal.x - 50) > 0.5 || Math.abs(focal.y - 50) > 0.5) ? { objectPosition: `${focal.x}% ${focal.y}%` } : {})
  };
}

function sectionTerm(section: Doc | null): PublicTerm | null {
  if (!section || section.hidden === true) return null;
  const slug = text(section.slug);
  const name = text(section.name);
  return name ? { key: `section-${String(section.id)}`, name, href: slug ? `/category/${slug}/` : "" } : null;
}

function topicTerm(topic: Doc): PublicTerm | null {
  const name = text(topic.name);
  return name ? { key: `topic-${String(topic.id)}`, name, href: "" } : null;
}

const personKey = (id: number | string) => `person:${String(id)}`;

function contributor(person: Doc): PublicStoryContributor<PayloadImage> {
  const portrait = populated(person.portrait as Relation);
  const slug = text(person.slug);
  const email = text(person.publicEmail);
  return {
    keys: [personKey(person.id as number)],
    id: `person-${String(person.id)}-${slug}`,
    name: text(person.name) || "Unnamed contributor",
    href: person.hasProfilePage === true && slug ? `/author/${slug}/` : "",
    role: text(person.newsroomRole),
    bio: person.status === "guest" ? "" : text(person.shortBio),
    photo: portrait && isImage(portrait) ? { media: portrait } : null,
    ...(email ? { contactHref: `mailto:${email}` } : {})
  };
}

/**
 * `/<yyyy>/<mm>/<dd>/<section>/<slug>/`, the public article route, once it can
 * be known: dated by the publication's calendar day (the shared
 * `publicStoryPath`, the same helper the public snapshot uses).
 */
function storyHref(slug: string, section: Doc | null, publishedAt: string, timeZone: string): string {
  return publicStoryPath({ slug, sectionSlug: section ? text(section.slug) : "", publishedAt, timeZone });
}

function deckHtml(deck: string) {
  return deck ? deck.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") : "";
}

function primaryVideo(story: Doc, title: string) {
  if (story.format !== "video") return null;
  const video = isDoc(story.video) ? story.video : {};
  const videoId = parseYouTubeVideoId(video.url);
  if (!videoId) return null;
  const metadata = isDoc(video.metadata) ? video.metadata : {};
  return { videoId, embedUrl: youTubeEmbedUrl(videoId), title: text(metadata.title) || title, duration: formatVideoDuration(metadata.duration) };
}

/**
 * Every record a Lexical body holds populated, by ID: the normalizer's
 * resolvers read only these. A populated relationship inside a block is told
 * by its shape: Media has a MIME type, a Story a headline, a Poll a key.
 */
function populatedBodyRecords(body: unknown): { media: Map<string, Doc>; stories: Map<string, Doc>; polls: Map<string, Doc>; events: Map<string, Doc> } {
  const found = { media: new Map<string, Doc>(), stories: new Map<string, Doc>(), polls: new Map<string, Doc>(), events: new Map<string, Doc>() };
  const take = (value: unknown) => {
    const doc = populated(value as Relation);
    if (!doc) return;
    const key = mediaKey(doc.id as MediaId);
    if (typeof doc.mimeType === "string") found.media.set(key, doc);
    else if (typeof doc.pollKey === "string") found.polls.set(key, doc);
    else if (typeof doc.startAt === "string" && typeof doc.title === "string") found.events.set(key, doc);
    else if (typeof doc.headline === "string") found.stories.set(key, doc);
  };
  const visit = (node: unknown) => {
    if (!isDoc(node)) return;
    // Blocks, and inline blocks (a Source reference's PDF), hold populated relationships.
    if ((node.type === "block" || node.type === "inlineBlock") && isDoc(node.fields)) {
      for (const value of Object.values(node.fields)) {
        take(value);
        if (Array.isArray(value)) for (const row of value) if (isDoc(row)) for (const inner of Object.values(row)) take(inner);
      }
    }
    for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
  };
  visit(isDoc(body) && isDoc(body.root) ? body.root : body);
  return found;
}

export type PayloadStoryOptions = {
  publication: PreviewPublication;
  /** The keys of the repository interactives this host knows (the registry the preview renders with). */
  interactiveKeys?: ReadonlySet<string> | readonly string[];
  /** The keys of the repository trackers this host knows. */
  trackerKeys?: ReadonlySet<string> | readonly string[];
  corrections?: PublicCorrection[];
  /** "Now" for an unpublished story's dates. */
  now?: Date;
};

export type PayloadStoryResult = {
  story: PublicStory<PayloadImage>;
  /** What the body normalizer left out or did not know, for the newsroom to explain. */
  issues: NormalizeIssue[];
};

/** A Payload Story (populated to `STORY_LIVE_PREVIEW_DEPTH`) as the canonical public Story. */
export function payloadPublicStory(doc: Doc, options: PayloadStoryOptions): PayloadStoryResult {
  const now = (options.now ?? new Date()).toISOString();
  const headline = text(doc.headline);
  const title = headline || "Untitled story";
  const section = populated(doc.section as Relation);
  const publishedAt = text(doc.publishedAt) || now;
  const modifiedAt = text(doc.updatedAt) || publishedAt;
  const featured = populated(doc.featuredMedia as Relation);
  const records = populatedBodyRecords(doc.body);
  const interactiveKeys = new Set(options.interactiveKeys ?? []);
  const trackerKeys = new Set(options.trackerKeys ?? []);
  const { body, issues } = normalizePayloadStoryBody(
    { contentFormat: doc.contentFormat, body: doc.body, legacyHtml: doc.legacyHtml },
    {
      media: (id) => {
        const media = records.media.get(mediaKey(id));
        return media ? previewMediaAsset(media) : null;
      },
      references: {
        story: (id) => {
          const projected = publicStoryReference(records.stories.get(mediaKey(id)), { timeZone: options.publication.timeZone, excludeId: doc.id as number });
          // A related story's thumbnail is Media like any other: it joins the same table.
          if (projected?.thumbnail) records.media.set(mediaKey(projected.thumbnail.id as MediaId), projected.thumbnail);
          return projected?.reference ?? null;
        },
        poll: (id) => publicPollReference(records.polls.get(mediaKey(id)), new Date(options.now ?? Date.now())),
        // Live Preview populates relationships from the published Event (draft: false reads); a draft Event never resolves.
        event: (id) => publicEventReference(records.events.get(mediaKey(id))),
        interactive: (key) => interactiveKeys.has(key),
        tracker: (key) => trackerKeys.has(key),
        // Live Preview always draws the block and states the project's publication state itself (PreviewDataProject);
        // whether the story can publish is decided on the server and in the editor, never by what happened to be populated here.
        dataProject: (id) => ({ id })
      }
    }
  );
  const href = storyHref(text(doc.slug), section, publishedAt, options.publication.timeZone);
  const topics = populatedList(doc.topics).map(topicTerm).filter((term): term is PublicTerm => term !== null);
  const primarySection = sectionTerm(section);
  const people = populatedList(doc.contributors);

  const story: PublicStory<PayloadImage> = {
    id: doc.id as number,
    title,
    href: href || "#",
    url: href ? `${options.publication.publicSite}${href}` : options.publication.publicSite,
    titleHtml: escapeHtml(title),
    excerptHtml: deckHtml(text(doc.deck)),
    kicker: text(doc.kicker),
    image: featured && isImage(featured) ? { media: featured, caption: text(doc.featuredCaption) } : null,
    section: primarySection,
    sectionKeys: section ? [`section-${String(section.id)}`] : [],
    topicKeys: relationIds(doc.topics).map((id) => `topic-${String(id)}`),
    contributorKeys: relationIds(doc.contributors).map(personKey),
    publishedAt,
    video: null,
    listed: Boolean(primarySection),
    body,
    topics,
    sections: primarySection ? [primarySection] : [],
    athleteMeta: [],
    presentation: doc.presentation === "immersive" ? "immersive" : "standard",
    immersiveAlignment: doc.immersiveAlignment === "center" ? "center" : "bottom-left",
    primaryVideo: primaryVideo(doc, title),
    contributors: people.map(contributor),
    modifiedAt,
    corrections: options.corrections ?? [],
    // Live coverage on Payload stories arrives with Phase 11; the public renderer shows none until then.
    live: null,
    reportingNote: reportingNoteParagraphs(doc.reportingNote)
  };
  return { story, issues };
}

/** Another (published) Story as a card, relatedness and coverage facts. */
export function payloadStorySummary(doc: Doc, publication: Pick<PreviewPublication, "timeZone">): PublicStorySummary<PayloadImage> {
  const section = populated(doc.section as Relation);
  const featured = populated(doc.featuredMedia as Relation);
  const publishedAt = text(doc.publishedAt) || text(doc.updatedAt);
  const term = sectionTerm(section);
  const video = doc.format === "video" && parseYouTubeVideoId(isDoc(doc.video) ? doc.video.url : null)
    ? { duration: formatVideoDuration(isDoc(doc.video) && isDoc(doc.video.metadata) ? doc.video.metadata.duration : null) }
    : null;
  return {
    id: doc.id as number,
    title: text(doc.headline) || "Untitled story",
    href: storyHref(text(doc.slug), section, publishedAt, publication.timeZone) || "#",
    excerptHtml: deckHtml(text(doc.deck)),
    image: featured && isImage(featured) ? { media: featured } : null,
    section: term,
    sectionKeys: section ? [`section-${String(section.id)}`] : [],
    topicKeys: relationIds(doc.topics).map((id) => `topic-${String(id)}`),
    contributorKeys: relationIds(doc.contributors).map(personKey),
    publishedAt,
    video,
    listed: Boolean(term)
  };
}

/** The canonical context for Live Preview: images, dates and publication from the newsroom, candidates from the context read. */
export function payloadPresentationContext(
  publication: PreviewPublication,
  candidates: { relatedCandidates: PublicStorySummary<PayloadImage>[]; contributorStories: PublicStorySummary<PayloadImage>[]; series: PublicSeriesInput<PayloadImage>[] }
): ArticlePresentationContext<PayloadImage> {
  return {
    image: projectPayloadImage,
    formatDate: (value) => formatEditorialDate(value, publication.locale),
    publication: { shortName: publication.shortName, contactHref: publication.contactHref },
    ...candidates
  };
}
