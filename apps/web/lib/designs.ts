import {
  parsePublishedBylineDesign,
  resolvePublishedDesignToV2,
  type PublishedBylineDesign,
  type ResolvedPublishedDesign
} from "@byline/design";

function configuredDesigns(): Record<string, unknown> {
  if (!process.env.BYLINE_DESIGNS_JSON) return {};
  try {
    const value = JSON.parse(process.env.BYLINE_DESIGNS_JSON);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error("BYLINE_DESIGNS_JSON is not valid JSON.");
  }
}

const designs = configuredDesigns();

export function getPublishedDesign(template: string): PublishedBylineDesign | null {
  if (!(template in designs)) return null;
  return parsePublishedBylineDesign(designs[template], template);
}

/**
 * The canonical way to obtain a renderable design.
 *
 * Every published design reaches the renderers through here, whatever schema it
 * was stored as: BYLINE_DESIGNS_JSON is populated from /byline/v1/design/<template>
 * by the build wrapper, parsed by schema version, and normalised to v2. There is
 * no separate per-template environment variable.
 *
 * Returns null only when the publication has published nothing for this
 * template. A design that exists but cannot be parsed throws, because silently
 * rendering something other than what was published is exactly the failure this
 * pass exists to remove.
 */
export function getPublishedDesignV2(template: string): ResolvedPublishedDesign | null {
  const published = getPublishedDesign(template);

  if (!published) return null;

  const resolved = resolvePublishedDesignToV2(published, template);

  if (resolved.migrationWarnings.length) {
    console.warn(
      `[byline] published ${template} design was migrated from schema 1 on read:\n  ${resolved.migrationWarnings.join("\n  ")}`
    );
  }

  return resolved;
}
