/**
 * Newsroom notifications: what can notify someone, how a person chooses to
 * hear about it, and how each one reads. Pure; the Payload side is
 * `newsroom/notifications.ts`.
 *
 * Carries forward the WordPress notification defaults and adds Payload-native
 * newsroom workflows. Every known notification is on by default. A notification carries
 * only stable references (story, actor, a short detail); the headline and the
 * actor's name are resolved when it is shown or sent, so a renamed story never
 * leaves a stale title behind and nothing private is copied into the message.
 */

import { DEFAULT_EMAIL_BRAND, renderEmail, type EmailBrand, type EmailDetail } from "./email-layout";

export const NOTIFICATION_KINDS = [
  "storyAssignments", "readyForReview", "storyReturned", "mediaAssignments", "highPriorityTasks", "appointments", "publishingFailures", "dueDigest",
  "transcriptReady", "distributionAssignments", "distributionApproval", "distributionFailures", "frontPageFailures",
  "reviewComplete", "reviewRouting"
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LABELS: Record<NotificationKind, { label: string; description: string }> = {
  storyAssignments: { label: "Story assignments", description: "You are made a story's editor or added to its byline." },
  readyForReview: { label: "Reviews", description: "A story is sent to you, or to a review queue you are in." },
  storyReturned: { label: "Changes requested", description: "An editor asks for changes on a story you wrote." },
  mediaAssignments: { label: "Media assignments", description: "You are assigned photo, graphic, video or audio work." },
  highPriorityTasks: { label: "High-priority tasks", description: "A high or urgent task is assigned to you." },
  appointments: { label: "Appointments & reminders", description: "You are assigned an interview or appointment, and reminded before exact-time appointments." },
  publishingFailures: { label: "Publishing failures", description: "Editors only: public snapshot or media preparation failed." },
  dueDigest: { label: "Deadlines & due digest", description: "A morning summary of due work, plus reminders before story, task and media deadlines." },
  transcriptReady: { label: "Transcripts", description: "A recording you uploaded has been transcribed." },
  distributionAssignments: { label: "Distribution assignments", description: "You are made the owner of a story's social or newsletter distribution." },
  distributionApproval: { label: "Distribution approval", description: "Editors only: a distribution draft is waiting for your approval." },
  distributionFailures: { label: "Distribution failures", description: "A distribution you own (or edit) failed." },
  frontPageFailures: { label: "Front Page failures", description: "Editors only: a scheduled homepage change could not be activated." },
  reviewComplete: { label: "Review complete", description: "A story you wrote finished review and is ready." },
  reviewRouting: { label: "Review routing problems", description: "Editors only: a story could not be sent for review because no reviewer was found." }
};

export type NotificationChannel = "inApp" | "email";
export type NotificationPreferences = Record<NotificationChannel, Record<NotificationKind, boolean>>;

/** The Payload Preferences key; the account's own settings, never a Users field. */
export const NOTIFICATION_PREFERENCES_KEY = "byline:notifications:preferences:v1";

const allOn = (): Record<NotificationKind, boolean> => Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, true])) as Record<NotificationKind, boolean>;
export const defaultNotificationPreferences = (): NotificationPreferences => ({ inApp: allOn(), email: allOn() });

