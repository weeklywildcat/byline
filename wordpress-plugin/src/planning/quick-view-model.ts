import type {
  MediaAttachment,
  PlanningPerson,
  PlanningStory,
  PlanningVisualStatus,
  PlanningVisualType,
  PlanningWorkflowStatus
} from "./planning-model";

export type QuickViewTask = {
  id: number | string;
  title: string;
  state: "open" | "completed";
  priority: "low" | "normal" | "high" | "urgent";
  assignee: PlanningPerson | null;
  dueAt: string | null;
};

export type QuickViewMedia = {
  type: PlanningVisualType;
  status: PlanningVisualStatus;
  label: string;
  notes: string;
  attachmentIds: number[];
  attachments: MediaAttachment[];
  featuredAttachmentId: number | null;
  readiness: {
    ready: boolean;
    missingAltIds: number[];
    missingCreditIds: number[];
    missingRightsIds: number[];
  } | null;
};

export type QuickViewReadiness = {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
  ready: boolean;
} | null;

export type QuickViewActivity = {
  id: number | string;
  summary: string;
  occurredAt: string;
  actor: PlanningPerson | null;
};

export type StoryQuickViewData = {
  storyId: number;
  statuses: PlanningWorkflowStatus[];
  editors: PlanningPerson[];
  capabilities: {
    changeStatus: boolean;
    assign: boolean;
    changeDeadline: boolean;
    changePlannedPublication: boolean;
    canEditTasks: boolean;
    canAssignTasks: boolean;
    canDeleteTasks: boolean;
    canManageMedia: boolean;
  };
  tasks: QuickViewTask[];
  taskPeople: PlanningPerson[];
  media: QuickViewMedia;
  readiness: QuickViewReadiness;
  correctionsCount: number;
  discord: {
    configured: boolean;
    threadUrl: string;
  };
  activity: QuickViewActivity[];
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function positiveNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function person(value: unknown): PlanningPerson | null {
  const source = record(value);
  const id = positiveNumber(source.id ?? source.ID);
  const name = text(source.name ?? source.displayName ?? source.display_name).trim();
  return id > 0 && name ? { id, name, avatarUrl: text(source.avatarUrl ?? source.avatar_url) || null } : null;
}

function people(value: unknown): PlanningPerson[] {
  if (!Array.isArray(value)) return [];
  const result: PlanningPerson[] = [];
  value.forEach((item) => {
    const next = person(item);
    if (next && !result.some((candidate) => candidate.id === next.id)) result.push(next);
  });
  return result;
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => positiveNumber(
    item && typeof item === "object" ? (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).attachmentId : item
  )).filter((item) => item > 0)));
}

function taskState(value: unknown): QuickViewTask["state"] {
  return ["completed", "complete", "done"].includes(text(value).toLowerCase()) ? "completed" : "open";
}

function taskPriority(value: unknown): QuickViewTask["priority"] {
  const priority = text(value).toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority as QuickViewTask["priority"] : "normal";
}

function normalizeTasks(value: unknown): QuickViewTask[] {
  const source = record(value);
  const rawTasks = Array.isArray(value) ? value : source.tasks;
  if (!Array.isArray(rawTasks)) return [];

  return rawTasks.flatMap((item) => {
    const task = record(item);
    const id = positiveNumber(task.id) || text(task.id);
    const title = text(task.title).trim();
    if (!id || !title) return [];
    return [{
      id,
      title,
      state: taskState(task.state ?? task.status),
      priority: taskPriority(task.priority),
      assignee: person(task.assignee),
      dueAt: text(task.dueAt ?? task.due_at) || null
    }];
  });
}

function normalizeAttachments(value: unknown): MediaAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    const id = positiveNumber(source.id ?? source.attachmentId);
    if (!id) return [];
    const checks = record(source.checks);
    return [{
      id,
      title: text(source.title),
      url: text(source.url) || null,
      previewUrl: text(source.previewUrl ?? source.preview_url) || null,
      mimeType: text(source.mimeType ?? source.mime_type) || null,
      isImage: Boolean(source.isImage ?? source.is_image),
      alt: text(source.alt),
      creator: text(source.creator),
      creditText: text(source.creditText ?? source.credit_text),
      copyrightNotice: text(source.copyrightNotice ?? source.copyright_notice),
      licenseUrl: text(source.licenseUrl ?? source.license_url),
      checks: {
        alt: checks.alt !== false,
        credit: checks.credit !== false,
        rights: checks.rights !== false
      }
    }];
  });
}

