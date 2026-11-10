/// <reference types="vite/client" />
import { startDataPresentation, type DataPresentationClient } from "@byline/data-presentations/client";

/**
 * The public site's loader for Data presentations' browser code. Each
 * `client.ts` is its own chunk, downloaded only on a page whose presentation
 * has one; the page is complete without it.
 */
const templates = import.meta.glob<{ default: DataPresentationClient }>("../../../packages/data-presentations/src/templates/*/client.ts");
const custom = import.meta.glob<{ default: DataPresentationClient }>("../../../packages/data-presentations/src/presentations/*/client.ts");

export function hasDataPresentationClient(kind: "template" | "custom", key: string): boolean {
  return Boolean(kind === "template" ? templates[`../../../packages/data-presentations/src/templates/${key}/client.ts`] : custom[`../../../packages/data-presentations/src/presentations/${key}/client.ts`]);
}

export function startPublicDataPresentation(article: HTMLElement) {
  const kind = article.dataset.dataPresentationKind === "custom" ? "custom" : "template";
  return startDataPresentation(article, (key) => (kind === "template" ? templates[`../../../packages/data-presentations/src/templates/${key}/client.ts`] : custom[`../../../packages/data-presentations/src/presentations/${key}/client.ts`])?.());
}
