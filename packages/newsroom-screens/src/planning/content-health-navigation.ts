import type { ContentHealthFixTarget, ContentHealthIssue } from "./planning-model";

export const CONTENT_HEALTH_FIX_TARGET_QUERY_PARAM = "byline_content_health_target";

/**
 * Keep legacy fixUrl values byte-for-byte intact when no structured target is
 * present. Structured targets are private navigation hints, not edit commands.
 */
export function contentHealthFixHref(issue: Pick<ContentHealthIssue, "fixUrl" | "story" | "fixTarget">): string | null {
  const target = issue.fixTarget;
  if (target?.kind === "settings") return target.url;

  const base = issue.fixUrl || issue.story?.editUrl || null;
  if (!base || !target) return base;

  const hashIndex = base.indexOf("#");
  const beforeHash = hashIndex === -1 ? base : base.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : base.slice(hashIndex);
  const separator = beforeHash.includes("?") ? (beforeHash.endsWith("?") || beforeHash.endsWith("&") ? "" : "&") : "?";
  const encodedTarget = encodeURIComponent(JSON.stringify(target));
  return `${beforeHash}${separator}${encodeURIComponent(CONTENT_HEALTH_FIX_TARGET_QUERY_PARAM)}=${encodedTarget}${hash}`;
}

/** Keep this type alias close to the URL helper for callers building links. */
export type ContentHealthNavigationTarget = ContentHealthFixTarget;
