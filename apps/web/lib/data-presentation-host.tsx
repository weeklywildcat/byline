/// <reference types="vite/client" />
import type { ReactNode } from "react";
import type { DataPresentationHost } from "@byline/data-presentations";
import type { DataPresentationRegistry } from "@byline/data-presentations/registry";

/**
 * The public site's (Vite) host for a Data presentation's own stylesheet:
 * read at build time and printed beside the presentation, so a template's
 * or custom presentation's CSS reaches only the pages that use it and never
 * joins the sitewide bundle. The newsroom preview has its own Next.js host.
 */
const templateStyles = import.meta.glob<string>("../../../packages/data-presentations/src/templates/*/styles.css", { query: "?inline", import: "default", eager: true });
const customStyles = import.meta.glob<string>("../../../packages/data-presentations/src/presentations/*/styles.css", { query: "?inline", import: "default", eager: true });

export function dataPresentationStylesheet(kind: "template" | "custom", key: string): string | null {
  return kind === "template"
    ? templateStyles[`../../../packages/data-presentations/src/templates/${key}/styles.css`] ?? null
    : customStyles[`../../../packages/data-presentations/src/presentations/${key}/styles.css`] ?? null;
}

export function publicDataPresentationHost(registry: DataPresentationRegistry): DataPresentationHost {
  return {
    styles: (key): ReactNode => {
      const descriptor = registry[key]?.descriptor;
      const css = descriptor ? dataPresentationStylesheet(descriptor.kind, key) : null;
      return css ? <style data-data-presentation-styles={key} dangerouslySetInnerHTML={{ __html: css }} /> : null;
    }
  };
}
