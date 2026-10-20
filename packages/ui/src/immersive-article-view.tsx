import type { ReactNode } from "react";
import {
  ArticleView,
  ArticleAthleteMeta,
  ArticleBody,
  ArticleCategory,
  ArticleExcerpt,
  ArticleHeadline,
  ArticleImageCaption,
  ArticleMeta,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter,
  type ArticleViewProps
} from "./article-view";
import { HeroReveal, HeroRevealContent } from "./HeroReveal";

const SURFACE_ID = "immersive-article-surface";

/**
 * The article an author gets by choosing Immersive in WordPress: the featured
 * image fills the first screen under the site header with the category,
 * headline and deck over it, and the article rises over the pinned photograph.
 * It is `ArticleView` rearranged with the same primitives, so every word, the
 * body, corrections, slots and the standard ending still come from WordPress.
 *
 * The only choice is the headline position (`presentation.immersiveAlignment`):
 * bottom-left (default) or centered. A story with no featured image has nothing
 * to open on, so the caller renders the normal `ArticleView` instead.
 */
export function ImmersiveArticleView({ presentation, slots = {}, className }: ArticleViewProps): ReactNode {
  const image = presentation.image;
  const centered = presentation.immersiveAlignment === "center";
  const rootClassName = ["immersive-article", centered ? "immersive-article-center" : "immersive-article-bottom-left", className].filter(Boolean).join(" ");

  return (
    <main className={rootClassName}>
      {slots.metadata}
      <HeroReveal
        target={SURFACE_ID}
        align={centered ? "center" : "end"}
        scrim={0.5}
        className="immersive-article-hero"
        image={image?.src ? { ...image, sizes: "100vw" } : null}
      >
        <ArticleCategory presentation={presentation} className="immersive-article-category" />
        <ArticleHeadline presentation={presentation} className="immersive-article-headline" />
        <ArticleExcerpt presentation={presentation} className="immersive-article-excerpt" />
      </HeroReveal>

      <HeroRevealContent id={SURFACE_ID} className="immersive-article-surface">
        <ArticleShell as="div">
          <article className="article-story">
            <div className="immersive-article-meta">
              <ArticleAthleteMeta presentation={presentation} />
              <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
              {image ? (
                <div className="immersive-article-caption" role="group" aria-label="Lead photograph caption and credit">
                  <ArticleImageCaption image={image} />
                </div>
              ) : null}
            </div>
            <ArticleBody presentation={presentation} primaryGame={slots.primaryGame} />
            <ArticleStoryFooter presentation={presentation} slots={slots} />
          </article>
          <ArticleStandardEnding presentation={presentation} />
        </ArticleShell>
      </HeroRevealContent>
    </main>
  );
}

/**
 * Whether an article is shown with the Immersive opening. The author's choice
 * only applies when the story has a featured image to open on; otherwise it is
 * a standard story. The public routes and the private Preview as Byline both
 * ask this, so they cannot disagree.
 */
export function usesImmersivePresentation(presentation: Pick<ArticleViewProps["presentation"], "storyPresentation" | "image">): boolean {
  return presentation.storyPresentation === "immersive" && Boolean(presentation.image?.src);
}

/** The article the author chose in WordPress: Immersive, or the normal `ArticleView`. */
export function PresentedArticleView(props: ArticleViewProps): ReactNode {
  return usesImmersivePresentation(props.presentation) ? <ImmersiveArticleView {...props} /> : <ArticleView {...props} />;
}
