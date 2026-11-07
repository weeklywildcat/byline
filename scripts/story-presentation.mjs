#!/usr/bin/env node
// Scaffolds a repository-defined story presentation and registers it.
//
//   npm run story-presentation -- create <wordpress-post-id> <kebab-case-name>
//   npm run story-presentation -- create <wordpress-post-id> <kebab-case-name> --visual
//
// --visual makes a flagship visual story: the narrative is written in the
// story folder and replaces the WordPress body. Without it, WordPress owns
// every word and the presentation only arranges it.
//
// See docs/custom-story-presentations.md.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_BLOCK = /(export const storyPresentations: StoryPresentationRegistry = \{)([\s\S]*?)(\n\};)/;

export function componentName(name) {
  const pascal = name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  return /^[A-Za-z]/.test(pascal) ? pascal : `Story${pascal}`;
}

export function indexSource({ id, name }) {
  const component = componentName(name);
  return `import {
  ArticleBody,
  ArticleCategory,
  ArticleExcerpt,
  ArticleHeadline,
  ArticleImageCaption,
  ArticleMeta,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter,
  HeroReveal,
  HeroRevealContent
} from "@byline/ui";
import { StoryStyles } from "../../StoryStyles";
import type { StoryPresentationProps } from "../../types";
import css from "./styles.css?inline";

const SURFACE_ID = "story-${name}-surface";

/**
 * Custom presentation for WordPress post ${id}. WordPress owns every word and
 * image: arrange \`presentation\` and \`slots\`, never type story copy here.
 * Delete the registry line in ../../registry.ts to return to the normal article.
 * Guide: docs/custom-story-presentations.md
 */
export default function ${component}({ presentation, slots }: StoryPresentationProps) {
  const image = presentation.image;
  return (
    <main className="story-${name}">
      <StoryStyles id="${name}" css={css} />
      <HeroReveal target={SURFACE_ID} align="end" scrim={0.5} image={image?.src ? { ...image, sizes: "100vw" } : null}>
        <ArticleCategory presentation={presentation} className="story-${name}-category" />
        <ArticleHeadline presentation={presentation} className="story-${name}-headline" />
        <ArticleExcerpt presentation={presentation} className="story-${name}-excerpt" />
      </HeroReveal>

      <HeroRevealContent id={SURFACE_ID} className="story-${name}-surface">
        <ArticleShell as="div">
          <article className="article-story">
            <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
            {image ? <div className="story-${name}-caption"><ArticleImageCaption image={image} /></div> : null}
            <ArticleBody presentation={presentation} primaryGame={slots.primaryGame} />
            <ArticleStoryFooter presentation={presentation} slots={slots} />
          </article>
          <ArticleStandardEnding presentation={presentation} />
        </ArticleShell>
      </HeroRevealContent>
    </main>
  );
}
`;
}

export function stylesSource({ id, name }) {
  return `/* Custom presentation for WordPress post ${id}. Keep every selector under .story-${name}. */
.story-${name} .hero-reveal-copy {
  gap: 14px;
}

.story-${name} .story-${name}-category {
  color: #fff;
  font-family: var(--font-ui);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.story-${name} .story-${name}-headline {
  color: #fff;
  font-family: var(--font-headline);
  font-size: clamp(2rem, 5.2vw, 4rem);
  font-weight: 600;
  line-height: 1.06;
  margin: 0;
  max-width: 18em;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.5);
  text-wrap: balance;
}

.story-${name} .story-${name}-excerpt {
  color: rgba(255, 255, 255, 0.92);
  font-family: var(--font-serif);
  font-size: clamp(1.05rem, 1.8vw, 1.35rem);
  line-height: 1.4;
  max-width: 34em;
}

.story-${name} .story-${name}-excerpt p {
  margin: 0;
}

.story-${name} .story-${name}-surface {
  min-height: 100svh;
}

.story-${name} .story-${name}-caption {
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.9rem;
  margin: 16px 0 28px;
}
`;
}

