import type { ScheduleAppointment } from "../workspace/workspace-types";
import type { PlanningPerson, PlanningStory } from "../planning/planning-model";
import type {
  ContributorEntry,
  EditorialTask,
} from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";

/**
 * Collections: a newsroom's private reporting projects. A Collection owns its
 * brief, team, dates, story membership, shared interviews, resources and
 * tasks. Public coverage or a numbered series is only an optional
 * presentation of one; the newsroom never calls the Collection itself
 * "Coverage". CMS-independent: WordPress and Payload each implement
 * `CollectionApi` (collection-api.ts) and supply their own addresses.
 */
export const collectionTypes = {
  event: "Event coverage",
  ongoing: "Ongoing coverage",
  series: "Series",
  project: "Special project",
  other: "Other",
};
export const collectionStatuses = {
  planning: "Planning",
  active: "Active",
  "wrapping-up": "Wrapping up",
  archived: "Archived",
};
export const interviewStatuses = {
  planned: "Planned",
  scheduled: "Scheduled",
  completed: "Completed",
  "follow-up": "Needs follow-up",
  cancelled: "Cancelled",
};
/** Shared resource kinds a host stores (Payload); WordPress reports a free-text kind label. */
export const resourceKinds = {
  link: "Web link",
  document: "Document",
  recording: "Recording",
  schedule: "Schedule",
  reference: "Reference",
};
/** Ongoing coverage, or a numbered series read in the public story order. */
export type PublicCoverageFormat = "coverage" | "series";
/**
 * A Collection's optional public presentation. Public wording (title, slug,
 * description, overview) is independent of the Collection's private name and
 * brief. The overview is plain text: paragraphs separated by blank lines.
 */
