import type { DataPresentationDescriptor } from "@byline/data";
import fixtureSidewalkProject from "./presentations/fixture-sidewalk-project";
import type { DataPresentationDefinition } from "./sdk";
import ranking from "./templates/ranking";
import table from "./templates/table";
import timeline from "./templates/timeline";

/**
 * Byline Data presentations, by stable key.
 *
 *   templates/<key>/      reusable templates, chosen in the newsroom
 *   presentations/<key>/  one project's repository-coded presentation
 *
 * Each folder holds `index.tsx` (the definition, default export), and
 * optionally `styles.css` and `client.ts`, which each host loads only on a
 * page that uses that presentation. Scaffold one with
 * `npm run data-presentation -- create <key>` (see docs/byline-data.md).
 */

/** The built-in templates: the same contract a developer's template uses. */
export const dataTemplates: readonly DataPresentationDefinition[] = [table, ranking, timeline];

/** Production one-off presentations. Empty until a project needs one; do not add one merely to populate it. */
export const dataPresentations: readonly DataPresentationDefinition[] = [];

/** Test and development only. Hosts opt in explicitly (`fixtures: true`), so production can never use them. */
export const fixtureDataPresentations: readonly DataPresentationDefinition[] = [fixtureSidewalkProject];

export type DataPresentationRegistry = Readonly<Record<string, DataPresentationDefinition>>;

/** A registry from definitions: duplicate keys and a fixture outside fixture mode are refused. */
export function createDataPresentationRegistry(definitions: readonly DataPresentationDefinition[], { fixtures = false }: { fixtures?: boolean } = {}): DataPresentationRegistry {
  const registry: Record<string, DataPresentationDefinition> = {};
  for (const definition of definitions) {
    const { key, fixture } = definition.descriptor;
    if (Object.hasOwn(registry, key)) throw new Error(`Two Data presentations use the key "${key}".`);
    if (fixture && !fixtures) throw new Error(`The fixture Data presentation "${key}" can't be registered outside fixture mode.`);
    registry[key] = definition;
  }
  return Object.freeze(registry);
}

export function dataPresentationRegistry({ fixtures = false }: { fixtures?: boolean } = {}): DataPresentationRegistry {
  return createDataPresentationRegistry([...dataTemplates, ...dataPresentations, ...(fixtures ? fixtureDataPresentations : [])], { fixtures });
}

/** The registry as plain data (never components, styles or client code), for the newsroom and snapshot validation. */
export function describeDataPresentations(registry: DataPresentationRegistry): DataPresentationDescriptor[] {
  return Object.values(registry).map((definition) => structuredClone(definition.descriptor));
}

/** Where a presentation's folder is, relative to this package's `src`: how hosts find `styles.css` and `client.ts`. */
export function dataPresentationFolder(descriptor: Pick<DataPresentationDescriptor, "key" | "kind">): string {
  return `${descriptor.kind === "template" ? "templates" : "presentations"}/${descriptor.key}`;
}
