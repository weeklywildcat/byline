#!/usr/bin/env node
// Scaffolds a repository tracker and registers it.
//
//   npm run tracker -- create <kebab-case-key>
//   npm run tracker -- create <kebab-case-key> --client
//
// A tracker's content, data and design live in its folder and change with a
// deploy; an article stores only its key, title and text alternative. --client
// adds an optional progressive enhancement (client.ts).
//
// See docs/newsroom-blocks.md ("Repository Tracker").
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_BLOCK = /(export const repositoryTrackers: RepositoryTrackerRegistry = \{)([\s\S]*?)(\};)/;

export function trackerNames(key) {
  const pascal = key.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const component = /^[A-Za-z]/.test(pascal) ? pascal : `Tracker${pascal}`;
  return { component, constant: key.replace(/-/g, "_").toUpperCase().replace(/^(\d)/, "TRACKER_$1") };
}

export function dataSource({ key }) {
  return `/**
 * The data for the "${key}" tracker: typed, versioned with the code, never in
 * Payload. To update the tracker, edit this file and deploy.
 */
export type Milestone = { id: string; name: string; status: "done" | "underway" | "planned"; detail: string };

export const TRACKER = {
  /** The day this data was last checked (YYYY-MM-DD). */
  updated: "2026-01-01",
  milestones: [
    { id: "first", name: "First milestone", status: "done", detail: "Replace with the reporting." },
    { id: "second", name: "Second milestone", status: "underway", detail: "Replace with the reporting." },
    { id: "third", name: "Third milestone", status: "planned", detail: "Replace with the reporting." }
  ] satisfies Milestone[]
} as const;
`;
}

export function indexSource({ key, client }) {
  const { component, constant } = trackerNames(key);
  return `import type { RepositoryTracker } from "../types";
import { TRACKER, type Milestone } from "./data";

const STATUS: Record<Milestone["status"], string> = { done: "Done", underway: "Underway", planned: "Planned" };

/**
 * The "${key}" tracker, rendered on the server: complete and useful without
 * JavaScript.${client ? " client.ts only enhances it." : ""} The article supplies the title and the text
 * alternative; never type story copy (headline, byline) here.
 * Guide: docs/newsroom-blocks.md ("Repository Tracker").
 */
export function ${component}({ title }: { title: string; description: string }) {
  const done = TRACKER.milestones.filter((milestone) => milestone.status === "done").length;
  return (
    <div className="tracker-${key}">
      <p className="tracker-${key}-progress"><strong>{done} of {TRACKER.milestones.length} done</strong> · Updated <time dateTime={TRACKER.updated}>{TRACKER.updated}</time></p>
      <ol aria-label={\`\${title}: milestones\`}>
        {TRACKER.milestones.map((milestone) => (
          <li key={milestone.id} data-status={milestone.status}>
            <span className="tracker-${key}-status">{STATUS[milestone.status]}</span>
            <span className="tracker-${key}-name">{milestone.name}</span>
            <span className="tracker-${key}-detail">{milestone.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const ${constant}: RepositoryTracker = {
  key: "${key}",
  name: "${key.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase())}",
  description: "Describe in one sentence what this tracker follows.",
  Fallback: ${component},
  client: ${client},
  styles: true
};
`;
}

export function stylesSource({ key }) {
  return `/* The "${key}" tracker. Loaded only on stories that place it. Keep every selector under .tracker-${key}. Hairlines and type, no boxes. */
.tracker-${key} { font-family: var(--font-ui, system-ui, sans-serif); font-size: .95rem; }
.tracker-${key} ol { list-style: none; margin: 0; padding: 0; }
.tracker-${key} li { border-block-start: 1px solid var(--rule, #e2e2e2); display: grid; gap: .15rem 1rem; grid-template-columns: 6rem minmax(0, 1fr); margin: 0; padding-block: .6rem; }
.tracker-${key}-status { color: var(--muted, #545454); font-size: .72rem; font-weight: 700; grid-row: span 2; letter-spacing: .08em; text-transform: uppercase; }
.tracker-${key}-name { font-weight: 600; }
.tracker-${key}-detail { color: var(--muted, #545454); font-family: var(--font-serif, Georgia, serif); }
`;
}

