import type { ScheduleAppointment } from "../workspace/workspace-types";
import type { PlanningPerson, PlanningStory } from "../planning/planning-model";
import type {
  ContributorEntry,
  EditorialTask,
} from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
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
export type PublicCoveragePresentation = {
  publicEnabled: boolean;
  publicTitle: string;
  publicSlug: string;
  publicDescription: string;
  publicOverview: string;
  artworkAttachmentId: number;
  featuredStoryId: number;
  storyOrder: number[];
};
export type Collection = {
  publicPresentation?: PublicCoveragePresentation;
  publicUrl?: string;
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
  canEdit: boolean;
  canDuplicate?: boolean;
};
export type Interview = {
  id: number;
  collectionId: number;
  sourceId: number;
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
  kind: string;
  attachmentId: number;
  storyIds: number[];
};
export type CollectionList = {
  collections: Collection[];
  people: ContributorEntry[];
  timezone: string;
  canCreate: boolean;
  total: number;
  pages: number;
};
export type CollectionDetail = {
  appointments?: ScheduleAppointment[];
  collection: Collection;
  stories: PlanningStory[];
  interviews: Interview[];
  tasks: EditorialTask[];
  resources: SharedResource[];
  activity: EditorialActivityRecord[];
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
> & { leadId?: number; expectedBrief?: string; publicPresentation?: PublicCoveragePresentation };
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
> & { expectedUpdatedAt?: string };
export type CollectionAction =
  | "open"
  | "story"
  | "interview"
  | "edit"
  | "duplicate"
  | "archive";
export function collectionActions(
  collection: Collection,
): { id: CollectionAction; label: string }[] {
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
          {
            id: "archive",
            label: collection.archived ? "Restore collection" : "Archive",
          },
        ] as { id: CollectionAction; label: string }[])
      : []),
  ];
}
export type CollectionFilters = {
  search: string;
  status: string;
  person: string;
  archive: string;
  sort: string;
};
export function visibleCollections(
  items: Collection[],
  filters: CollectionFilters,
): Collection[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return items
    .filter(
      (c) =>
        (!query || c.name.toLocaleLowerCase().includes(query)) &&
        (!filters.status || c.status === filters.status) &&
        (!filters.person ||
          c.lead?.id === Number(filters.person) ||
          c.members.some((p) => p.id === Number(filters.person))) &&
        (filters.archive === "all" ||
          c.archived === (filters.archive === "archived")),
    )
    .sort((a, b) =>
      filters.sort === "name"
        ? a.name.localeCompare(b.name)
        : filters.sort === "date"
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
export function collectionUrl(id?: number): string {
  return `admin.php?page=byline-planning&tab=collections${
    id ? `&collection=${id}` : ""
  }`;
}
