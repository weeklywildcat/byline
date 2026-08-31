import {
  isPlanningDateOverdue,
  parsePlanningDate,
  planningDateKey,
  type ContentHealthResponse,
  type FeedbackResponse,
  type PlanningResponse,
  type PlanningStory
} from "../planning/planning-model";
import type { EditorialActivityPayload, EditorialActivityRecord } from "../editorial/activity-model";

export type HomeHealthStatus = "good" | "recommended" | "critical";

export type HomeHealthCheck = {
  id: string;
  label: string;
  status: HomeHealthStatus | string;
  summary: string;
  description?: string;
  remediationUrl?: string;
};

export type HomeHealthPayload = {
  summary?: {
    status?: string;
    good?: number;
    recommended?: number;
    critical?: number;
  };
  checks?: HomeHealthCheck[];
};

export type HomeDeploymentStatus = {
  configured?: boolean;
  lastStatus?: string;
  pending?: boolean;
  lifecycle?: string;
  expectedRevision?: number;
  publicRevision?: number;
};

export type HomeActivityPayload = EditorialActivityPayload;
export type HomeActivityRecord = EditorialActivityRecord;

export type HomePreset = {
  id: string;
  label: string;
  section: string;
  workflow: {
    status: string;
    deadlineOffsetDays: number;
    deadlinePolicy: string;
  };
  readiness: {
    policy: string;
    required: string[];
    recommended: string[];
  };
  media: {
    mode: string;
    requireCredit: boolean;
    requireAltText: boolean;
  };
  tasks?: Array<{ key: string; when: string; required: boolean }>;
  associations?: Record<string, unknown>;
};

export type HomePresetsPayload = {
  presets: Record<string, HomePreset>;
  types: string[];
  revision: number;
};

export type HomePresetMutation = {
  preset: HomePreset;
  revision: number;
};

export type HomeResourceState<T> = {
  data: T | null;
  error: string | null;
  available: boolean;
};

export type HomeAttentionSeverity = "critical" | "warning" | "info";
export type HomeAttentionSource = "story" | "health" | "content-health" | "feedback" | "deployment";

export type HomeAttentionItem = {
  id: string;
  title: string;
  detail: string;
  severity: HomeAttentionSeverity;
  source: HomeAttentionSource;
  href?: string | null;
};

export type HomeComingUp = {
  dueToday: number;
  scheduledToday: number;
  plannedSoon: number;
};

export type HomeData = {
  planning: HomeResourceState<PlanningResponse>;
  health: HomeResourceState<HomeHealthPayload>;
  contentHealth: HomeResourceState<ContentHealthResponse>;
  feedback: HomeResourceState<FeedbackResponse>;
  deployment: HomeResourceState<HomeDeploymentStatus>;
  activity: HomeResourceState<HomeActivityPayload>;
};

export type HomeNavigationCapabilities = {
  manage?: boolean;
  editDesign?: boolean;
  manageIntegrations?: boolean;
  editPosts?: boolean;
  editOthersPosts?: boolean;
};

const HEALTH_STATUS_RANK: Record<HomeAttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2
};

function localDateKey(value: string | null | undefined): string | null {
  const parsed = parsePlanningDate(value);
  return parsed ? planningDateKey(parsed) : null;
}

function storyTitle(story: PlanningStory): string {
  return story.title.trim() || "Untitled story";
}

function storyHref(story: PlanningStory): string | null {
  return story.editUrl || null;
}

function isReadyForReview(story: PlanningStory): boolean {
  return Boolean(story.needsReview || story.workflow.id === "ready" || story.workflow.id === "ready-for-review");
}

function addStoryAttention(items: HomeAttentionItem[], story: PlanningStory, now: Date): void {
  if (!story.wordpressState.isPublished && isPlanningDateOverdue(story.deadline, now)) {
    items.push({
      id: `story-overdue-${story.id}`,
      title: storyTitle(story),
      detail: "Deadline is overdue",
      severity: "critical",
      source: "story",
      href: storyHref(story)
    });
  }

  if (!story.wordpressState.isPublished && isReadyForReview(story)) {
    items.push({
      id: `story-review-${story.id}`,
      title: storyTitle(story),
      detail: "Waiting for review",
      severity: "warning",
      source: "story",
      href: storyHref(story)
    });
  }

  if (!story.wordpressState.isPublished && story.visual.status === "needed") {
    items.push({
      id: `story-visual-${story.id}`,
      title: storyTitle(story),
      detail: "Photo or visual is needed",
      severity: "warning",
      source: "story",
      href: storyHref(story)
    });
  }

  if (!story.wordpressState.isPublished && story.openTaskCount > 0) {
    items.push({
      id: `story-tasks-${story.id}`,
      title: storyTitle(story),
      detail: `${story.openTaskCount} open ${story.openTaskCount === 1 ? "task" : "tasks"}`,
      severity: "info",
      source: "story",
      href: storyHref(story)
    });
  }
}

function addHealthAttention(items: HomeAttentionItem[], health: HomeHealthPayload | null): void {
  for (const check of health?.checks || []) {
    if (check.status !== "critical" && check.status !== "recommended") continue;
    items.push({
      id: `health-${check.id}`,
      title: check.label,
      detail: check.summary,
      severity: check.status === "critical" ? "critical" : "warning",
      source: "health",
      href: check.remediationUrl || null
    });
  }
}