export type PublicCoveragePresentation = {
  publicEnabled: boolean;
  /** Absent on settings saved before series existed; read as coverage. */
  publicFormat?: PublicCoverageFormat;
  publicTitle: string;
  publicSlug: string;
  publicDescription: string;
  publicOverview: string;
  artworkAttachmentId: number;
  /** A preview of the artwork, when the host can show one. */
  artworkPreviewUrl?: string | null;
  featuredStoryId: number;
  storyOrder: number[];
};
export type CollectionPublicPresentation = PublicCoveragePresentation;
export type Collection = {
  publicPresentation?: PublicCoveragePresentation;
  /** The reader-facing page, only when it is actually live. */
  publicUrl?: string;
  /** May change the public presentation (editors). */
  canPublish?: boolean;
  id: number;
  name: string;
  brief: string;
  type: keyof typeof collectionTypes;
  status: keyof typeof collectionStatuses;
  lead: PlanningPerson | null;
  members: PlanningPerson[];
  startDate: string;
  endDate: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  storyIds: number[];
  storyCount: number;
  storySummary: Record<string, number>;
  interviewCount: number;
  openTaskCount: number;
  /** Coordinates the work: brief, status, stories, interviews, resources, tasks. */
  canEdit: boolean;
  /** Changes the lead and team. Absent: same as `canEdit` (WordPress). */
  canManageTeam?: boolean;
  /** Archives and restores. Absent: same as `canEdit` (WordPress). */
  canArchive?: boolean;
  /** Assigns Collection work to other people and duplicates Collections (editors). */
  canDuplicate?: boolean;
};
export type Interview = {
  id: number;
  collectionId: number;
  /** WordPress's reusable source identity. Payload interviews have none. */
  sourceId?: number;
  interviewee: string;
  status: keyof typeof interviewStatuses;
  scheduleMode?: "unscheduled" | "window" | "exact";
  windowStart?: string;
  windowEnd?: string;
  endAt?: string;
  location?: string;
  scheduledAt: string;
  completedAt: string;
  interviewers: PlanningPerson[];
  storyIds: number[];
  notes: string;
  followUps: string;
  resourceIds: number[];
  /** Present only for someone allowed to see it. */
  privateContact?: string;
  canEditContact?: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
export type SharedResource = {
  id: number;
  label: string;
  url: string;
  /** What it is, as a label ("Web link", "Recording", "Google Doc"). */
  kind: string;
  attachmentId: number;
  storyIds: number[];
  /** How many Collections use it; above one, removing it here keeps it elsewhere. */
  collectionCount?: number;
};
export type CollectionCapabilities = {
  canCreate: boolean;
  /** WordPress keeps the Collection activity list; Payload has no activity domain yet. */
  activity?: boolean;
};
export type CollectionList = {
  collections: Collection[];
  people: ContributorEntry[];
  timezone: string;
  canCreate: boolean;
  capabilities?: CollectionCapabilities;
  total: number;
  pages: number;
};
export type CollectionDetail = {
  appointments?: ScheduleAppointment[];
  collection: Collection;
  stories: PlanningStory[];
  interviews: Interview[];
  tasks: EditorialTask[];
  /** Open tasks on member stories, for coordinators; labelled with their story. */
  storyTasks?: EditorialTask[];
  resources: SharedResource[];
  /** Only where the host keeps Collection activity (WordPress). */
  activity?: EditorialActivityRecord[];
};
export type StoryCollections = {
  canManage: boolean;
  collections: Collection[];
  interviews: Interview[];
  availableInterviews: Interview[];
  resources: SharedResource[];
};
export type CollectionInput = Partial<
  Pick<
    Collection,
    "name" | "brief" | "type" | "status" | "startDate" | "endDate"
  >
> & {
  leadId?: number;
  expectedBrief?: string;
  expectedUpdatedAt?: string;
  publicPresentation?: PublicCoveragePresentation;
};
export type InterviewInput = Partial<
  Pick<
    Interview,
    | "interviewee"
    | "status"
    | "scheduledAt"
    | "completedAt"
    | "notes"
    | "followUps"
    | "privateContact"
    | "sourceId"
    | "scheduleMode"
    | "windowStart"
    | "windowEnd"
    | "endAt"
    | "location"
  >
> & {
  storyIds?: number[];
  interviewerIds?: number[];
  resourceIds?: number[];
  expectedUpdatedAt?: string;
};
export type ResourceInput = {
  label: string;
  url?: string;
  kind?: keyof typeof resourceKinds;
  attachmentId?: number;
};

/* ------------------------------------------------------ list and views */

/**
 * The Collections list's built-in views. Active is the default (everything
 * not archived); Mine is what the reader leads or is on the team of (never
 * inferred from story assignments).
 */
export const collectionViews = {
  active: "Active",
  mine: "Mine",
  all: "All",
  archived: "Archived",
};
export type CollectionView = keyof typeof collectionViews;
export const collectionSorts = {
  updated: "Recently updated",
  name: "Name",
  start: "Start date",
};
export type CollectionSort = keyof typeof collectionSorts;
export type CollectionListQuery = {
  view: CollectionView;
  search: string;
  type: string;
  status: string;
  /** A lead or team member's account id. */
  person: number | null;
  sort: CollectionSort;
  page: number;
  /** Fewer rows, for the switcher. */
  limit?: number;
};
export const DEFAULT_COLLECTION_QUERY: CollectionListQuery = {
  view: "active",
  search: "",
  type: "",
  status: "",
  person: null,
  sort: "updated",
  page: 1,
};
export function normalizeCollectionQuery(
  input: Partial<Record<keyof CollectionListQuery, unknown>> = {},
): CollectionListQuery {
  const text = (value: unknown, max = 100) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const view = text(input.view);
  const sort = text(input.sort);
  const type = text(input.type);
  const status = text(input.status);
  const person = Number(input.person);
  const page = Number(input.page);
  const limit = Number(input.limit);
  return {
    view: view in collectionViews ? (view as CollectionView) : "active",
    search: text(input.search),
    type: type in collectionTypes ? type : "",
    status: status in collectionStatuses ? status : "",
    person: Number.isSafeInteger(person) && person > 0 ? person : null,
    sort: sort in collectionSorts ? (sort as CollectionSort) : "updated",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    ...(Number.isSafeInteger(limit) && limit > 0
      ? { limit: Math.min(limit, 100) }
      : {}),
  };
}
/** How many of the optional filters (type, status, person) are on. */
export function activeCollectionFilterCount(query: CollectionListQuery) {
  return [query.type, query.status, query.person].filter(Boolean).length;
}
/** The query as URL parameters (only what differs from the defaults). */
export function collectionQueryParams(query: CollectionListQuery) {
  const params: Record<string, string> = {};
  if (query.view !== "active") params.view = query.view;
  if (query.search) params.search = query.search;
  if (query.type) params.type = query.type;
  if (query.status) params.status = query.status;
  if (query.person) params.person = String(query.person);
  if (query.sort !== "updated") params.sort = query.sort;
  if (query.page > 1) params.page = String(query.page);
  if (query.limit) params.limit = String(query.limit);
  return params;
}
const inView = (c: Collection, view: CollectionView, userId: number | null) =>
  view === "all"
    ? true
    : view === "archived"
    ? c.archived
    : view === "mine"
    ? userId !== null &&
      (c.lead?.id === userId || c.members.some((p) => p.id === userId))
    : !c.archived;
/** The same view, filters and order, applied in the browser (WordPress loads every Collection). */
export function visibleCollections(
  items: Collection[],
  query: CollectionListQuery,
  currentUserId: number | null,
): Collection[] {
  const search = query.search.trim().toLocaleLowerCase();
  return items
    .filter(
      (c) =>
        inView(c, query.view, currentUserId) &&
        (!search || c.name.toLocaleLowerCase().includes(search)) &&
        (!query.type || c.type === query.type) &&
        (!query.status || c.status === query.status) &&
        (!query.person ||
          c.lead?.id === query.person ||
          c.members.some((p) => p.id === query.person)),
    )
    .sort((a, b) =>
      query.sort === "name"
        ? a.name.localeCompare(b.name) || a.id - b.id
        : query.sort === "start"
        ? (a.startDate || "9999").localeCompare(b.startDate || "9999") ||
          a.id - b.id
        : b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id,
    );
}
export function storySummary(collection: Collection): string {
  return Object.entries(collection.storySummary)
    .map(([label, count]) => `${count} ${label.toLowerCase()}`)
    .join(" · ");
}
/** "8 stories · 2 interviews · 3 open tasks": the list's tertiary line. */
export function collectionCounts(collection: Collection): string {
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    plural(collection.storyCount, "story", "stories"),
    plural(collection.interviewCount, "interview", "interviews"),
    plural(collection.openTaskCount, "open task", "open tasks"),
  ].join(" · ");
}
export function edgeChanges(
  previous: number[],
  next: number[],
): { target: number; linked: boolean }[] {
  return [
    ...previous
      .filter((id) => !next.includes(id))
      .map((target) => ({ target, linked: false })),
    ...next
      .filter((id) => !previous.includes(id))
      .map((target) => ({ target, linked: true })),
  ];
}

