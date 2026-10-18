import type { ReactNode } from "react";

/**
 * Prints a story's stylesheet with that story only. Import the CSS with
 * `?inline` so it never joins the sitewide bundle that every article loads.
 */
export function StoryStyles({ id, css }: { id: string; css: string }): ReactNode {
  return <style data-story-presentation={id} dangerouslySetInnerHTML={{ __html: css }} />;
}
