#!/usr/bin/env node
// Scaffolds a repository-defined story presentation and registers it.
//
//   npm run story-presentation -- create <wordpress-post-id> <kebab-case-name>
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
  return Boolean(match && new RegExp(`^\\s*${id}\\s*:`, "m").test(match[2]));
}

export async function createStoryPresentation({ id, name, root = path.resolve(here, "..") }) {
  if (!/^[1-9]\d*$/.test(String(id))) throw new Error(`The post id must be a positive WordPress post ID, got "${id}".`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? "")) throw new Error(`The name must be kebab-case (letters, digits, hyphens), got "${name ?? ""}".`);
  const base = path.join(root, "apps/web/story-presentations");
  const registryPath = path.join(base, "registry.ts");
  const directory = path.join(base, "stories", name);
  const registry = await readFile(registryPath, "utf8");
  if (existsSync(directory)) throw new Error(`stories/${name}/ already exists.`);
  if (registryHasId(registry, id)) throw new Error(`Post ${id} already has a presentation in registry.ts.`);

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.tsx"), indexSource({ id, name }));
  await writeFile(path.join(directory, "styles.css"), stylesSource({ id, name }));

  const updated = registerInSource(registry, { id, name });
  if (updated) await writeFile(registryPath, updated);
  return { directory, registered: Boolean(updated), importLine: `import ${componentName(name)} from "./stories/${name}";`, entryLine: `${id}: ${componentName(name)},` };
}

async function main(argv) {
  const [command, id, name] = argv;
  if (command !== "create" || !id || !name) {
    console.error("Usage: npm run story-presentation -- create <wordpress-post-id> <kebab-case-name>");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await createStoryPresentation({ id, name });
    console.log(`Created apps/web/story-presentations/stories/${name}/ (index.tsx, styles.css).`);
    if (result.registered) console.log(`Registered post ${id} in apps/web/story-presentations/registry.ts.`);
    else console.log(`Could not edit registry.ts automatically. Add these lines to it:\n  ${result.importLine}\n  ${result.entryLine}  (inside storyPresentations)`);
    console.log("Next: edit the layout and styles; do not add story copy. See docs/custom-story-presentations.md.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
