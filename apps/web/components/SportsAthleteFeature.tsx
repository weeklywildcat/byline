import { getAthleteSportLabel, getAthleteSpotlightLabel } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { getFeaturedMedia, getPostHref, type WordPressPost } from "@/lib/wordpress";

type SportsAthleteFeatureProps = {
  post: WordPressPost;
};

function getAthleteName(post: WordPressPost) {
  return stripHtml(post.title.rendered)
    .replace(/^athlete\s+of\s+the\s+(?:week|month)\s*:?\s*/i, "")
    .trim();
}

function getAthleteBlurb(post: WordPressPost) {
  const text = stripHtml(post.excerpt.rendered || post.content.rendered).replace(/\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i, "");

  if (text.length <= 120) {
    return text;
  }

  const trimmed = text.slice(0, 120);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

export function SportsAthleteFeature({ post }: SportsAthleteFeatureProps) {
  const image = getFeaturedMedia(post);
  const href = getPostHref(post);
  const name = getAthleteName(post);
  const spotlightLabel = getAthleteSpotlightLabel(post);
  const sport = getAthleteSportLabel(post);
  const blurb = getAthleteBlurb(post);

  return (
    <article className="sports-athlete-feature">
      {image?.source_url ? (
        <a className="sports-athlete-image" href={href} aria-label={name}>
          <img
            src={image.source_url}
            alt={image.alt_text || stripHtml(image.title.rendered)}
            width={image.media_details?.width}
            height={image.media_details?.height}
            loading="lazy"
          />
        </a>
      ) : null}
      <div className="sports-athlete-body">
        <p className="sports-athlete-eyebrow">{spotlightLabel}</p>
        <h3>
          <a href={href}>{name}</a>
        </h3>
        {sport ? <p className="sports-athlete-team">{sport}</p> : null}
        {blurb ? <p className="sports-athlete-blurb">{blurb}</p> : null}
        <a className="sports-athlete-link" href={href}>
          Meet {name} →
        </a>
      </div>
    </article>
  );
}
