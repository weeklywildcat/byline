import { parseYouTubeVideoId } from "@byline/core";

export type ReadinessLine = { path: string; message: string; level: "error" | "warning" };

export function editorialReadiness(story: { headline?: unknown; section?: unknown; contributors?: unknown; format?: unknown; videoUrl?: unknown }): ReadinessLine[] {
  const lines: ReadinessLine[] = [];
  if (typeof story.headline !== "string" || !story.headline.trim()) lines.push({ path: "headline", message: "Add a headline.", level: "error" });
  if (!story.section) lines.push({ path: "section", message: "Choose a Section.", level: "error" });
  if (story.format === "video" && !parseYouTubeVideoId(typeof story.videoUrl === "string" ? story.videoUrl : "")) {
    lines.push({ path: "video.url", message: "Add a valid YouTube URL for this video story.", level: "error" });
  }
  if (!Array.isArray(story.contributors) || !story.contributors.length) lines.push({ path: "contributors", message: "This story has no byline.", level: "warning" });
  return lines;
}