export function clientSource({ key }) {
  return `import type { RepositoryTrackerClient } from "../types";

/** Progressive enhancement for the "${key}" tracker. Return a cleanup that restores the server-rendered markup. */
const enhance: RepositoryTrackerClient = (root) => {
  const host = root.querySelector<HTMLElement>(".tracker-${key}");
  if (!host || host.dataset.enhanced === "true") return;
  host.dataset.enhanced = "true";
  return () => {
    delete host.dataset.enhanced;
  };
};

export default enhance;
`;
}

/** Adds the import and the \`"key": CONSTANT\` line. Returns null when the registry has an unexpected shape. */
export function registerInSource(source, { key }) {
  const { constant } = trackerNames(key);
  if (!REGISTRY_BLOCK.test(source)) return null;
  const importLine = `import { ${constant} } from "./${key}";`;
  const imports = [...source.matchAll(/^import .*;$/gm)];
  const last = imports.at(-1);
  if (!last) return null;
  const withImport = source.slice(0, last.index + last[0].length) + `\n${importLine}` + source.slice(last.index + last[0].length);
  return withImport.replace(REGISTRY_BLOCK, (_all, open, body, close) => {
    const entries = body.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//")).map((line) => (line.endsWith(",") ? line : `${line},`));
    return `${open}\n${[...entries, `"${key}": ${constant},`].map((line) => `  ${line}`).join("\n")}\n${close}`;
  });
}

export function registryHasKey(source, key) {
  const match = REGISTRY_BLOCK.exec(source);
  return Boolean(match && match[2].split("\n").some((line) => line.trim().startsWith(`"${key}":`)));
}

export async function createRepositoryTracker({ key, client = false, root = path.resolve(here, "..") }) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key ?? "") || key.length > 64) throw new Error(`The key must be kebab-case (letters, digits, hyphens), at most 64 characters, got "${key ?? ""}".`);
  if (key.startsWith("fixture-")) throw new Error("Keys starting with fixture- are reserved for test fixtures.");
  const base = path.join(root, "packages/story-presentations/src/trackers");
  const registryPath = path.join(base, "registry.ts");
  const directory = path.join(base, key);
  const registry = await readFile(registryPath, "utf8");
  if (existsSync(directory)) throw new Error(`trackers/${key}/ already exists.`);
  if (registryHasKey(registry, key)) throw new Error(`Tracker ${key} is already registered.`);

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "data.ts"), dataSource({ key }));
  await writeFile(path.join(directory, "index.tsx"), indexSource({ key, client }));
  await writeFile(path.join(directory, "styles.css"), stylesSource({ key }));
  if (client) await writeFile(path.join(directory, "client.ts"), clientSource({ key }));

  const updated = registerInSource(registry, { key });
  if (updated) await writeFile(registryPath, updated);
  const { constant } = trackerNames(key);
  return { directory, registered: Boolean(updated), importLine: `import { ${constant} } from "./${key}";`, entryLine: `"${key}": ${constant},` };
}

async function main(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const [command, key] = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = flags.filter((flag) => flag !== "--client");
  if (command !== "create" || !key || unknown.length) {
    console.error("Usage: npm run tracker -- create <kebab-case-key> [--client]");
    process.exitCode = 1;
    return;
  }
  const client = flags.includes("--client");
  try {
    const result = await createRepositoryTracker({ key, client });
    console.log(`Created packages/story-presentations/src/trackers/${key}/ (data.ts, index.tsx, styles.css${client ? ", client.ts" : ""}).`);
    if (result.registered) console.log(`Registered "${key}" in packages/story-presentations/src/trackers/registry.ts.`);
    else console.log(`Could not edit registry.ts automatically. Add these lines to it:\n  ${result.importLine}\n  ${result.entryLine}  (inside repositoryTrackers)`);
    console.log("Next: put the tracker's data in data.ts and its design in index.tsx and styles.css. An editor then adds it to a story with the Repository Tracker block.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
