#!/usr/bin/env node
// Scaffolds a Byline Data presentation and registers it.
//
//   npm run data-presentation -- create <kebab-case-key>              one project's custom presentation
//   npm run data-presentation -- create <kebab-case-key> --template   a reusable template editors can choose
//   add --client for an optional progressive enhancement (client.ts)
//
// The facts come from newsroom datasets through published releases: there is
// no data.ts. The presentation declares the datasets (slots) and fields
// (roles) it reads; a Data Project binds them in the newsroom.
//
// See docs/byline-data.md.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function presentationNames(key) {
  const pascal = key.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const component = /^[A-Za-z]/.test(pascal) ? pascal : `Data${pascal}`;
  return { component, binding: component.charAt(0).toLowerCase() + component.slice(1) };
}

export function indexSource({ key, template, client }) {
  const { component } = presentationNames(key);
  const define = template ? "defineDataTemplate" : "defineDataPresentation";
  const title = key.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());
  return `import { ${define}, field, setting, slot, type DataPresentationProps, type PrepareInput } from "../../sdk";

/**
 * The "${key}" ${template ? "template" : "presentation"}. Reporters and editors keep the facts in a
 * newsroom dataset; a Data Project binds that dataset to the slot and roles
 * below, and this code renders whatever was last published. Never type the
 * reporting here.
 *
 * Server-rendered HTML must be complete and useful without JavaScript.${client ? " client.ts\n * only enhances it." : ""}
 * Guide: docs/byline-data.md.
 */
const datasets = {
  items: slot({
    label: "Items",
    description: "One row per item.",
    fields: {
      name: field.text({ label: "Name" }),
      value: field.number({ label: "Value", optional: true })
    }
  })
};

const settings = {
  showTotal: setting.boolean({ label: "Show the total", default: true })
};

type Settings = { showTotal: boolean };
type Model = { total: number; items: Array<{ id: string; name: string; value: string }> };

/** Deterministic, build-time only: derive what the page needs from the bound release. */
function prepare({ data, format }: PrepareInput<typeof datasets, Settings>): Model {
  const { items } = data;
  return {
    total: items.records.reduce((sum, record) => sum + (record.roles.value === null ? 0 : Number(record.roles.value)), 0),
    items: items.records.map((record) => ({ id: record.id, name: format.value(items.roles.name, record.roles.name), value: format.value(items.roles.value, record.roles.value) }))
  };
}

// If this renders headings, never hard-code the level: the same presentation sits under a page <h1> and under a Story's <h2>.
// Use headingLevel with headingTag (import it from "../../sdk"): const Title = headingTag(headingLevel); then headingTag(headingLevel, 1) below it.
function ${component}({ project, model, format }: DataPresentationProps<typeof datasets, Settings, Model>) {
  return (
    <div className="${key}">
      {project.settings.showTotal ? <p className="${key}-total">Total: {format.value(null, model.total)}</p> : null}
      <ol className="${key}-list">
        {model.items.map((item) => (
          <li key={item.id}>
            <span className="${key}-name">{item.name}</span>
            {item.value ? <span className="${key}-value">{item.value}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default ${define}({
  key: "${key}",
  name: "${title}",
  description: "Describe in one sentence what this shows readers.",
  datasets,
  settings,
  styles: true,
  client: ${client},
  prepare,
  Component: ${component}
});
`;
}

export function stylesSource({ key }) {
  return `/* The "${key}" Data presentation. Loaded only on pages that use it. Keep every selector under .data-presentation-${key}. */
.data-presentation-${key} .${key} { font-family: var(--font-ui, system-ui, sans-serif); }
.data-presentation-${key} .${key}-list { list-style: none; margin: 0; padding: 0; }
.data-presentation-${key} .${key}-list li { border-block-start: 1px solid var(--rule, #e2e2e2); display: flex; gap: 1rem; justify-content: space-between; padding-block: 0.6rem; }
.data-presentation-${key} .${key}-name { font-weight: 600; }
.data-presentation-${key} .${key}-value { font-variant-numeric: tabular-nums; }
`;
}