/** A stored value, tolerant of anything: unknown keys are dropped, only explicit `false` turns a kind off. */
export function resolveNotificationPreferences(value: unknown): NotificationPreferences {
  const preferences = defaultNotificationPreferences();
  if (!value || typeof value !== "object") return preferences;
  for (const channel of ["inApp", "email"] as const) {
    const stored = (value as Record<string, unknown>)[channel];
    if (!stored || typeof stored !== "object") continue;
    for (const kind of NOTIFICATION_KINDS) if ((stored as Record<string, unknown>)[kind] === false) preferences[channel][kind] = false;
  }
  return preferences;
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export type DigestItem = { type: "task" | "production" | "appointment" | "deadline"; title: string; storyId: number | null; when: string };

export type ReminderWhen = "today" | "tomorrow" | "in 1 hour" | `in ${number} minutes`;

export type ReminderFacts = {
  type: "deadline" | "appointment";
  target: "story" | "task" | "production" | "appointment";
  when: ReminderWhen;
};

export type NotificationFacts = {
  kind: NotificationKind;
  actor: string | null;
  story: string | null;
  detail: string | null;
  items?: readonly DigestItem[];
  reminder?: ReminderFacts | null;
};

const REMINDER_TYPES = new Set<ReminderFacts["type"]>(["deadline", "appointment"]);
const REMINDER_TARGETS = new Set<ReminderFacts["target"]>(["story", "task", "production", "appointment"]);
const STATIC_REMINDER_WHEN = new Set<ReminderFacts["when"]>(["today", "tomorrow", "in 1 hour"]);

function isReminderWhen(value: unknown): value is ReminderWhen {
  return typeof value === "string" && (STATIC_REMINDER_WHEN.has(value as ReminderWhen) || /^in [1-9]\d{0,2} minutes$/.test(value));
}

/** Stored notification JSON is private but still normalized before it becomes copy or HTML. */
export function reminderFacts(value: unknown): ReminderFacts | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as { reminder?: unknown }).reminder;
  if (!candidate || typeof candidate !== "object") return null;
  const { type, target, when } = candidate as Record<string, unknown>;
  if (!REMINDER_TYPES.has(type as ReminderFacts["type"]) || !REMINDER_TARGETS.has(target as ReminderFacts["target"]) || !isReminderWhen(when)) return null;
  return { type: type as ReminderFacts["type"], target: target as ReminderFacts["target"], when };
}

const who = (facts: NotificationFacts) => facts.actor ?? "Someone";
const quoted = (facts: NotificationFacts) => (facts.story ? `“${facts.story}”` : "a story");

/** One sentence for the inbox row and the email subject. */
export function describeNotification(facts: NotificationFacts): string {
  switch (facts.kind) {
    case "storyAssignments":
      return facts.detail === "editor" ? `${who(facts)} made you the editor of ${quoted(facts)}` : `${who(facts)} added you to the byline of ${quoted(facts)}`;
    case "readyForReview":
      return `${quoted(facts)} is ready for ${facts.detail ? `${facts.detail} review` : "your review"}`.replace(/^./, (letter) => letter.toUpperCase());
    case "storyReturned":
      return `${who(facts)} requested changes on ${quoted(facts)}`;
    case "mediaAssignments":
      return `${who(facts)} assigned you ${facts.detail ? `“${facts.detail}”` : "media work"} on ${quoted(facts)}`;
    case "highPriorityTasks":
      return `${who(facts)} gave you a high-priority task${facts.detail ? `: ${facts.detail}` : ""}`;
    case "appointments":
      if (facts.reminder?.type === "appointment") return `${facts.detail ? `“${facts.detail}”` : "Your appointment"} starts ${facts.reminder.when}`;
      return `${who(facts)} assigned you an appointment${facts.detail ? `: ${facts.detail}` : ""}`;
    case "publishingFailures":
      return `${facts.detail ?? "Publishing"} failed`;
    case "transcriptReady":
      return `The transcript of ${facts.detail ? `“${facts.detail}”` : "your recording"} is ready`;
    case "distributionAssignments":
      return `${who(facts)} made you the owner of ${facts.detail ?? "a distribution"} for ${quoted(facts)}`;
    case "distributionApproval":
      return `${who(facts)} asked you to approve ${facts.detail ?? "a distribution"} for ${quoted(facts)}`;
    case "distributionFailures":
      return `${facts.detail ?? "A distribution"} for ${quoted(facts)} failed`;
    case "reviewComplete":
      return `${quoted(facts)} finished review and is ready`.replace(/^./, (letter) => letter.toUpperCase());
    case "reviewRouting":
      return `${quoted(facts)} couldn't be sent for review${facts.detail ? `: ${facts.detail}` : ""}`.replace(/^./, (letter) => letter.toUpperCase());
    case "frontPageFailures":
      return `A scheduled homepage change could not be activated${facts.detail ? `: ${facts.detail}` : ""}`;
    case "dueDigest": {
      if (facts.reminder?.type === "deadline") {
        const subject = facts.detail ? `“${facts.detail}”` : facts.story ? `“${facts.story}”` : "Your work";
        return `${subject} is due ${facts.reminder.when}`;
      }
      const count = facts.items?.length ?? 0;
      return count === 1 ? "1 item is due today or overdue" : `${count} items are due today or overdue`;
    }
  }
}