function normalizeMedia(value: unknown): QuickViewMedia {
  const source = record(value);
  const readiness = record(source.mediaReadiness ?? source.readiness);
  const type = text(source.type, "none");
  const status = text(source.status, "needed");
  return {
    type: ["none", "photo", "gallery", "graphic", "video", "other"].includes(type) ? type as PlanningVisualType : "other",
    status: ["needed", "assigned", "in-progress", "uploaded", "selected", "done"].includes(status) ? status as PlanningVisualStatus : "needed",
    label: text(source.label),
    notes: text(source.notes ?? source.legacyNotes),
    attachmentIds: numberList(source.attachmentIds ?? source.attachments),
    attachments: normalizeAttachments(source.attachments),
    featuredAttachmentId: positiveNumber(source.featuredAttachmentId ?? readiness.featuredAttachmentId) || null,
    readiness: Object.keys(readiness).length ? {
      ready: readiness.ready === true,
      missingAltIds: numberList(readiness.missingAltIds),
      missingCreditIds: numberList(readiness.missingCreditIds),
      missingRightsIds: numberList(readiness.missingRightsIds)
    } : null
  };
}

function normalizeReadiness(value: unknown): QuickViewReadiness {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  return {
    passed: positiveNumber(source.passed),
    warnings: positiveNumber(source.warnings),
    errors: positiveNumber(source.errors),
    total: positiveNumber(source.total),
    ready: source.ready === true
  };
}

function normalizeActivity(value: unknown): QuickViewActivity[] {
  const source = record(value);
  const rawItems = Array.isArray(value) ? value : source.activity ?? source.items;
  if (!Array.isArray(rawItems)) return [];
  return rawItems.flatMap((item) => {
    const activity = record(item);
    const summary = text(activity.summary ?? activity.label).trim();
    if (!summary) return [];
    const id = positiveNumber(activity.id) || text(activity.id);
    if (!id) return [];
    return [{
      id,
      summary,
      occurredAt: text(activity.occurredAt ?? activity.createdAt),
      actor: person(activity.actor)
    }];
  });
}

/** Normalize the deliberately bounded protected aggregate at the UI boundary. */
export function normalizeStoryQuickView(value: unknown, story: PlanningStory): StoryQuickViewData {
  const source = record(value);
  const bootstrap = record(source.bootstrap);
  const root = Object.keys(bootstrap).length ? bootstrap : source;
  const rawTaskPayload = source.tasks ?? root.tasks;
  const taskPayload = record(rawTaskPayload);
  const rawMedia = source.media ?? root.media;
  const media = normalizeMedia(rawMedia);
  const rawCapabilities = record(root.capabilities);
  const taskCapabilities = record(taskPayload.capabilities);
  const discord = record(root.discord);
  const rawCorrections = source.corrections ?? root.corrections;
  const correctionPayload = record(rawCorrections);
  const correctionCount = Array.isArray(rawCorrections)
    ? rawCorrections.length
    : positiveNumber(correctionPayload.count ?? (Array.isArray(correctionPayload.corrections) ? correctionPayload.corrections.length : 0));

  return {
    storyId: story.id,
    statuses: Array.isArray(root.statuses) ? root.statuses.flatMap((item) => {
      const status = record(item);
      const id = text(status.id).trim();
      if (!id) return [];
      return [{
        id,
        label: text(status.label, id),
        group: ["main", "sidelined", "derived"].includes(text(status.group)) ? text(status.group) as PlanningWorkflowStatus["group"] : "main",
        selectable: status.selectable !== false
      }];
    }) : [],
    editors: people(root.editors),
    capabilities: {
      changeStatus: rawCapabilities.changeStatus !== false,
      assign: rawCapabilities.assign === true,
      changeDeadline: rawCapabilities.changeDeadline !== false,
      changePlannedPublication: rawCapabilities.changePlannedPublication !== false,
      canEditTasks: taskCapabilities.canEditLinkedStory !== false,
      canAssignTasks: taskCapabilities.canAssign === true,
      canDeleteTasks: taskCapabilities.canDelete === true,
      canManageMedia: rawCapabilities.canManageMedia !== false
    },
    tasks: normalizeTasks(rawTaskPayload),
    taskPeople: people(taskPayload.people ?? root.editors),
    media,
    readiness: normalizeReadiness(source.readiness ?? root.readiness),
    correctionsCount: correctionCount,
    discord: {
      configured: discord.configured === true,
      threadUrl: text(discord.threadUrl)
    },
    activity: normalizeActivity(source.activity ?? root.activity)
  };
}