export function visualIndexSource({ id, name }) {
  const component = componentName(name);
  return `import {
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
import { StoryStyles } from "../../StoryStyles";
import { defineVisualStory, type StoryPresentationProps } from "../../types";
import css from "./styles.css?inline";

/**
 * Flagship visual story for WordPress post ${id}.
 *
 * The narrative below is this story's body: WordPress's body is not printed
 * here. Write the reporting as semantic JSX; it is rendered to static HTML at
 * build time, so every word is in the page without JavaScript. client.ts only
 * enhances it. A change to the narrative is a code change and a deploy.
 *
 * WordPress still owns the headline, deck, byline, dates, lead image,
 * corrections, topics and series: render them from \`presentation\`, never type
 * them here. Delete the registry line in ../../registry.ts to return the story
 * to its WordPress body.
 * Guide: docs/custom-story-presentations.md (Flagship visual stories)
 */

/** The data the graphic draws. Replace with the story's own. */
const DATA = [
  { label: "First", value: 32 },
  { label: "Second", value: 21 },
  { label: "Third", value: 12 }
];

/** One step per beat of the reporting; \`highlight\` is the bar the graphic emphasizes while it is read. */
const STEPS = [
  { highlight: 0, text: "Write the first beat of the reporting here. The graphic beside it emphasizes what this paragraph is about." },
  { highlight: 1, text: "Each step is ordinary text in the page, so it reads in order without JavaScript, with reduced motion and with a screen reader." },
  { highlight: 2, text: "client.ts moves the emphasis as each step reaches the reading line. Replace this chart with whatever the story needs." }
];

function Graphic() {
  const max = Math.max(...DATA.map((datum) => datum.value));
  return (
    <figure className="story-${name}-graphic">
      <svg viewBox="0 0 320 200" role="img" aria-labelledby="story-${name}-graphic-title">
        <title id="story-${name}-graphic-title">{DATA.map((datum) => \`\${datum.label}: \${datum.value}\`).join(", ")}</title>
        {DATA.map((datum, index) => {
          const height = (datum.value / max) * 160;
          return (
            <g key={datum.label} className="story-${name}-bar" data-index={index}>
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

function ${component}({ presentation, slots }: StoryPresentationProps) {
  return (
    <ArticleShell className="story-${name}">
      <StoryStyles id="${name}" css={css} />
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

        {/* The narrative. \`article-body\` gives it the article's prose, figure and wide/full layout styles. */}
        <div className="article-body story-${name}-narrative">
          <p>Open with the reporting. This paragraph and everything in this narrative replace the WordPress body on this page.</p>
          <section className="alignwide story-${name}-sequence">
            <div className="story-${name}-stage"><Graphic /></div>
            <div className="story-${name}-steps">
              {STEPS.map((step, index) => (
                <div key={index} className="story-${name}-step" data-highlight={step.highlight}>
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

export default defineVisualStory({ name: "${name}", Component: ${component} });
`;
}

export function visualStylesSource({ id, name }) {
  return `/* Flagship visual story for WordPress post ${id}. Keep every selector under .story-${name}. */
.story-${name} .story-${name}-sequence {
  /* Where the graphic sticks: clear of the site header. */
  --story-${name}-top: 76px;
}
.story-${name} .story-${name}-graphic {
  margin: 0;
}
.story-${name} .story-${name}-graphic svg {
  display: block;
  height: auto;
  max-height: calc(100svh - var(--story-${name}-top) - 6rem);
  width: 100%;
}
.story-${name} .story-${name}-bar rect {
  fill: var(--rule, #d6d6d6);
  transition: fill var(--story-motion, 160ms ease-out);
}
.story-${name} .story-${name}-bar text {
  fill: var(--muted, #545454);
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: 12px;
}
.story-${name} .story-${name}-bar.is-highlighted rect {
  fill: var(--accent, #73192a);
}
.story-${name} .story-${name}-step p {
  margin: 0;
}
.story-${name} .story-${name}-step + .story-${name}-step {
  margin-top: 1.25em;
}

/* Enhanced (client.ts ran): the graphic stays in view while the steps scroll past it.
   Without JavaScript the sequence stays a graphic followed by its steps. */
.story-${name} .story-${name}-sequence.is-enhanced .story-${name}-stage {
  background: var(--page, #fff);
  position: sticky;
  top: var(--story-${name}-top);
  z-index: 0;
}
.story-${name} .story-${name}-sequence.is-enhanced .story-${name}-steps {
  position: relative;
  z-index: 1;
}
.story-${name} .story-${name}-sequence.is-enhanced .story-${name}-step {
  background: var(--page, #fff);
  border: 1px solid var(--rule, #e2e2e2);
  margin: 0 0 45svh;
  padding: 1rem 1.25rem;
}
.story-${name} .story-${name}-sequence.is-enhanced .story-${name}-step:first-child {
  margin-top: 20svh;
}
.story-${name} .story-${name}-sequence.is-enhanced .story-${name}-step.is-active {
  border-color: var(--ink, #121212);
}

@media (min-width: 900px) {
  .story-${name} .story-${name}-sequence.is-enhanced {
    align-items: start;
    display: grid;
    gap: 3rem;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}
`;
}

export function visualClientSource({ id, name }) {
  return `import type { VisualStoryClient } from "../../types";

/**
 * Progressive enhancement for WordPress post ${id}'s narrative, loaded on this
 * story's page alone. The narrative is complete without it.
 *
 * A step is active while it covers a reading line 40% down the viewport,
 * watched by one IntersectionObserver. Ordinary scrolling only: never move the
 * reader's scroll position or listen to scroll events.
 */
const READING_LINE = 40;

const enhance: VisualStoryClient = (root) => {
  const sequence = root.querySelector<HTMLElement>(".story-${name}-sequence");
  const view = root.ownerDocument.defaultView;
  if (!sequence || !view?.IntersectionObserver) return;
  const steps = Array.from(sequence.querySelectorAll<HTMLElement>(".story-${name}-step"));
  const bars = Array.from(sequence.querySelectorAll<SVGGElement>(".story-${name}-bar"));
  const show = (index: number) => {
    const highlight = Number(steps[index]?.dataset.highlight);
    steps.forEach((step, i) => step.classList.toggle("is-active", i === index));
    bars.forEach((bar, i) => bar.classList.toggle("is-highlighted", i === highlight));
  };

  const observer = new view.IntersectionObserver((entries) => {
    const covering = entries.filter((entry) => entry.isIntersecting).map((entry) => steps.indexOf(entry.target as HTMLElement));
    if (covering.length) show(Math.max(...covering));
  }, { rootMargin: \`-\${READING_LINE}% 0px -\${100 - READING_LINE - 1}% 0px\` });
  steps.forEach((step) => observer.observe(step));
  sequence.classList.add("is-enhanced");
  show(0);
  return () => {
    observer.disconnect();
    sequence.classList.remove("is-enhanced");
  };
};

export default enhance;
`;
}

