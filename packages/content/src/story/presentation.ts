import type { PublicArticleBody } from "@byline/article-body";

/**
 * The article boundary between a content adapter and a renderer.
 *
 * WordPress, Payload and fixtures all end here: the renderers in `@byline/ui`
 * and `@byline/story-presentations` only receive this model, never a CMS
 * record. It is plain data (no React), so the rules that build it and the
 * hosts that adapt into it never depend on a renderer. HTML fields are
 * sanitized by the adapter before they cross this boundary.
 */
export type ArticleImageView = {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  captionHtml?: string;
  fallbackCaption?: string;
  credit?: string;
  /** CSS object-position from the editor's focal point; absent when centred or already cropped. */
  objectPosition?: string;
  /**
   * Art-directed alternatives for the lead photograph of a Feature, Immersive
   * or Split opening: the editor's explicit phone and tablet crops, in the
   * order a `<picture>` tries them. Absent when the editor made no crop, in
   * which case `src` and `objectPosition` serve every viewport.
   */
  sources?: ArticleImageSourceView[];
};

export type ArticleImageSourceView = {
  /** A media query, for example `(max-width: 640px)`. */
  media: string;
  srcSet: string;
  sizes?: string;
  width?: number | null;
  height?: number | null;
};

export type ArticleLinkView = {
  label: string;
  href: string;
};

export type ArticleContributorView = {
  id: string;
  name: string;
  /** Empty for one-off guests, who are credited without a profile page. */
  href: string;
  role: string;
  bio: string;
  photo?: ArticleImageView | null;
  contactHref?: string;
  coverage?: ArticleLinkView[];
};

export type ArticleCorrectionView = {
  id: string;
  label: string;
  date?: string | null;
  dateLabel?: string | null;
  text: string;
};

export type ArticleTopicView = {
  id: string;
  name: string;
};

/** A video story's card treatment: the label and, when known, the running time ("4:13"). */
export type StoryVideoBadgeView = {
  duration: string | null;
};

export type ArticleStoryCardView = {
  id: number | string;
  title: string;
  href: string;
  excerptHtml?: string;
  image?: ArticleImageView | null;
  category?: string | null;
  date?: string | null;
  dateLabel?: string | null;
  /** Present for a video story; the card shows a small Video label. */
  video?: StoryVideoBadgeView | null;
};

/**
 * A video story's one primary video. The player is a real iframe in the
 * rendered HTML, and `embedUrl` is the same URL the structured data and the
 * video sitemap name.
 */
export type ArticleVideoView = {
  videoId: string;
  embedUrl: string;
  /** Accessible name for the player. */
  title: string;
  duration?: string | null;
};

export type ArticleSeriesPartView = {
  id: number | string;
  /** 1-based reading order among the published stories. */
  number: number;
  title: string;
  href: string;
  current: boolean;
  date?: string | null;
  dateLabel?: string | null;
  image?: ArticleImageView | null;
};

/**
 * The public series or ongoing coverage a story belongs to. A series is read
 * in order (Part 1, Part 2…); coverage is a set of stories on one subject.
 */
export type ArticleSeriesView = {
  format: "series" | "coverage";
  title: string;
  href: string;
  description?: string;
  /** False while more parts may still be published, so no total is promised. */
  complete: boolean;
  /** This story's part number among the published stories. */
  position: number;
  total: number;
  previous?: ArticleSeriesPartView | null;
  next?: ArticleSeriesPartView | null;
  /** Every published part for a series; the other stories, newest first, for coverage. */
  parts: ArticleSeriesPartView[];
};

/**
 * Live coverage on an article (NYT-style live page): a status bar, an optional
 * pinned "key points" summary, and every update newest first.
 */
export type ArticleLiveImageView = {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  credit?: string;
};