/* --------------------------------------------------------------- actions */

export type CollectionAction =
  | "open"
  | "story"
  | "interview"
  | "edit"
  | "duplicate"
  | "archive";
/** The row's actions: one list for its visible menu and its context menu. */
export function collectionActions(
  collection: Collection,
): { id: CollectionAction; label: string }[] {
  const archive = collection.canArchive ?? collection.canEdit;
  return [
    { id: "open", label: "Open collection" },
    ...(collection.canEdit
      ? ([
          { id: "story", label: "Add story" },
          { id: "interview", label: "Add interview" },
          { id: "edit", label: "Edit details" },
          ...(collection.canDuplicate
            ? [{ id: "duplicate", label: "Duplicate" }]
            : []),
        ] as { id: CollectionAction; label: string }[])
      : []),
    ...(archive
      ? [
          {
            id: "archive" as const,
            label: collection.archived ? "Restore collection" : "Archive",
          },
        ]
      : []),
  ];
}

/* ----------------------------------------------------------------- route */

/**
 * The open Collection's workspace sections. Activity exists only where the
 * host keeps Collection activity (WordPress); Public only when the reader may
 * present the Collection publicly or it already is public.
 */
export const collectionTabs = {
  overview: "Overview",
  stories: "Stories",
  reporting: "Reporting",
  tasks: "Tasks",
  resources: "Resources",
  public: "Public",
  activity: "Activity",
};
export type CollectionTab = keyof typeof collectionTabs;
/** Where the Collections screen is: the list, or one Collection, a section and an open interview. */
export type CollectionRoute = {
  collectionId: number | null;
  tab: CollectionTab;
  interviewId: number | null;
};
export const COLLECTIONS_INDEX: CollectionRoute = {
  collectionId: null,
  tab: "overview",
  interviewId: null,
};
/** Unknown sections read as Overview. */
export function normalizeCollectionTab(value: unknown): CollectionTab {
  return typeof value === "string" && value in collectionTabs
    ? (value as CollectionTab)
    : "overview";
}
/** A route from address values; an open interview always belongs to Reporting. */
export function collectionRoute(input: {
  collection?: unknown;
  tab?: unknown;
  interview?: unknown;
}): CollectionRoute {
  const id = Number(input.collection);
  const interview = Number(input.interview);
  const collectionId = Number.isSafeInteger(id) && id > 0 ? id : null;
  const interviewId =
    collectionId && Number.isSafeInteger(interview) && interview > 0
      ? interview
      : null;
  return {
    collectionId,
    tab: interviewId
      ? "reporting"
      : collectionId
      ? normalizeCollectionTab(input.tab)
      : "overview",
    interviewId,
  };
}
/** The sections this reader gets for this Collection, in order. */
export function availableCollectionTabs(
  collection: Pick<Collection, "canPublish" | "publicPresentation">,
  options: { activity?: boolean } = {},
): CollectionTab[] {
  return [
    "overview",
    "stories",
    "reporting",
    "tasks",
    "resources",
    ...(collection.canPublish || collection.publicPresentation?.publicEnabled
      ? (["public"] as const)
      : []),
    ...(options.activity ? (["activity"] as const) : []),
  ];
}
/** How a host addresses a Collection (and a section or interview in it). */
export type CollectionHref = (
  collectionId: number,
  options?: { tab?: CollectionTab; interviewId?: number },
) => string;