/** Adds the import and the \`id: Component\` line. Returns null when the registry has an unexpected shape. */
export function registerInSource(source, { id, name }) {
  const component = componentName(name);
  const match = REGISTRY_BLOCK.exec(source);
  if (!match) return null;
  const importLine = `import ${component} from "./stories/${name}";`;
  const imports = [...source.matchAll(/^import .*;$/gm)];
  const last = imports.at(-1);
  if (!last) return null;
  const withImport = source.slice(0, last.index + last[0].length) + `\n${importLine}` + source.slice(last.index + last[0].length);
  return withImport.replace(REGISTRY_BLOCK, (_all, open, body, close) => {
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    const entries = lines.filter((line) => !line.trim().startsWith("//"));
    const comments = lines.filter((line) => line.trim().startsWith("//"));
    const normalized = entries.map((line) => (line.trimEnd().endsWith(",") ? line.trimEnd() : `${line.trimEnd()},`));
    return `${open}\n${[...comments, ...normalized, `  ${id}: ${component},`].join("\n")}${close}`;
  });
}

export function registryHasId(source, id) {
  const match = REGISTRY_BLOCK.exec(source);
  if (!match) return false;
  // Compare parsed numbers; never build a pattern from the id.
  const wanted = Number(id);
  return match[2].split("\n").some((line) => {
    const entry = /^\s*(\d+)\s*:/.exec(line);
    return entry !== null && Number(entry[1]) === wanted;
  });
}

export async function createStoryPresentation({ id, name, visual = false, root = path.resolve(here, "..") }) {
  if (!/^[1-9]\d*$/.test(String(id))) throw new Error(`The post id must be a positive WordPress post ID, got "${id}".`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? "")) throw new Error(`The name must be kebab-case (letters, digits, hyphens), got "${name ?? ""}".`);
  const base = path.join(root, "apps/web/story-presentations");
  const registryPath = path.join(base, "registry.ts");
  const directory = path.join(base, "stories", name);
  const registry = await readFile(registryPath, "utf8");
  if (existsSync(directory)) throw new Error(`stories/${name}/ already exists.`);
  if (registryHasId(registry, id)) throw new Error(`Post ${id} already has a presentation in registry.ts.`);

  await mkdir(directory, { recursive: true });
  if (visual) {
    await writeFile(path.join(directory, "index.tsx"), visualIndexSource({ id, name }));
    await writeFile(path.join(directory, "styles.css"), visualStylesSource({ id, name }));
    await writeFile(path.join(directory, "client.ts"), visualClientSource({ id, name }));
  } else {
    await writeFile(path.join(directory, "index.tsx"), indexSource({ id, name }));
    await writeFile(path.join(directory, "styles.css"), stylesSource({ id, name }));
  }

  const updated = registerInSource(registry, { id, name });
  if (updated) await writeFile(registryPath, updated);
  return { directory, registered: Boolean(updated), importLine: `import ${componentName(name)} from "./stories/${name}";`, entryLine: `${id}: ${componentName(name)},` };
}

async function main(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const [command, id, name] = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = flags.filter((flag) => flag !== "--visual");
  if (command !== "create" || !id || !name || unknown.length) {
    console.error("Usage: npm run story-presentation -- create <wordpress-post-id> <kebab-case-name> [--visual]");
    process.exitCode = 1;
    return;
  }
  const visual = flags.includes("--visual");
  try {
    const result = await createStoryPresentation({ id, name, visual });
    console.log(`Created apps/web/story-presentations/stories/${name}/ (${visual ? "index.tsx, styles.css, client.ts" : "index.tsx, styles.css"}).`);
    if (result.registered) console.log(`Registered post ${id} in apps/web/story-presentations/registry.ts.`);
    else console.log(`Could not edit registry.ts automatically. Add these lines to it:\n  ${result.importLine}\n  ${result.entryLine}  (inside storyPresentations)`);
    console.log(visual
      ? "Next: write the narrative in index.tsx (it replaces the WordPress body on this story's page) and its behavior in client.ts. See docs/custom-story-presentations.md."
      : "Next: edit the layout and styles; do not add story copy. See docs/custom-story-presentations.md.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
