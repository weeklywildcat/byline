import { articleBodyPlainText } from "@byline/content/story";
import { nativeStory } from "./native-snapshot";
import { IMAGE_CROP_SHAPES, type ImageCropShape } from "@byline/core";
import { cleanDeckText, stripBracketedEllipsis, type AthleteSpotlightView, type StoryImageCrop, type StoryImageView, type StoryView } from "@byline/ui";
import { getAthleteSportLabel, getAthleteSpotlightLabel, getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import { getMeaningfulImageAlt } from "@/lib/image-alt";
import { getStoryVideoBadge } from "@/lib/story-video";
import { getCroppedImageSource, getResponsiveImageProps } from "@/lib/media";
import {
  getAuthorHref,
  getFeaturedMedia,
  getMediaCredit,
  getPostAuthor,
  getPostHref,
  getPostLiveCoverage,
  type WordPressMedia,
  type WordPressPost
} from "@/lib/wordpress";

// Turns build-time WordPress records into the presentation-neutral view models
// the shared renderers consume. Everything WordPress-shaped stops here; the
// canonical resolver in @byline/ui/homepage never sees a WordPressPost.

// The photo for a card, with its srcset, the editor's focal point and any
// per-shape crops. The card renderer picks the shape and `sizes` per variant.
function toStoryImageView(image: WordPressMedia | null, credit: string): StoryImageView | null {
  const photo = getResponsiveImageProps(image, { imageSearchVisibility: "presentation" });
  if (!image || !photo) return null;
  const crops: Partial<Record<ImageCropShape, StoryImageCrop>> = {};
  for (const shape of IMAGE_CROP_SHAPES) {
    const cropped = getCroppedImageSource(image, shape, "presentation");
    if (cropped) crops[shape] = cropped;
  }
  return {
    src: photo.src,
    alt: getMeaningfulImageAlt(image),
    width: photo.width ?? null,
    height: photo.height ?? null,
    ...(credit ? { credit } : {}),
    ...(photo.srcSet ? { srcSet: photo.srcSet } : {}),
    ...(photo.objectPosition ? { objectPosition: photo.objectPosition } : {}),
    ...(Object.keys(crops).length ? { crops } : {})
  };
}

function getCleanDeck(post: WordPressPost) {
  const native = nativeStory(post.id);
  return cleanDeckText((native ? articleBodyPlainText(native.body) : stripHtml(post.content.rendered)) || stripHtml(post.excerpt.rendered));
}

function getReadingTime(post: WordPressPost) {
  const native = nativeStory(post.id);
  const words = ((native ? articleBodyPlainText(native.body) : stripHtml(post.content.rendered)) || stripHtml(post.excerpt.rendered)).split(/\s+/).filter(Boolean).length;

  return `${Math.max(1, Math.ceil(words / 225))} min read`;
}

export type StoryViewOptions = {
  cleanDeck?: boolean;
  includeReadingTime?: boolean;
};

export function toStoryView(post: WordPressPost, options: StoryViewOptions = {}): StoryView {
  const author = getPostAuthor(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const credit = getMediaCredit(image);
  const cleanDeck = options.cleanDeck ?? false;
  const video = getStoryVideoBadge(post);

  return {
    id: post.id,
    title: stripHtml(post.title.rendered),
    href: getPostHref(post),
    deck: cleanDeck ? getCleanDeck(post) : post.excerpt.rendered.trim(),
    deckIsHtml: !cleanDeck,
    isoDate: post.date,
    displayDate: formatDisplayDate(post.date),
    readingTime: options.includeReadingTime ? getReadingTime(post) : null,
    category: category ? { name: decodeHtml(category.name), href: `/category/${category.slug}/` } : null,
    author: author ? { name: author.name, href: getAuthorHref(author) } : null,
    ...(getPostLiveCoverage(post)?.status === "live" ? { live: true } : {}),
    ...(video ? { video } : {}),
    image: toStoryImageView(image, credit)
  };
}

// --- athlete spotlight ------------------------------------------------------
//
// Moved verbatim from apps/web/components/SportsAthleteFeature.tsx.

function getAthleteName(post: WordPressPost) {
  return stripHtml(post.title.rendered)
    .replace(/^athlete\s+of\s+the\s+(?:week|month)\s*:?\s*/i, "")
    .trim();
}

function getAthleteBlurb(post: WordPressPost) {
  // Shares the linear excerpt-marker strip rather than repeating the regex it
  // replaced: the same publication text reaches both, and the same
  // backtracking hazard would come with it.
  const native = nativeStory(post.id);
  const text = stripBracketedEllipsis(stripHtml(post.excerpt.rendered) || (native ? articleBodyPlainText(native.body) : stripHtml(post.content.rendered)));

  if (text.length <= 120) return text;

  const trimmed = text.slice(0, 120);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

export function toAthleteSpotlightView(post: WordPressPost): AthleteSpotlightView {
  const image = getFeaturedMedia(post);
  const credit = getMediaCredit(image);
  const blurb = getAthleteBlurb(post);

  return {
    id: post.id,
    name: getAthleteName(post),
    href: getPostHref(post),
    eyebrow: getAthleteSpotlightLabel(post),
    sport: getAthleteSportLabel(post),
    blurb: blurb || null,
    image: toStoryImageView(image, credit)
  };
}