export function clientSource({ key }) {
  return `import type { DataPresentationClient } from "../../sdk";

/**
 * Progressive enhancement for "${key}". \`root\` is the server-rendered
 * presentation; \`releases\` maps each slot to its immutable release JSON on
 * the public site (empty in the newsroom preview). Return a cleanup.
 */
const enhance: DataPresentationClient = (root) => {
  const host = root.querySelector<HTMLElement>(".${key}");
  if (!host || host.dataset.enhanced === "true") return;
  host.dataset.enhanced = "true";
  return () => {
    delete host.dataset.enhanced;
  };
};

export default enhance;
`;
}

const ARRAYS = {
  template: /(export const dataTemplates: readonly DataPresentationDefinition\[\] = \[)([^\]]*)(\];)/,
  custom: /(export const dataPresentations: readonly DataPresentationDefinition\[\] = \[)([^\]]*)(\];)/
};

/** Adds the import and the array entry. Returns null when the registry has an unexpected shape. */
export function registerInSource(source, { key, template }) {
  const { binding } = presentationNames(key);
  const pattern = ARRAYS[template ? "template" : "custom"];
  if (!pattern.test(source)) return null;
  const importLine = `import ${binding} from "./${template ? "templates" : "presentations"}/${key}";`;
  const imports = [...source.matchAll(/^import .*;$/gm)];
  const last = imports.at(-1);
  if (!last) return null;
  const withImport = source.slice(0, last.index + last[0].length) + `\n${importLine}` + source.slice(last.index + last[0].length);
  return withImport.replace(pattern, (_all, open, body, close) => {
    const entries = body.split(",").map((entry) => entry.trim()).filter(Boolean);
    return `${open}${[...entries, binding].join(", ")}${close}`;
  });
}

export function registryHasKey(source, key) {
  return source.includes(`/templates/${key}"`) || source.includes(`/presentations/${key}"`);
}

export async function createDataPresentation({ key, template = false, client = false, root = path.resolve(here, "..") }) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key ?? "") || key.length > 64) throw new Error(`The key must be kebab-case (letters, digits, hyphens), at most 64 characters, got "${key ?? ""}".`);
  if (key.startsWith("fixture-")) throw new Error("Keys starting with fixture- are reserved for test fixtures.");
  const base = path.join(root, "packages/data-presentations/src");
  const registryPath = path.join(base, "registry.ts");
  const folder = template ? "templates" : "presentations";
  const directory = path.join(base, folder, key);
  const registry = await readFile(registryPath, "utf8");
  if (existsSync(path.join(base, "templates", key)) || existsSync(path.join(base, "presentations", key))) throw new Error(`A Data presentation folder for ${key} already exists.`);
  if (registryHasKey(registry, key)) throw new Error(`Data presentation ${key} is already registered.`);

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.tsx"), indexSource({ key, template, client }));
  await writeFile(path.join(directory, "styles.css"), stylesSource({ key }));
  if (client) await writeFile(path.join(directory, "client.ts"), clientSource({ key }));

  const updated = registerInSource(registry, { key, template });
  if (updated) await writeFile(registryPath, updated);
  const { binding } = presentationNames(key);
  return { directory, folder, registered: Boolean(updated), importLine: `import ${binding} from "./${folder}/${key}";` };
}

async function main(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const [command, key] = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = flags.filter((flag) => flag !== "--client" && flag !== "--template");
  if (command !== "create" || !key || unknown.length) {
    console.error("Usage: npm run data-presentation -- create <kebab-case-key> [--template] [--client]");
    process.exitCode = 1;
    return;
  }
  const template = flags.includes("--template");
  const client = flags.includes("--client");
  try {
    const result = await createDataPresentation({ key, template, client });
    console.log(`Created packages/data-presentations/src/${result.folder}/${key}/ (index.tsx, styles.css${client ? ", client.ts" : ""}).`);
    if (result.registered) console.log(`Registered "${key}" in packages/data-presentations/src/registry.ts.`);
    else console.log(`Could not edit registry.ts automatically. Import it and add it to ${template ? "dataTemplates" : "dataPresentations"}:\n  ${result.importLine}`);
    console.log("Next: declare the datasets and fields it reads, design it in index.tsx and styles.css, then bind it to a dataset in the newsroom under Data → New project.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
