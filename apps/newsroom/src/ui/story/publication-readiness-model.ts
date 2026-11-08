import { mediaIdOf } from "@byline/editor/fields";
import { collectMediaUses } from "@byline/editor/normalize";

/**
 * The Media a Story's form publishes, as one stable string (`lead=12&ids=3,4`
 * with sorted IDs). The Story header derives it from Payload's own form state
 * with a selector, so typing text never changes it and never sends a request;
 * only adding, removing or swapping Media does. The server applies the same
 * rule (`publication-media/readiness.ts`, `storyMediaRequirements`).
 */
export function storyMediaReadinessQuery(input: { featuredMedia: unknown; body: unknown; contentFormat: unknown }): string {
  const lead = mediaIdOf(input.featuredMedia);
  const uses = input.contentFormat === "legacy-html" ? [] : collectMediaUses(input.body);
  const byId = new Map<number, boolean>();
  for (const use of uses) {
    const id = Number(use.id);
    if (!Number.isSafeInteger(id) || id <= 0 || id === Number(lead)) continue;
    // An asset may be used several times. It is exempt from asset-level alt only
    // when every use supplies story-specific alt text.
    byId.set(id, (byId.get(id) ?? true) && use.hasAltOverride);
  }
  const unique = [...byId.keys()].sort((a, b) => a - b);
  const alt = unique.filter((id) => byId.get(id) === true);
  const params = new URLSearchParams();
  if (lead !== null) params.set("lead", String(lead));
  if (unique.length) params.set("ids", unique.join(","));
  if (alt.length) params.set("alt", alt.join(","));
  return params.toString();
}

export type StoryMediaReadinessItem = {
  mediaId: number;
  filename: string | null;
  state: "ready" | "preparing" | "blocked";
  issues: Array<{ code: string; message: string }>;
  retryable: boolean;
};

export type StoryMediaReadiness = { ready: boolean; preparing: number; blocked: number; items: StoryMediaReadinessItem[] };

/** "Preparing 2 images…", or null when nothing is preparing. */
export function preparingLabel(report: StoryMediaReadiness | undefined): string | null {
  if (!report?.preparing) return null;
  return `Preparing ${report.preparing} ${report.preparing === 1 ? "file" : "files"} for publication…`;
}

/** Problems someone must fix, one line each: "marching-band.jpg · Publication file preparation failed". */
export function blockingLines(report: StoryMediaReadiness | undefined): Array<{ item: StoryMediaReadinessItem; text: string }> {
  if (!report) return [];
  return report.items.filter((item) => item.state === "blocked").map((item) => ({ item, text: `${item.filename ?? `Media ${item.mediaId}`} · ${item.issues.map((issue) => issue.message).join("; ")}` }));
}
