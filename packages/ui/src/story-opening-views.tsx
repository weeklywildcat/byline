import type { CSSProperties, ReactNode } from "react";
import type { ArticleImageView } from "@byline/content/story";
import { resolveSiteNavigation } from "@byline/content/story";
import {
  ArticleAthleteMeta,
  ArticleBody,
  ArticleCategory,
  ArticleExcerpt,
  ArticleHeadline,
  ArticleImageCaption,
  ArticleLive,
  ArticleMeta,
  ArticleSeriesLabel,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter,
  type ArticleViewProps
} from "./article-view";

/**
 * The Feature and Split story openings: "how should this story begin?".
 *
 * Both are `ArticleView` rearranged with the same primitives, so every word,
 * the body, corrections, slots and the standard ending still come from the
 * story. Neither is a page builder: Feature picks an image width, Split picks
 * an image side, and everything else is the opening's own design.
 *
 * Both carry `data-story-nav-zone`, the region the Minimal site navigation
 * sits over (the layout reads it; the article never touches the header), and
 * `data-site-navigation`, so the opening reserves room for the bar where the
 * page background (not a photograph) is behind it.
 */

function joinClassNames(...names: Array<string | undefined | false>) {
  return names.filter(Boolean).join(" ");
}

/** The lead photograph, art-directed with the editor's phone and tablet crops when they exist. */
export function OpeningImage({ image, className, loading = "eager" }: { image: ArticleImageView; className?: string; loading?: "eager" | "lazy" }): ReactNode {
  const img = (
    <img
      className={className}
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.sizes}
      alt={image.alt}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading={loading}
      fetchPriority={loading === "eager" ? "high" : "auto"}
      decoding="async"
      style={image.objectPosition ? ({ "--byline-image-natural-position": image.objectPosition } as CSSProperties) : undefined}
    />
  );
  if (!image.sources?.length) return img;
  return (
    <picture
      data-phone-crop={image.sources.some((source) => source.media === "(max-width: 640px)") ? "" : undefined}
      data-tablet-crop={image.sources.some((source) => source.media === "(max-width: 1023px)") ? "" : undefined}
    >
      {image.sources.map((source) => (
        <source key={source.media} media={source.media} srcSet={source.srcSet} sizes={source.sizes} width={source.width ?? undefined} height={source.height ?? undefined} />
      ))}
      {img}
    </picture>
  );
}

function OpeningKicker({ presentation }: Pick<ArticleViewProps, "presentation">): ReactNode {
  return (
    <div className="article-kicker story-opening-kicker">
      <ArticleCategory presentation={presentation} className="story-opening-category" />
      <ArticleSeriesLabel presentation={presentation} className="story-opening-series" />
    </div>
  );
}

/** Everything after the opening: the body, live coverage, footer and the standard ending. */
function OpeningContinuation({ presentation, slots }: Pick<ArticleViewProps, "presentation" | "slots">): ReactNode {
  return (
    <ArticleShell as="div" className="story-opening-body-shell">
      <article className="article-story">
        <ArticleBody presentation={presentation} primaryGame={slots?.primaryGame} host={slots?.bodyHost} />
        <ArticleLive presentation={presentation} />
        <ArticleStoryFooter presentation={presentation} slots={slots} />
      </article>
      <ArticleStandardEnding presentation={presentation} />
    </ArticleShell>
  );
}

/**
 * Feature: headline, deck and byline stay on the page background; the lead
 * photograph runs wide or full-bleed below them, with its caption and credit
 * inset and readable. For profiles, enterprise and narrative features.
 */
export function FeatureArticleView({ presentation, slots = {}, className }: ArticleViewProps): ReactNode {
  const image = presentation.image;
  const width = presentation.featureWidth === "full" ? "full" : "wide";
  return (
    <main
      className={joinClassNames("story-opening", "story-opening-feature", `story-opening-feature-${width}`, className)}
      data-opening="feature"
      data-site-navigation={resolveSiteNavigation(presentation)}
    >
      {slots.metadata}
      <div className="story-opening-zone" data-story-nav-zone>
        <ArticleShell as="div" className="story-opening-head-shell">
          <header className="story-opening-head">
            <OpeningKicker presentation={presentation} />
            <ArticleHeadline presentation={presentation} className="story-opening-headline" />
            <ArticleExcerpt presentation={presentation} className="story-opening-excerpt" />
            <ArticleAthleteMeta presentation={presentation} />
            <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
          </header>
        </ArticleShell>
        {image ? (
          <figure className="story-opening-figure">
            <div className="story-opening-media">
              <OpeningImage image={image} />
            </div>
            <figcaption className="story-opening-caption byline-article-view">
              <ArticleImageCaption image={image} />
            </figcaption>
          </figure>
        ) : null}
      </div>
      <OpeningContinuation presentation={presentation} slots={slots} />
    </main>
  );
}

/**
 * Split: a newspaper feature opening. On a wide screen the photograph takes
 * slightly more than half the first screen and the headline package the rest;
 * below that the two are deliberately stacked (headline package, then an
 * edge-to-edge photograph) rather than squeezed into narrow columns. The DOM
 * order is always the headline package first, then the photograph; the image
 * side only changes the visual order on wide screens.
 */
export function SplitArticleView({ presentation, slots = {}, className }: ArticleViewProps): ReactNode {
  const image = presentation.image;
  const side = presentation.splitImageSide === "left" ? "left" : "right";
  return (
    <main
      className={joinClassNames("story-opening", "story-opening-split", `story-opening-split-${side}`, className)}
      data-opening="split"
      data-site-navigation={resolveSiteNavigation(presentation)}
    >
      {slots.metadata}
      <div className="story-opening-zone story-opening-split-grid" data-story-nav-zone>
        <header className="story-opening-split-text byline-article-view">
          <div className="story-opening-split-copy">
            <OpeningKicker presentation={presentation} />
            <ArticleHeadline presentation={presentation} className="story-opening-headline" />
            <ArticleExcerpt presentation={presentation} className="story-opening-excerpt" />
            <ArticleAthleteMeta presentation={presentation} />
            <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
          </div>
        </header>
        {image ? (
          <figure className="story-opening-split-figure">
            <div className="story-opening-media">
              <OpeningImage image={image} />
            </div>
            <figcaption className="story-opening-caption byline-article-view">
              <ArticleImageCaption image={image} />
            </figcaption>
          </figure>
        ) : null}
      </div>
      <OpeningContinuation presentation={presentation} slots={slots} />
    </main>
  );
}
