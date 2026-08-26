import { parsePublishedBylineDesign, type PublishedBylineDesign } from "@byline/design";

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

