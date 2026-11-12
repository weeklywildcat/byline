/**
 * Byline's newsroom vocabularies. Each domain keeps its own statuses on
 * purpose (docs/newsroom-os.md): a story's workflow,
 * a task, a production assignment, a source and an appointment never share one
 * "status" list, and none of them is the publication state.
 */

import { STORED_STAGES, type EffectivePhase, type StoredStage } from "@byline/newsroom-screens/story/lifecycle";

type Option<T extends string> = { readonly value: T; readonly label: string };

function options<T extends string>(entries: ReadonlyArray<readonly [T, string]>): ReadonlyArray<Option<T>> {
  return entries.map(([value, label]) => ({ value, label }));
}

export const ROLES = ["staff", "editor", "administrator"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_OPTIONS = options<Role>([
  ["staff", "Staff"],
  ["editor", "Editor"],
  ["administrator", "Administrator"]
]);

/**
 * Workflow stages. `published` is derived from Payload's `_status` and is
 * never stored or selected (docs/newsroom-os.md).
 */
export const WORKFLOW_STAGES = STORED_STAGES;
export type WorkflowStage = StoredStage;
export type EffectiveWorkflow = EffectivePhase;
/**
 * The stored values, labelled by the phase each one reads as
 * (packages/newsroom-screens/src/story/lifecycle.ts). `assigned` is legacy:
 * it reads as Reporting and is never written again.
 */
export const WORKFLOW_OPTIONS = options<WorkflowStage>([
  ["pitch", "Pitch"],
  ["assigned", "Reporting (assigned, legacy)"],
  ["reporting", "Reporting"],
  ["writing", "Drafting"],
  ["editing", "Review"],
  ["ready", "Ready"],
  ["on-hold", "On Hold"],
  ["dropped", "Dropped"]
]);

export const STORY_FORMATS = ["standard", "video", "audio"] as const;
export type StoryFormat = (typeof STORY_FORMATS)[number];
export const STORY_FORMAT_OPTIONS = options<StoryFormat>([
  ["standard", "Standard"],
  ["video", "Video"],
  ["audio", "Audio"]
]);

/**
 * How a story begins. The built-in openings; a repository custom presentation
 * is keyed by story ID in code and overrides this choice, so it is not a value
 * here. The first two values existed before Feature and Split, so every older
 * story reads the same.
 */
export const STORY_PRESENTATIONS = ["standard", "feature", "immersive", "split"] as const;
export type StoryPresentationChoice = (typeof STORY_PRESENTATIONS)[number];
export const STORY_PRESENTATION_OPTIONS = options<StoryPresentationChoice>([
  ["standard", "Standard"],
  ["feature", "Feature"],
  ["immersive", "Immersive"],
  ["split", "Split"]
]);

/** What each opening is for, in a few words (the picker shows it under the name). */
export const STORY_PRESENTATION_SUMMARIES: Record<StoryPresentationChoice, string> = {
  standard: "Headline, then the photo at article width. For most daily stories.",
  feature: "Headline on the page, then a large photograph. For profiles and narrative features.",
  immersive: "The photograph fills the first screen with the headline over it.",
  split: "Headline on one side, photograph on the other. For profiles and visual features."
};

export const IMMERSIVE_ALIGNMENTS = ["bottom-left", "center"] as const;
export type ImmersiveAlignment = (typeof IMMERSIVE_ALIGNMENTS)[number];
export const IMMERSIVE_ALIGNMENT_OPTIONS = options<ImmersiveAlignment>([
  ["bottom-left", "Bottom left"],
  ["center", "Center"]
]);

export const FEATURE_IMAGE_WIDTHS = ["wide", "full"] as const;
export type FeatureImageWidth = (typeof FEATURE_IMAGE_WIDTHS)[number];
export const FEATURE_IMAGE_WIDTH_OPTIONS = options<FeatureImageWidth>([
  ["wide", "Wide"],
  ["full", "Full"]
]);

export const SPLIT_IMAGE_SIDES = ["right", "left"] as const;
export type SplitImageSide = (typeof SPLIT_IMAGE_SIDES)[number];
export const SPLIT_IMAGE_SIDE_OPTIONS = options<SplitImageSide>([
  ["left", "Left"],
  ["right", "Right"]
]);

/** The site chrome around a story. A designed choice, never "hide the header". */
export const STORY_SITE_NAVIGATIONS = ["standard", "minimal"] as const;
export type StorySiteNavigation = (typeof STORY_SITE_NAVIGATIONS)[number];
export const STORY_SITE_NAVIGATION_OPTIONS = options<StorySiteNavigation>([
  ["standard", "Standard"],
  ["minimal", "Minimal"]
]);

/** `legacy-html` is an imported WordPress body; `byline-v1` is the structured Byline editor. */
export const CONTENT_FORMATS = ["byline-v1", "legacy-html"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const TASK_STATES = ["open", "completed"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TASK_PRIORITY_OPTIONS = options<(typeof TASK_PRIORITIES)[number]>([
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"]
]);

export const PRODUCTION_TYPES = ["photo", "gallery", "graphic", "video", "audio", "other"] as const;
export const PRODUCTION_TYPE_OPTIONS = options<(typeof PRODUCTION_TYPES)[number]>([
  ["photo", "Photo"],
  ["gallery", "Gallery"],
  ["graphic", "Graphic"],
  ["video", "Video"],
  ["audio", "Audio"],
  ["other", "Other"]
]);
export const PRODUCTION_STATUSES = ["needed", "assigned", "in-progress", "uploaded", "selected", "done"] as const;
export const PRODUCTION_STATUS_OPTIONS = options<(typeof PRODUCTION_STATUSES)[number]>([
  ["needed", "Needed"],
  ["assigned", "Assigned"],
  ["in-progress", "In progress"],
  ["uploaded", "Uploaded"],
  ["selected", "Selected"],
  ["done", "Done"]
]);

export const SOURCE_STATUSES = ["planned", "contacted", "waiting", "needs-scheduling", "scheduled", "interviewed", "declined", "unavailable"] as const;
export const SOURCE_STATUS_OPTIONS = options<(typeof SOURCE_STATUSES)[number]>([
  ["planned", "Planned"],
  ["contacted", "Contacted"],
  ["waiting", "Waiting"],
  ["needs-scheduling", "Needs scheduling"],
  ["scheduled", "Scheduled"],
  ["interviewed", "Interviewed"],
  ["declined", "Declined"],
  ["unavailable", "Unavailable"]
]);

export const APPOINTMENT_KINDS = ["interview", "meeting", "event", "photo", "press-conference", "game", "performance", "reporting", "other"] as const;
export const APPOINTMENT_KIND_OPTIONS = options<(typeof APPOINTMENT_KINDS)[number]>([
  ["interview", "Interview"],
  ["meeting", "Meeting"],
  ["event", "Event"],
  ["photo", "Photo shoot"],
  ["press-conference", "Press conference"],
  ["game", "Game"],
  ["performance", "Performance"],
  ["reporting", "Reporting"],
  ["other", "Other"]
]);
export const APPOINTMENT_STATUSES = ["planned", "tentative", "confirmed", "completed", "cancelled"] as const;
export const APPOINTMENT_STATUS_OPTIONS = options<(typeof APPOINTMENT_STATUSES)[number]>([
  ["planned", "Planned"],
  ["tentative", "Tentative"],
  ["confirmed", "Confirmed"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"]
]);
export const SCHEDULE_MODES = ["unscheduled", "window", "exact"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];
export const SCHEDULE_MODE_OPTIONS = options<ScheduleMode>([
  ["unscheduled", "Unscheduled"],
  ["window", "Target window"],
  ["exact", "Exact time"]
]);

export const RESOURCE_PURPOSES = ["draft", "interview-notes", "transcript", "research", "data", "folder", "other"] as const;
export const RESOURCE_PURPOSE_OPTIONS = options<(typeof RESOURCE_PURPOSES)[number]>([
  ["draft", "Working draft"],
  ["interview-notes", "Interview notes"],
  ["transcript", "Transcript"],
  ["research", "Research"],
  ["data", "Data"],
  ["folder", "Folder"],
  ["other", "Other"]
]);

/**
 * Correction types. `editor-note` is canonical: it is what every published
 * WordPress record and the Astro renderer already use, so no alias migration.
 */
export const CORRECTION_TYPES = ["correction", "clarification", "editor-note", "substantive-update"] as const;
export const CORRECTION_TYPE_OPTIONS = options<(typeof CORRECTION_TYPES)[number]>([
  ["correction", "Correction"],
  ["clarification", "Clarification"],
  ["editor-note", "Editor's note"],
  ["substantive-update", "Substantive update"]
]);

/**
 * Collections: the private newsroom's reporting projects. A Collection's
 * type and status are newsroom vocabulary (the same as WordPress's
 * `byline_collection_types()` / `byline_collection_statuses()` and the shared
 * collection-model.ts); public coverage is only an optional presentation of
 * one, with its own reader-facing vocabulary below.
 */
export const COLLECTION_TYPES = ["event", "ongoing", "series", "project", "other"] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];
export const COLLECTION_TYPE_OPTIONS = options<CollectionType>([
  ["event", "Event coverage"],
  ["ongoing", "Ongoing coverage"],
  ["series", "Series"],
  ["project", "Special project"],
  ["other", "Other"]
]);
export const COLLECTION_STATUSES = ["planning", "active", "wrapping-up", "archived"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];
export const COLLECTION_STATUS_OPTIONS = options<CollectionStatus>([
  ["planning", "Planning"],
  ["active", "Active"],
  ["wrapping-up", "Wrapping up"],
  ["archived", "Archived"]
]);

export const INTERVIEW_STATUSES = ["planned", "scheduled", "completed", "follow-up", "cancelled"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const INTERVIEW_STATUS_OPTIONS = options<InterviewStatus>([
  ["planned", "Planned"],
  ["scheduled", "Scheduled"],
  ["completed", "Completed"],
  ["follow-up", "Needs follow-up"],
  ["cancelled", "Cancelled"]
]);

/** What a shared Collection resource is. Files are Media assets; nothing names a storage path. */
export const RESOURCE_KINDS = ["link", "document", "recording", "schedule", "reference"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const RESOURCE_KIND_OPTIONS = options<ResourceKind>([
  ["link", "Web link"],
  ["document", "Document"],
  ["recording", "Recording"],
  ["schedule", "Schedule"],
  ["reference", "Reference"]
]);

/** A Collection's optional public presentation: ongoing coverage, or a numbered series. */
export const PUBLIC_PRESENTATION_FORMATS = ["coverage", "series"] as const;
export type PublicPresentationFormat = (typeof PUBLIC_PRESENTATION_FORMATS)[number];
export const PUBLIC_PRESENTATION_FORMAT_OPTIONS = options<PublicPresentationFormat>([
  ["coverage", "Ongoing coverage"],
  ["series", "Numbered series"]
]);

/**
 * The public coverage contract's status (apps/web `WordPressCoverage.status`),
 * projected from a Collection's newsroom status; never stored.
 */
export const PUBLIC_COVERAGE_STATUS: Record<CollectionStatus, "upcoming" | "active" | "past" | "archived"> = {
  planning: "upcoming",
  active: "active",
  "wrapping-up": "past",
  archived: "archived"
};

export const PERSON_STATUSES = ["active", "alumni", "guest"] as const;
export const PERSON_STATUS_OPTIONS = options<(typeof PERSON_STATUSES)[number]>([
  ["active", "Current staff"],
  ["alumni", "Alumni"],
  ["guest", "Guest contributor"]
]);

/** Bounded limits carried over from the WordPress Story Workspace. */
export const LIMITS = {
  brief: 4000,
  sourcesPerStory: 30,
  appointmentsPerStory: 40,
  productionPerStory: 12,
  resourcesPerStory: 24,
  assignees: 4,
  line: 160,
  notes: 2000,
  collectionName: 240,
  publicTitle: 240,
  publicDescription: 320,
  publicOverview: 10000,
  interviewers: 8,
  url: 2048
} as const;