function addContentHealthAttention(items: HomeAttentionItem[], contentHealth: ContentHealthResponse | null): void {
  for (const issue of (contentHealth?.issues || []).slice(0, 8)) {
    items.push({
      id: `content-health-${issue.id}`,
      title: issue.story?.title || "Content Health",
      detail: issue.problem,
      severity: issue.severity === "error" ? "critical" : issue.severity === "warning" ? "warning" : "info",
      source: "content-health",
      href: issue.story?.editUrl || issue.fixUrl || null
    });
  }
}

function addFeedbackAttention(items: HomeAttentionItem[], feedback: FeedbackResponse | null): void {
  for (const item of (feedback?.feedback || []).filter((entry) => entry.status === "new").slice(0, 8)) {
    items.push({
      id: `feedback-${item.id}`,
      title: item.story?.title || "Reader feedback",
      detail: item.type === "correction" ? "Reader reported a possible correction" : "New reader feedback",
      severity: item.type === "correction" ? "warning" : "info",
      source: "feedback",
      href: item.story?.editUrl || item.story?.url || null
    });
  }
}

function addDeploymentAttention(items: HomeAttentionItem[], deployment: HomeDeploymentStatus | null): void {
  if (!deployment) return;
  const lifecycle = deployment.lifecycle || "";
  const status = deployment.lastStatus || "";
  if (lifecycle === "live") return;

  if (lifecycle === "queued" || lifecycle === "building" || deployment.pending) {
    items.push({
      id: "deployment-pending",
      title: "Website update",
      detail: lifecycle === "building" ? "The public site is building" : "Build request is queued",
      severity: "info",
      source: "deployment"
    });
    return;
  }

  if (lifecycle === "needs_configuration" || (!deployment.configured && Number(deployment.expectedRevision || 0) > 0)) {
    items.push({
      id: "deployment-needs-configuration",
      title: "Configure website publishing",
      detail: "WordPress has a newer public revision, but no deployment provider is configured.",
      severity: "critical",
      source: "deployment"
    });
    return;
  }

  if (lifecycle === "failed" || /request failed|no http status|http [45]\d\d/i.test(status)) {
    items.push({
      id: "deployment-failed",
      title: "Website update failed",
      detail: "The story remains safely in WordPress. Retry the website update.",
      severity: "critical",
      source: "deployment"
    });
    return;
  }

  if (Number(deployment.expectedRevision || 0) > 0 && Number(deployment.publicRevision || 0) < Number(deployment.expectedRevision || 0)) {
    items.push({
      id: "deployment-unverified",
      title: "Public revision not verified",
      detail: `The public site is at revision ${Number(deployment.publicRevision || 0)}; Byline expects revision ${Number(deployment.expectedRevision || 0)}.`,
      severity: "warning",
      source: "deployment"
    });
  }
}

/** Build a compact, urgency-first inbox from already permission-filtered data. */
export function homeAttentionItems(
  data: Pick<HomeData, "planning" | "health" | "contentHealth" | "feedback" | "deployment">,
  now = new Date()
): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = [];
  for (const story of data.planning.data?.stories || []) addStoryAttention(items, story, now);
  addHealthAttention(items, data.health.data);
  addContentHealthAttention(items, data.contentHealth.data);
  addFeedbackAttention(items, data.feedback.data);
  addDeploymentAttention(items, data.deployment.data);

  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => HEALTH_STATUS_RANK[left.severity] - HEALTH_STATUS_RANK[right.severity] || left.title.localeCompare(right.title))
    .slice(0, 24);
}

export function homeComingUp(stories: PlanningStory[], now = new Date()): HomeComingUp {
  const today = planningDateKey(now);
  const soon = new Date(now.getTime());
  soon.setDate(soon.getDate() + 7);
  const soonKey = planningDateKey(soon);

  return stories.reduce<HomeComingUp>((result, story) => {
    if (story.wordpressState.isPublished) return result;
    if (localDateKey(story.deadline) === today) result.dueToday += 1;
    if (localDateKey(story.wordpressState.scheduledAt) === today) result.scheduledToday += 1;
    const planned = localDateKey(story.plannedPublication);
    if (planned && planned >= today && planned <= soonKey) result.plannedSoon += 1;
    return result;
  }, { dueToday: 0, scheduledToday: 0, plannedSoon: 0 });
}

export function homeYourStories(stories: PlanningStory[], currentUserId: number | null | undefined): PlanningStory[] {
  if (!currentUserId) return [];
  return stories
    .filter((story) => story.writer?.id === currentUserId || story.editor?.id === currentUserId)
    .sort((left, right) => {
      const leftDeadline = parsePlanningDate(left.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDeadline = parsePlanningDate(right.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDeadline - rightDeadline || storyTitle(left).localeCompare(storyTitle(right));
    })
    .slice(0, 8);
}

export function homeRecentlyPublished(stories: PlanningStory[]): PlanningStory[] {
  return stories
    .filter((story) => story.wordpressState.isPublished)
    .slice()
    .sort((left, right) => {
      const leftDate = parsePlanningDate(left.wordpressState.publishedAt || left.modifiedAt)?.getTime() ?? 0;
      const rightDate = parsePlanningDate(right.wordpressState.publishedAt || right.modifiedAt)?.getTime() ?? 0;
      return rightDate - leftDate || storyTitle(left).localeCompare(storyTitle(right));
    })
    .slice(0, 5);
}

export function homeFailureMessage(resource: HomeResourceState<unknown>, label: string): string | null {
  if (!resource.error) return null;
  return `${label} is temporarily unavailable. The rest of the newsroom is still usable.`;
}

export function doctorHealthStatus(health: HomeHealthPayload | null): "good" | "recommended" | "critical" | "unknown" {
  const status = health?.summary?.status;
  return status === "good" || status === "recommended" || status === "critical" ? status : "unknown";
}
