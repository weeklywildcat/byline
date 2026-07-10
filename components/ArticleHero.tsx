import type { CSSProperties } from "react";
import { ArticleShareActions } from "@/components/ArticleShareActions";
import { decodeHtml, stripHtml } from "@/lib/format";
import type {
  WordPressArticleHero,
  WordPressArticleHeroImage,
  WordPressCategory,
  WordPressMedia
} from "@/lib/wordpress";

export type ArticleHeroImage = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  caption: string;
  credit: string;
};

type ArticleHeroProps = {
  hero: WordPressArticleHero;
  image: ArticleHeroImage;
  category: WordPressCategory | null;
  title: string;
  titleHtml: string;
  excerptHtml: string;
  athleteSpotlightLabel: string | null;
  athleteSport: string | null;
  authorName: string;
  authorHref: string | null;
  publishedDate: string;
  publishedLabel: string;
  updatedDate: string | null;
  updatedLabel: string | null;
  readingTime: string;
  articleUrl: string;
};

function getFeaturedHeroImage(image: WordPressMedia): ArticleHeroImage {
  const caption = image.caption?.rendered?.trim() || image.media_details?.image_meta?.caption || "";
  const credit = stripHtml(
    image.weeklyWildcatImage?.creditText ||
      image.media_details?.image_meta?.credit ||
      image.media_details?.image_meta?.copyright ||
      ""
  );

  return {
    url: image.source_url,
    alt: image.alt_text || stripHtml(image.title?.rendered ?? ""),
    width: image.media_details?.width ?? null,
    height: image.media_details?.height ?? null,
    caption,
    credit
  };
}

function getCustomHeroImage(image: WordPressArticleHeroImage): ArticleHeroImage {
  return {
    url: image.sourceUrl,
    alt: image.alt,
    width: image.width,
    height: image.height,
    caption: image.caption,
    credit: image.creditText
  };
}

export function getArticleHeroImage(hero: WordPressArticleHero | undefined, featuredImage: WordPressMedia | null) {
  if (!hero?.enabled) {
    return null;
  }

  if (hero.imageSource === "custom") {
    return hero.image?.sourceUrl ? getCustomHeroImage(hero.image) : null;
  }

  return featuredImage?.source_url ? getFeaturedHeroImage(featuredImage) : null;
}

export function ArticleHero({
  hero,
  image,
  category,
  title,
  titleHtml,
  excerptHtml,
  athleteSpotlightLabel,
  athleteSport,
  authorName,
  authorHref,
  publishedDate,
  publishedLabel,
  updatedDate,
  updatedLabel,
  readingTime,
  articleUrl
}: ArticleHeroProps) {
  const layout = ["text-left", "text-right", "overlay"].includes(hero.layout) ? hero.layout : "text-left";
  const textColor = hero.textColor === "dark" ? "dark" : "light";
  const backgroundColor = /^#[0-9a-f]{6}$/i.test(hero.backgroundColor) ? hero.backgroundColor : "#171a21";
  const caption = image.caption.trim();
  const credit = stripHtml(image.credit).trim();

  return (
    <header
      className={`article-custom-hero article-custom-hero-${layout} article-custom-hero-text-${textColor}`}
      style={{ "--article-hero-background": backgroundColor } as CSSProperties}
    >
      <figure className="article-custom-hero-media">
        <img
          src={image.url}
          alt={image.alt}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          loading="eager"
        />
        {caption || credit ? (
          <figcaption>
            <div className="article-custom-hero-caption-row">
              {caption ? <div dangerouslySetInnerHTML={{ __html: caption }} /> : null}
              {credit ? <p>Credit: {credit}</p> : null}
            </div>
          </figcaption>
        ) : null}
      </figure>

      <div className="article-custom-hero-content">
        {category ? (
          <a className="article-section-label" href={`/category/${category.slug}/`}>
            {decodeHtml(category.name)}
          </a>
        ) : null}
        <h1 dangerouslySetInnerHTML={{ __html: titleHtml }} />
        {excerptHtml ? <div className="article-excerpt" dangerouslySetInnerHTML={{ __html: excerptHtml }} /> : null}
        {athleteSpotlightLabel || athleteSport ? (
          <div className="article-athlete-meta" aria-label="Athlete spotlight details">
            {athleteSpotlightLabel ? <span>{athleteSpotlightLabel}</span> : null}
            {athleteSport ? <span>{athleteSport}</span> : null}
          </div>
        ) : null}
        <div className="article-meta-block">
          <p className="article-author-line">
            By {authorHref ? <a href={authorHref}>{authorName}</a> : <span>{authorName}</span>}
          </p>
          <div className="article-timing">
            <time dateTime={publishedDate}>Published {publishedLabel}</time>
            {updatedDate && updatedLabel ? <time dateTime={updatedDate}>Updated {updatedLabel}</time> : null}
            <span>{readingTime}</span>
          </div>
        </div>
        <ArticleShareActions title={title} url={articleUrl} />
      </div>
    </header>
  );
}