export const DIGEST_LIMIT = 25;
const TYPE_LABEL: Record<DigestItem["type"], string> = { task: "Task", production: "Media", appointment: "Appointment", deadline: "Story deadline" };
export const digestLine = (item: DigestItem) => `${TYPE_LABEL[item.type]}: ${item.title} (${item.when})`;

type EmailCopy = { kicker: string; lead: string; action: string; alert?: boolean };

/** What each notification means for the person and the one thing to do next. */
function emailCopy(facts: NotificationFacts): EmailCopy {
  if (facts.reminder?.type === "appointment") return { kicker: "Reminder", lead: `It starts ${facts.reminder.when}. The time, place and who you're meeting are on the story.`, action: "See the details" };
  if (facts.reminder?.type === "deadline") return { kicker: "Deadline", lead: `It's due ${facts.reminder.when}. If it won't be ready, tell your editor now rather than at the deadline.`, action: facts.reminder.target === "story" ? "Open the story" : "Open the assignment" };
  switch (facts.kind) {
    case "storyAssignments":
      return facts.detail === "editor"
        ? { kicker: "Assignment", lead: "You're the story's editor now. Check the plan, the deadline and who's on it.", action: "Open the story" }
        : { kicker: "Assignment", lead: "You're on the byline. The plan, deadline and your part of the work are on the story.", action: "Open the story" };
    case "readyForReview":
      return { kicker: "Ready for review", lead: "It's waiting on you. Read it through, then approve it or send it back with notes.", action: "Review the story" };
    case "storyReturned":
      return { kicker: "Changes requested", lead: "Your editor sent it back. Their notes are on the story; make the changes and send it in again.", action: "See what to change" };
    case "mediaAssignments":
      return { kicker: "Assignment", lead: "The brief, the deadline and where the work goes are on the story.", action: "Open the assignment" };
    case "highPriorityTasks":
      return { kicker: "Priority work", lead: "It's marked high priority, so it should come before your other work.", action: "Open the task" };
    case "appointments":
      return { kicker: "Schedule", lead: "The time, place and who you're meeting are on the story. Add it to your calendar.", action: "See the details" };
    case "publishingFailures":
      return { kicker: "Attention needed", lead: "The public site didn't update. Byline shows what failed and lets you try again.", action: "See what failed", alert: true };
    case "transcriptReady":
      return { kicker: "Reporting", lead: "Read it through, check names and spellings against your notes, and pull your quotes.", action: "Read the transcript" };
    case "distributionAssignments":
      return { kicker: "Distribution", lead: "You own it now: write the posts, pick the timing and send it for approval.", action: "Open distribution" };
    case "distributionApproval":
      return { kicker: "Approval needed", lead: "Check the copy and the timing, then approve it or send it back.", action: "Review the draft" };
    case "distributionFailures":
      return { kicker: "Attention needed", lead: "It didn't go out. Byline shows the error and lets you try again.", action: "See what went wrong", alert: true };
    case "frontPageFailures":
      return { kicker: "Attention needed", lead: "The homepage is still showing the previous lineup. Check the scheduled change and publish it again.", action: "Open Front Page", alert: true };
    case "reviewComplete":
      return { kicker: "Review complete", lead: "It passed review. Check the final version before it's published.", action: "Open the story" };
    case "reviewRouting":
      return { kicker: "Attention needed", lead: "No reviewer could be found, so the story is waiting. Assign a reviewer or check the review workflow.", action: "Open the story", alert: true };
    case "dueDigest":
      return { kicker: "Morning briefing", lead: "Here's what's due today and anything that's slipped. Overdue work comes first.", action: "Open Byline" };
  }
}