export type ArticleLiveUpdateView = {
  id: number;
  title: string;
  /** Server-built HTML from a fixed set of tags (p, br, ul, li, a). */
  html: string;
  /** ISO instant. */
  date: string;
  /** "Nov. 2, 4:12 PM" in the publication's timezone. */
  dateLabel: string;
  author?: string;
  /** The author's profile page; the name is plain text without one. */
  authorHref?: string | null;
  /** "Sports editor", "Reporting from the stadium" and the like. */
  authorRole?: string | null;
  authorPhoto?: { src: string; width?: number | null; height?: number | null } | null;
  image?: ArticleLiveImageView | null;
};

export type ArticleLiveView = {
  postId: number | string;
  status: "live" | "ended";
  startedAt: string;
  endedAt?: string | null;
  endedLabel?: string | null;
  /** The most recent update edit or coverage state change. */
  updatedAt: string;
  updatedLabel: string;
  keyPoints?: ArticleLiveUpdateView | null;
  updates: ArticleLiveUpdateView[];
  /** Static JSON the page re-reads while live. */
  feedUrl: string;
};

/**
 * The built-in openings an author chooses between ("how should this story
 * begin?"). Absent means standard. A repository custom presentation is keyed by
 * story ID in the registry and never uses this field, so it always overrides it.
 */
export const STORY_PRESENTATION_CHOICES = ["standard", "feature", "immersive", "split"] as const;
export type StoryPresentationChoice = (typeof STORY_PRESENTATION_CHOICES)[number];
/** Immersive: where the headline sits over the photograph. */
export type ImmersiveAlignment = "bottom-left" | "center";
/** Feature: how far the lead photograph runs across the page. */
export type FeatureImageWidth = "wide" | "full";
/** Split: which side of a desktop opening carries the photograph. */
export type SplitImageSide = "left" | "right";
/**
 * The site chrome around a story, chosen separately from its opening.
 * `minimal` keeps only menu, logo and search over the story opening.
 */
export type StorySiteNavigation = "standard" | "minimal";

export type ArticlePresentation = {
  id: number | string;
  url: string;
  title: string;
  titleHtml: string;
  excerptHtml: string;
  /**
   * The story body, provider-neutral: imported HTML (`legacy-html`) or the
   * semantic body (`byline-v1`). Renderers branch on `format`; nothing
   * serializes a semantic body back into HTML to get here.
   */
  body: PublicArticleBody;
  category?: ArticleLinkView | null;
  athleteMeta?: string[];
  /** The author's built-in presentation choice. Absent means standard. */
  storyPresentation?: StoryPresentationChoice;
  /** Headline position for an immersive story. Absent means bottom-left. */
  immersiveAlignment?: ImmersiveAlignment;
  /** Image width for a feature story. Absent means wide. */
  featureWidth?: FeatureImageWidth;
  /** Image side for a split story. Absent means right. */
  splitImageSide?: SplitImageSide;
  /** The site chrome around the story. Absent means standard. */
  siteNavigation?: StorySiteNavigation;
  /** A video story's primary video; absent for an article, even one with embeds in its body. */
  video?: ArticleVideoView | null;
  contributors: ArticleContributorView[];
  fallbackByline: string;
  publishedAt: string;
  publishedLabel: string;
  modifiedAt?: string | null;
  modifiedLabel?: string | null;
  readingTime: string;
  image?: ArticleImageView | null;
  corrections: ArticleCorrectionView[];
  topics: ArticleTopicView[];
  update?: { modifiedAt: string; label: string } | null;
  /** Live coverage, while live and after it ends; absent for ordinary stories. */
  live?: ArticleLiveView | null;
  relatedStories: ArticleStoryCardView[];
  moreByAuthorStories: ArticleStoryCardView[];
  /** "How we reported this", as plain-text paragraphs. Absent or empty prints nothing. */
  reportingNote?: string[];
  /** The public series or coverage this story is part of, if any. */
  series?: ArticleSeriesView | null;
  publication: {
    shortName: string;
    contactHref: string;
  };
};

/** An empty body: what a visual story's model carries, since its narrative replaces the CMS body. */
export const EMPTY_ARTICLE_BODY: PublicArticleBody = { format: "legacy-html", html: "" };
