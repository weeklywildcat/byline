import type { ImageCropShape } from "@byline/core";
import type {
  ArticleContributorView,
  ArticleImageSourceView,
  ArticleImageView,
  ArticleLinkView,
  ArticlePresentation,
  ArticleSeriesPartView,
  ArticleSeriesView,
  ArticleStoryCardView
} from "./presentation";
import type {
  ArticlePresentationContext,
  CorrectionType,
  PublicSeriesInput,
  PublicStory,
  PublicStoryContributor,
  PublicStorySummary,
  PublicTerm,
  StoryImageUsage
} from "./public-story";
import { requestedPresentation } from "./resolution";
import { articleBodyPlainText, plainTextFromHtml, wordCount } from "./text";

/**
 * Byline's public article rules, applied to the canonical Story. The public
 * site (WordPress adapter) and the newsroom's Live Preview (Payload adapter)
 * both build `ArticlePresentation` here, so reading time, the update notice,
 * corrections, related stories, More by, series placement and contributor
 * coverage areas cannot drift between them.
 */

const WORDS_PER_MINUTE = 225;
const UPDATE_THRESHOLD_MS = 60 * 60 * 1000;
const RELATED_LIMIT = 3;
const MORE_BY_LIMIT = 3;
const COVERAGE_AREA_LIMIT = 3;
const COVERAGE_GUIDE_LIMIT = 4;

/** The geometry of every image the article uses. Both hosts project through these. */
export const ARTICLE_IMAGE_USAGE = {
  lead: { role: "lead", sizes: "(max-width: 900px) 100vw, 900px", priority: true, searchVisibility: "canonical" },
  // The Feature, Immersive and Split openings paint the lead photograph across the viewport.
  leadFull: { role: "lead", sizes: "100vw", priority: true, searchVisibility: "canonical" },
  leadSplit: { role: "lead", sizes: "(max-width: 1023px) 100vw, 56vw", priority: true, searchVisibility: "canonical" },
  contributor: { role: "contributor", sizes: "132px", priority: false, searchVisibility: "presentation" },
  // Compact teasers are square (globals.css .story-teaser-compact).
  card: { role: "card", sizes: "(max-width: 900px) 100vw, 360px", priority: false, searchVisibility: "presentation", shape: "square" },
  seriesPart: { role: "series-part", sizes: "(max-width: 700px) 30vw, 180px", priority: false, searchVisibility: "presentation", shape: "standard" }
} as const satisfies Record<string, StoryImageUsage>;

/**
 * The lead photograph for the story's opening. Standard keeps the original
 * geometry exactly. Feature, Immersive and Split ask for full-viewport sizes
 * and the editor's explicit phone and tablet crops, when they made any.
 */
function leadImage<Image>(story: PublicStory<Image>, context: ArticlePresentationContext<Image>): ArticleImageView | null {
  if (!story.image) return null;
  const opening = requestedPresentation(story.presentation);
  if (opening === "standard" || story.primaryVideo) return context.image(story.image, ARTICLE_IMAGE_USAGE.lead);
  const usage = opening === "split" ? ARTICLE_IMAGE_USAGE.leadSplit : ARTICLE_IMAGE_USAGE.leadFull;
  const image = context.image(story.image, usage);
  if (!image) return null;
  const directions: Array<{ media: string; shape: ImageCropShape }> = opening === "immersive"
    ? [{ media: "(max-width: 1023px) and (orientation: portrait)", shape: "portrait" }]
    : [{ media: "(max-width: 640px)", shape: "portrait" }, { media: "(max-width: 1023px)", shape: "standard" }];
  const sources: ArticleImageSourceView[] = [];
  for (const { media, shape } of directions) {
    const crop = context.image(story.image, { ...usage, shape, cropOnly: true });
    if (crop?.srcSet) sources.push({ media, srcSet: crop.srcSet, sizes: usage.sizes === ARTICLE_IMAGE_USAGE.leadSplit.sizes ? "100vw" : usage.sizes, width: crop.width, height: crop.height });
  }
  return sources.length > 0 ? { ...image, sources } : image;
}

export function readingTimeLabel(words: number): string {
  return `${Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))} min read`;
}

/** "N min read" from the body, or from the deck when the body has no words yet. */
export function storyReadingTime(story: Pick<PublicStory<unknown>, "body" | "excerptHtml">): string {
  const bodyText = articleBodyPlainText(story.body);
  return readingTimeLabel(wordCount(bodyText || plainTextFromHtml(story.excerptHtml)));
}

