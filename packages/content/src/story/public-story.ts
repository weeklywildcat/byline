import type { ImageCropShape } from "@byline/core";
import type { PublicArticleBody } from "@byline/article-body";
import type {
  ArticleImageView,
  ArticleLiveView,
  ArticleVideoView,
  ImmersiveAlignment,
  StoryPresentationChoice,
  StoryVideoBadgeView
} from "./presentation";

/**
 * The canonical public Story: what any CMS adapter (WordPress today, Payload
 * for Live Preview and later the snapshot) produces, and the only input the
 * presentation builder reads. It carries editorial facts, never a CMS record.
 *
 * Images are the adapter's own handles (`Image`): the builder decides how an
 * image is used (its geometry: role, sizes, priority, crop shape) and asks the
 * host to project it (`ArticlePresentationContext.image`), so Live Preview's
 * private Payload URLs and the public site's static URLs share one geometry.
 */
export type PublicTerm = {
  /** Stable key, e.g. the slug. */
  key: string;
  name: string;
  href: string;
};

export type PublicStoryContributor<Image> = {
  /** Identities this person matches on other stories (e.g. `user:12`, `guest-slug:jane`). */
  keys: string[];
  /** The view id rendered into the page. */
  id: string;
  name: string;
  /** Empty when the person has no public profile page. */
  href: string;
  role: string;
  bio: string;
  photo: Image | null;
  contactHref?: string;
};

export type CorrectionType = "correction" | "clarification" | "editor-note" | "substantive-update";

export type PublicCorrection = {
  id: string;
  type: CorrectionType;
  date: string | null;
  text: string;
  /** A legacy notice already printed in an imported body: counts as a correction, never printed again. */
  legacy?: boolean;
};

/** The facts another story contributes to this one (related, more by, series parts, coverage areas). */
export type PublicStorySummary<Image> = {
  id: number | string;
  title: string;
  href: string;
  excerptHtml: string;
  image: Image | null;
  /** The story's primary public section (its card label and its contributors' coverage areas). */
  section: PublicTerm | null;
  /** Every section and topic key, for relatedness. */
  sectionKeys: string[];
  topicKeys: string[];
  contributorKeys: string[];
  publishedAt: string;
  video: StoryVideoBadgeView | null;
  /** Eligible for story lists (related, more by, series): a general editorial story. */
  listed: boolean;
};

export type PublicStory<Image> = PublicStorySummary<Image> & {
  /** Absolute canonical URL. */
  url: string;
  titleHtml: string;
  /**
   * A short label above the headline, when the CMS has one (Payload does;
   * WordPress does not). Part of the canonical record; the public article
   * design does not print one yet, so neither does Live Preview.
   */
  kicker?: string;
  body: PublicArticleBody;
  /** Topics shown on the story; empty falls back to its public sections. */
  topics: PublicTerm[];
  /** Public (non-hidden) sections, in order. */
  sections: PublicTerm[];
  athleteMeta: string[];
  presentation: StoryPresentationChoice;
  immersiveAlignment: ImmersiveAlignment;
  primaryVideo: ArticleVideoView | null;
  contributors: PublicStoryContributor<Image>[];
  modifiedAt: string;
  corrections: PublicCorrection[];
  live: ArticleLiveView | null;
  reportingNote: string[];
};

/** A public series or ongoing coverage that contains the story, with its readable members in reading order. */
export type PublicSeriesInput<Image> = {
  id: number | string;
  title: string;
  href: string;
  description?: string;
  format: "series" | "coverage";
  complete: boolean;
  stories: PublicStorySummary<Image>[];
};

/** How the article uses an image. The host chooses URLs; the builder chooses this. */
export type StoryImageUsage = {
  role: "lead" | "contributor" | "card" | "series-part";
  sizes: string;
  priority: boolean;
  /** Whether the image is the page's canonical image for search, or presentation only. */
  searchVisibility: "canonical" | "presentation";
  shape?: ImageCropShape;
};

export type ArticlePresentationContext<Image> = {
  image: (source: Image, usage: StoryImageUsage) => ArticleImageView | null;
  /** "October 19, 2026" in the publication's locale. */
  formatDate: (iso: string) => string;
  publication: { shortName: string; contactHref: string };
  /** Candidate stories for Related; the builder filters, scores and limits them. */
  relatedCandidates: readonly PublicStorySummary<Image>[];
  /** Public stories by any of this story's contributors (More by, coverage areas). */
  contributorStories: readonly PublicStorySummary<Image>[];
  /** Public series and coverage containing this story. */
  series: readonly PublicSeriesInput<Image>[];
};
