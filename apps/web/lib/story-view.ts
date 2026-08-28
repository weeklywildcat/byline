import { cleanDeckText, type AthleteSpotlightView, type StoryView } from "@byline/ui";
import { getAthleteSportLabel, getAthleteSpotlightLabel, getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import {
  getAuthorHref,
  getFeaturedMedia,
  getPostAuthor,
  getPostHref,
  type WordPressPost
} from "@/lib/wordpress";

// Turns build-time WordPress records into the presentation-neutral view models
// the shared renderers consume. Everything WordPress-shaped stops here; the
// canonical resolver in @byline/content never sees a WordPressPost.

function getCleanDeck(post: WordPressPost) {
  return cleanDeckText(stripHtml(post.content.rendered || post.excerpt.rendered));
}

function getReadingTime(post: WordPressPost) {
  const words = stripHtml(post.content.rendered || post.excerpt.rendered).split(/\s+/).filter(Boolean).length;

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
  const cleanDeck = options.cleanDeck ?? false;

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
    image: image?.source_url
      ? {
          src: image.source_url,
          alt: image.alt_text || stripHtml(image.title.rendered ?? ""),
          width: image.media_details?.width ?? null,
          height: image.media_details?.height ?? null
        }
      : null
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
  const text = stripHtml(post.excerpt.rendered || post.content.rendered).replace(
    /\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i,
    ""
  );

  if (text.length <= 120) return text;

  const trimmed = text.slice(0, 120);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

export function toAthleteSpotlightView(post: WordPressPost): AthleteSpotlightView {
  const image = getFeaturedMedia(post);
  const blurb = getAthleteBlurb(post);

  return {
    id: post.id,
    name: getAthleteName(post),
    href: getPostHref(post),
    eyebrow: getAthleteSpotlightLabel(post),
    sport: getAthleteSportLabel(post),
    blurb: blurb || null,
    image: image?.source_url
      ? {
          src: image.source_url,
          alt: image.alt_text || stripHtml(image.title.rendered ?? ""),
          width: image.media_details?.width ?? null,
          height: image.media_details?.height ?? null
        }
      : null
  };
}
