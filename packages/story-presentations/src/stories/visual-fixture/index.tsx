import {
  ArticleCategory,
  ArticleExcerpt,
  ArticleFeaturedImage,
  ArticleHeadline,
  ArticleMeta,
  ArticleSeriesLabel,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter
} from "@byline/ui";
import { defineVisualStory, type StoryPresentationProps } from "../../types";

/**
 * Flagship visual story for story 10.
 *
 * The narrative below is this story's body: the CMS body is not printed
 * here. Write the reporting as semantic JSX; it is rendered to static HTML at
 * build time, so every word is in the page without JavaScript. client.ts only
 * enhances it. A change to the narrative is a code change and a deploy.
 *
 * The CMS still owns the headline, deck, byline, dates, lead image,
 * corrections, topics and series: render them from `presentation`, never type
 * them here. Delete the registry line in ../../registry.ts to return the story
 * to its CMS body. Its stylesheet (styles.css) and client.ts are loaded by each
 * host's asset adapter, on this story only.
 * Guide: docs/custom-story-presentations.md (Flagship visual stories)
 */

/** The data the graphic draws. Replace with the story's own. */
const DATA = [
  { label: "First", value: 32 },
  { label: "Second", value: 21 },
  { label: "Third", value: 12 }
];

/** One step per beat of the reporting; `highlight` is the bar the graphic emphasizes while it is read. */
const STEPS = [
  { highlight: 0, text: "Write the first beat of the reporting here. The graphic beside it emphasizes what this paragraph is about." },
  { highlight: 1, text: "Each step is ordinary text in the page, so it reads in order without JavaScript, with reduced motion and with a screen reader." },
  { highlight: 2, text: "client.ts moves the emphasis as each step reaches the reading line. Replace this chart with whatever the story needs." }
];

function Graphic() {
  const max = Math.max(...DATA.map((datum) => datum.value));
  return (
    <figure className="story-visual-fixture-graphic">
      <svg viewBox="0 0 320 200" role="img" aria-labelledby="story-visual-fixture-graphic-title">
        <title id="story-visual-fixture-graphic-title">{DATA.map((datum) => `${datum.label}: ${datum.value}`).join(", ")}</title>
        {DATA.map((datum, index) => {
          const height = (datum.value / max) * 160;
          return (
            <g key={datum.label} className="story-visual-fixture-bar" data-index={index}>
              <rect x={20 + index * 100} y={176 - height} width={80} height={height} />
              <text x={60 + index * 100} y={194} textAnchor="middle">{datum.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>Source: name the source of the data.</figcaption>
    </figure>
  );
}

function VisualFixture({ presentation, slots }: StoryPresentationProps) {
  return (
    <ArticleShell className="story-visual-fixture">
      <article className="article-story">
        <header className="article-header">
          <div className="article-kicker">
            <ArticleCategory presentation={presentation} />
            <ArticleSeriesLabel presentation={presentation} />
          </div>
          <ArticleHeadline presentation={presentation} />
          <ArticleExcerpt presentation={presentation} />
          <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
          <ArticleFeaturedImage presentation={presentation} />
        </header>

        {/* The narrative. `article-body` gives it the article's prose, figure and wide/full layout styles. */}
        <div className="article-body story-visual-fixture-narrative">
          <p>Open with the reporting. This paragraph and everything in this narrative replace the CMS body on this page.</p>
          <section className="alignwide story-visual-fixture-sequence">
            <div className="story-visual-fixture-stage"><Graphic /></div>
            <div className="story-visual-fixture-steps">
              {STEPS.map((step, index) => (
                <div key={index} className="story-visual-fixture-step" data-highlight={step.highlight}>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </section>
          <p>Close with the reporting that follows the graphic.</p>
        </div>

        <ArticleStoryFooter presentation={presentation} slots={slots} />
      </article>
      <ArticleStandardEnding presentation={presentation} />
    </ArticleShell>
  );
}

export default defineVisualStory({ name: "visual-fixture", Component: VisualFixture });
