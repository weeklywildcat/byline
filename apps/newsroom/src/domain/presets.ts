import type { ProductionAssignment, Task } from "../payload-types";
import type { WorkflowStage } from "./vocabulary";

/**
 * New-story presets. They seed workflow, never content: a stage, a section,
 * a deadline offset (applied only for people who may set deadlines), starter
 * tasks, production assignments and, for video, the format. They never create
 * sources, interviews, appointments or article text, and the result is an
 * ordinary story.
 * (News, Sports recap, Opinion, Photo story, Breaking) plus Video story and
 * Investigation.
 */
export type StoryPreset = {
  id: string;
  label: string;
  /** Section slug; ignored if the newsroom has no such section. */
  section: string;
  workflow: { status: WorkflowStage; deadlineOffsetDays: number; deadlinePolicy: "relative" | "same-day" };
  format?: "standard" | "video" | "audio";
  tasks: Array<Pick<Task, "title">>;
  production: Array<Pick<ProductionAssignment, "title" | "type"> & { dueOffsetDays?: number }>;
  readiness: { policy: string; required: string[]; recommended: string[] };
  media: { mode: string; requireCredit: boolean; requireAltText: boolean };
};

export const STORY_PRESETS: readonly StoryPreset[] = [
  {
    id: "news",
    label: "News",
    section: "news",
    workflow: { status: "reporting", deadlineOffsetDays: 3, deadlinePolicy: "relative" },
    tasks: [{ title: "Interview sources" }, { title: "Verify names and details" }, { title: "Self-edit draft" }],
    production: [],
    readiness: { policy: "normal", required: ["headline", "writer", "section"], recommended: ["featured-image"] },
    media: { mode: "recommended", requireCredit: false, requireAltText: false }
  },
  {
    id: "sports-recap",
    label: "Sports recap",
    section: "sports",
    workflow: { status: "writing", deadlineOffsetDays: 1, deadlinePolicy: "relative" },
    tasks: [{ title: "Confirm score and stats" }, { title: "File recap" }],
    production: [],
    readiness: { policy: "sports", required: ["headline", "writer", "section"], recommended: ["score", "featured-image"] },
    media: { mode: "requested", requireCredit: true, requireAltText: true }
  },
  {
    id: "opinion",
    label: "Opinion",
    section: "opinion",
    workflow: { status: "writing", deadlineOffsetDays: 5, deadlinePolicy: "relative" },
    tasks: [],
    production: [],
    readiness: { policy: "opinion", required: ["headline", "writer", "section", "contributor-profile"], recommended: [] },
    media: { mode: "recommended", requireCredit: false, requireAltText: false }
  },
  {
    id: "photo-story",
    label: "Photo story",
    section: "photo",
    workflow: { status: "reporting", deadlineOffsetDays: 3, deadlinePolicy: "relative" },
    tasks: [],
    production: [{ title: "Photo assignment", type: "photo", dueOffsetDays: 2 }],
    readiness: { policy: "visual", required: ["headline", "writer", "section"], recommended: ["image-alt", "image-credit"] },
    media: { mode: "visual-first", requireCredit: true, requireAltText: true }
  },
  {
    id: "video-story",
    label: "Video story",
    section: "news",
    format: "video",
    workflow: { status: "reporting", deadlineOffsetDays: 5, deadlinePolicy: "relative" },
    tasks: [{ title: "Add the YouTube link" }],
    production: [{ title: "Video", type: "video", dueOffsetDays: 4 }],
    readiness: { policy: "video", required: ["headline", "writer", "section", "primary-video"], recommended: ["featured-image"] },
    media: { mode: "recommended", requireCredit: false, requireAltText: false }
  },
  {
    id: "investigation",
    label: "Investigation",
    section: "news",
    workflow: { status: "reporting", deadlineOffsetDays: 21, deadlinePolicy: "relative" },
    tasks: [{ title: "Gather and file documents" }, { title: "Fact-check every claim" }, { title: "Editor and adviser review" }],
    production: [],
    readiness: { policy: "normal", required: ["headline", "writer", "section"], recommended: ["featured-image"] },
    media: { mode: "recommended", requireCredit: true, requireAltText: true }
  },
  {
    id: "breaking",
    label: "Breaking",
    section: "news",
    workflow: { status: "reporting", deadlineOffsetDays: 0, deadlinePolicy: "same-day" },
    tasks: [],
    production: [],
    readiness: { policy: "minimum", required: ["headline", "writer", "section"], recommended: ["featured-image"] },
    media: { mode: "recommended", requireCredit: false, requireAltText: false }
  }
];

export function findPreset(id: unknown): StoryPreset | null {
  return STORY_PRESETS.find((preset) => preset.id === id) ?? null;
}