/** A story counts as updated when it changed more than an hour after it was published. */
export function hasMeaningfulUpdate(publishedAt: string, modifiedAt: string): boolean {
  const published = new Date(publishedAt).getTime();
  const modified = new Date(modifiedAt).getTime();
  return Number.isFinite(published) && Number.isFinite(modified) && modified - published > UPDATE_THRESHOLD_MS;
}

export function correctionTypeLabel(type: CorrectionType | string): string {
  switch (type) {
    case "clarification":
      return "Clarification";
    case "editor-note":
      return "Editor’s note";
    case "substantive-update":
      return "Substantive update";
    default:
      return "Correction";
  }
}

/** "How we reported this" as paragraphs: blank lines separate them. */
export function reportingNoteParagraphs(note: unknown): string[] {
  if (typeof note !== "string") return [];
  return note.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function storyCardView<Image>(story: PublicStorySummary<Image>, context: Pick<ArticlePresentationContext<Image>, "image" | "formatDate">): ArticleStoryCardView {
  return {
    id: story.id,
    title: story.title,
    href: story.href,
    excerptHtml: story.excerptHtml,
    image: story.image ? context.image(story.image, ARTICLE_IMAGE_USAGE.card) : null,
    category: story.section?.name ?? null,
    date: story.publishedAt,
    dateLabel: context.formatDate(story.publishedAt),
    ...(story.video ? { video: story.video } : {})
  };
}

const sharesKey = (left: readonly string[], right: readonly string[]) => left.some((key) => right.includes(key));

function coverageAreas<Image>(stories: readonly PublicStorySummary<Image>[]): ArticleLinkView[] {
  const counts = new Map<string, { section: PublicTerm; count: number }>();
  for (const story of stories) {
    if (!story.section) continue;
    const existing = counts.get(story.section.key);
    counts.set(story.section.key, { section: story.section, count: existing ? existing.count + 1 : 1 });
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.section.name.localeCompare(right.section.name))
    .slice(0, COVERAGE_AREA_LIMIT)
    .map(({ section }) => ({ label: section.name, href: section.href }));
}

function contributorView<Image>(contributor: PublicStoryContributor<Image>, stories: readonly PublicStorySummary<Image>[], context: ArticlePresentationContext<Image>): ArticleContributorView {
  return {
    id: contributor.id,
    name: contributor.name,
    href: contributor.href,
    role: contributor.role,
    bio: contributor.bio,
    photo: contributor.photo ? context.image(contributor.photo, ARTICLE_IMAGE_USAGE.contributor) : null,
    ...(contributor.contactHref ? { contactHref: contributor.contactHref } : {}),
    coverage: coverageAreas(stories.filter((story) => sharesKey(story.contributorKeys, contributor.keys)))
  };
}

/** Up to three listed stories sharing the most sections (1 point) and topics (2 points), newest first on ties. */
export function relatedStories<Image>(story: PublicStorySummary<Image>, candidates: readonly PublicStorySummary<Image>[]): PublicStorySummary<Image>[] {
  const sections = new Set(story.sectionKeys);
  const topics = new Set(story.topicKeys);
  return candidates
    .filter((candidate) => candidate.id !== story.id && candidate.listed)
    .map((candidate, index) => ({
      candidate,
      score: candidate.sectionKeys.filter((key) => sections.has(key)).length + candidate.topicKeys.filter((key) => topics.has(key)).length * 2,
      index
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.candidate.publishedAt).getTime() - new Date(left.candidate.publishedAt).getTime() || left.index - right.index)
    .slice(0, RELATED_LIMIT)
    .map((entry) => entry.candidate);
}

/** A story in more than one public coverage reads as part of the first series, else the first coverage. */
export function findStorySeries<Image>(storyId: number | string, series: readonly PublicSeriesInput<Image>[]): PublicSeriesInput<Image> | null {
  const containing = series.filter((entry) => entry.stories.some((member) => member.id === storyId));
  return containing.find((entry) => entry.format === "series") ?? containing[0] ?? null;
}

function seriesPart<Image>(story: PublicStorySummary<Image>, number: number, current: boolean, context: Pick<ArticlePresentationContext<Image>, "image" | "formatDate">, withImage = false): ArticleSeriesPartView {
  return {
    id: story.id,
    number,
    title: story.title,
    href: story.href,
    current,
    date: story.publishedAt,
    dateLabel: context.formatDate(story.publishedAt),
    ...(withImage ? { image: story.image ? context.image(story.image, ARTICLE_IMAGE_USAGE.seriesPart) : null } : {})
  };
}

/** Where a story sits in its public series or coverage. */
export function buildSeriesView<Image>(storyId: number | string, series: readonly PublicSeriesInput<Image>[], context: Pick<ArticlePresentationContext<Image>, "image" | "formatDate">): ArticleSeriesView | null {
  const entry = findStorySeries(storyId, series);
  if (!entry) return null;
  const stories = entry.stories.filter((member) => member.listed);
  const index = stories.findIndex((member) => member.id === storyId);
  if (index < 0) return null;
  const parts = stories.map((member, memberIndex) => seriesPart(member, memberIndex + 1, memberIndex === index, context));
  const base = {
    title: entry.title,
    href: entry.href,
    ...(entry.description ? { description: entry.description } : {}),
    complete: entry.complete,
    position: index + 1,
    total: stories.length
  };
  if (entry.format === "coverage") {
    const others = parts
      .filter((part) => !part.current)
      .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime())
      .slice(0, COVERAGE_GUIDE_LIMIT);
    return { format: "coverage", ...base, previous: null, next: null, parts: others };
  }
  const next = stories[index + 1];
  return {
    format: "series",
    ...base,
    previous: index > 0 ? parts[index - 1] : null,
    next: next ? seriesPart(next, index + 2, false, context, true) : null,
    parts
  };
}

/** The canonical Story as the article renderer's model. Pure: no CMS, React or host access. */
export function buildArticlePresentation<Image>(story: PublicStory<Image>, context: ArticlePresentationContext<Image>): ArticlePresentation {
  const hasCorrectionNotice = story.corrections.length > 0;
  const live = story.live;
  // A live story's "Updated" time is its newest update, and the live section
  // replaces the generic "updated after publication" notice.
  const updated = !live && hasMeaningfulUpdate(story.publishedAt, story.modifiedAt) && !hasCorrectionNotice;
  const liveUpdated = live && live.updatedAt !== live.startedAt ? live : null;
  const series = buildSeriesView(story.id, context.series, context);
  // The series guide already lists the other parts; do not repeat them as related stories.
  const seriesIds = new Set(series?.format === "series" ? series.parts.map((part) => part.id) : []);
  const related = relatedStories(story, context.relatedCandidates.filter((candidate) => !seriesIds.has(candidate.id)));
  const relatedIds = new Set(related.map((entry) => entry.id));
  const moreBy = context.contributorStories
    .filter((candidate) => candidate.listed && candidate.id !== story.id && !relatedIds.has(candidate.id))
    .slice(0, MORE_BY_LIMIT);
  const topics = story.topics.length > 0 ? story.topics : story.sections;

  return {
    id: story.id,
    url: story.url,
    title: story.title,
    titleHtml: story.titleHtml,
    excerptHtml: story.excerptHtml,
    body: story.body,
    category: story.section ? { label: story.section.name, href: story.section.href } : null,
    athleteMeta: story.athleteMeta,
    storyPresentation: story.presentation,
    immersiveAlignment: story.immersiveAlignment,
    ...(story.featureWidth ? { featureWidth: story.featureWidth } : {}),
    ...(story.splitImageSide ? { splitImageSide: story.splitImageSide } : {}),
    ...(story.siteNavigation ? { siteNavigation: story.siteNavigation } : {}),
    ...(story.primaryVideo ? { video: story.primaryVideo } : {}),
    contributors: story.contributors.map((contributor) => contributorView(contributor, context.contributorStories, context)),
    fallbackByline: `${context.publication.shortName} Staff`,
    publishedAt: story.publishedAt,
    publishedLabel: context.formatDate(story.publishedAt),
    modifiedAt: liveUpdated ? liveUpdated.updatedAt : updated ? story.modifiedAt : null,
    modifiedLabel: liveUpdated ? liveUpdated.updatedLabel : updated ? context.formatDate(story.modifiedAt) : null,
    readingTime: storyReadingTime(story),
    image: leadImage(story, context),
    corrections: story.corrections.filter((correction) => !correction.legacy).map((correction) => ({
      id: correction.id,
      label: correctionTypeLabel(correction.type),
      date: correction.date || null,
      dateLabel: correction.date ? context.formatDate(correction.date) : null,
      text: correction.text
    })),
    topics: topics.map((term) => ({ id: term.key, name: term.name })),
    update: updated ? { modifiedAt: story.modifiedAt, label: `This story was updated after initial publication on ${context.formatDate(story.modifiedAt)}.` } : null,
    live,
    relatedStories: related.map((entry) => storyCardView(entry, context)),
    moreByAuthorStories: moreBy.map((entry) => storyCardView(entry, context)),
    reportingNote: story.reportingNote,
    series,
    publication: context.publication
  };
}