/** The facts worth a second look, without repeating the headline word for word. */
function emailDetails(facts: NotificationFacts): EmailDetail[] {
  const details: EmailDetail[] = [];
  if (facts.story) details.push({ label: "Story", value: facts.story });
  const detailLabel: Partial<Record<NotificationKind, string>> = {
    mediaAssignments: "Assignment", highPriorityTasks: "Task", appointments: "Appointment", transcriptReady: "Recording",
    readyForReview: "Stage", distributionAssignments: "Channel", distributionApproval: "Channel", distributionFailures: "Channel",
    publishingFailures: "What failed", frontPageFailures: "Problem", reviewRouting: "Problem"
  };
  const label = facts.reminder?.type === "deadline" ? (facts.reminder.target === "story" ? null : "Assignment") : detailLabel[facts.kind];
  if (label && facts.detail) details.push({ label, value: facts.detail });
  if (facts.reminder) details.push({ label: facts.reminder.type === "appointment" ? "Starts" : "Due", value: facts.reminder.when.replace(/^./, (letter) => letter.toUpperCase()) });
  const actorLabel: Partial<Record<NotificationKind, string>> = {
    storyAssignments: "Assigned by", storyReturned: "Editor", mediaAssignments: "Assigned by", highPriorityTasks: "Assigned by",
    appointments: "Assigned by", distributionAssignments: "Assigned by", distributionApproval: "Asked by"
  };
  if (facts.actor && !facts.reminder && actorLabel[facts.kind]) details.push({ label: actorLabel[facts.kind]!, value: facts.actor });
  return details;
}

export type NotificationEmailOptions = {
  brand?: EmailBrand;
  /** A story's address in the newsroom, for digest items. */
  storyHref?: (storyId: number) => string;
  /** Where a person changes what they receive. */
  settingsHref?: string | null;
  /** The send date, already formatted for the masthead. */
  dateline?: string | null;
};

/** Subject, plain text and HTML for one notification, in the shared Byline email layout. */
export function notificationEmail(facts: NotificationFacts, link: string, options: NotificationEmailOptions = {}): { subject: string; text: string; html: string } {
  const subject = describeNotification(facts);
  const copy = emailCopy(facts);
  const digest = facts.kind === "dueDigest" && !facts.reminder;
  const items = digest ? (facts.items ?? []) : [];
  const toItem = (item: DigestItem) => ({ title: item.title, meta: `${TYPE_LABEL[item.type]} · ${item.when === "overdue" ? "Overdue" : "Due today"}`, href: item.storyId !== null && options.storyHref ? options.storyHref(item.storyId) : null });
  const overdue = items.filter((item) => item.when === "overdue");
  const today = items.filter((item) => item.when !== "overdue");
  const label = NOTIFICATION_LABELS[facts.kind].label;
  const { html, text } = renderEmail({
    brand: options.brand ?? DEFAULT_EMAIL_BRAND,
    dateline: options.dateline,
    preheader: digest ? (overdue.length ? `${overdue.length} overdue, ${today.length} due today.` : copy.lead) : copy.lead,
    kicker: copy.kicker,
    tone: copy.alert ? "alert" : "default",
    title: subject,
    lead: copy.lead,
    // A fact the headline already states is not repeated underneath it.
    details: digest ? [] : emailDetails(facts).filter((detail) => !subject.toLowerCase().includes(detail.value.toLowerCase())),
    sections: digest ? [{ heading: "Overdue", tone: "alert", items: overdue.map(toItem) }, { heading: "Due today", items: today.map(toItem) }] : [],
    action: { label: copy.action, href: link },
    reason: `You're getting this because “${label}” emails are on for your Byline account.`,
    manage: options.settingsHref ? { label: "Change what you get", href: options.settingsHref } : null
  });
  return { subject, text, html };
}

/** "just now", "5 min ago", "3 h ago", then a short date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
}
