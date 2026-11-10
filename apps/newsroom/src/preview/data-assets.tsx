"use client";

import { startDataPresentation, type DataPresentationClient } from "@byline/data-presentations/client";
import { useEffect } from "react";

/**
 * The newsroom's (Next.js) host for a Data presentation's own assets: its
 * `styles.css` and optional `client.ts`, each a dynamic chunk requested only
 * when that presentation is previewed. The public site's Vite host is
 * apps/web/lib/data-presentation-host.tsx; the presentations are shared.
 */
type Folder = "templates" | "presentations";
const loadStyles = (folder: Folder, key: string) => import(`../../../../packages/data-presentations/src/${folder}/${key}/styles.css`);
const loadClient = (folder: Folder, key: string) => import(`../../../../packages/data-presentations/src/${folder}/${key}/client.ts`) as Promise<{ default: DataPresentationClient }>;

export function DataPreviewAssets({ presentation, kind, styles, client }: { presentation: string; kind: "template" | "custom"; styles: boolean; client: boolean }) {
  const folder: Folder = kind === "template" ? "templates" : "presentations";
  useEffect(() => {
    let live = true;
    let cleanup: (() => void) | undefined;
    const article = document.querySelector<HTMLElement>(`[data-data-presentation="${presentation}"]`);
    (styles ? loadStyles(folder, presentation).catch(() => undefined) : Promise.resolve())
      .then(() => (client && article && live ? startDataPresentation(article, (key) => loadClient(folder, key)) : undefined))
      .then((stop) => {
        if (live) cleanup = stop;
        else stop?.();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      cleanup?.();
    };
  }, [presentation, folder, styles, client]);
  return null;
}
