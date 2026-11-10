import { dataPresentationRegistry, describeDataPresentations, type DataPresentationRegistry } from "@byline/data-presentations/registry";

/**
 * The Data presentations this server knows: the repository's templates and
 * custom presentations, plus the fixtures only in development with
 * `BYLINE_STORY_PRESENTATION_FIXTURES=1` (the same rule as fixture
 * interactives and trackers). Production can never bind or publish a fixture.
 */
export const dataFixturesEnabled = () => process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production";

let cached: { fixtures: boolean; registry: DataPresentationRegistry } | null = null;
export function dataPresentationsForServer(): DataPresentationRegistry {
  const fixtures = dataFixturesEnabled();
  if (!cached || cached.fixtures !== fixtures) cached = { fixtures, registry: dataPresentationRegistry({ fixtures }) };
  return cached.registry;
}

export const dataPresentationDescriptor = (key: string) => {
  const registry = dataPresentationsForServer();
  return Object.hasOwn(registry, key) ? registry[key].descriptor : undefined;
};

export const describeServerDataPresentations = () => describeDataPresentations(dataPresentationsForServer());
