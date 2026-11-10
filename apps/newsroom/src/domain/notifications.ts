/**
 * Newsroom notifications: what can notify someone, how a person chooses to
 * hear about it, and how each one reads. Pure; the Payload side is
 * `newsroom/notifications.ts`.
 *
 * Ports the WordPress kinds and defaults (`includes/editorial/notifications.php`):
 * the same eight notifications, each on by default. A notification carries
 * only stable references (story, actor, a short detail); the headline and the
 * actor's name are resolved when it is shown or sent, so a renamed story never
 * leaves a stale title behind and nothing private is copied into the message.
 */

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
  appointments: { label: "Appointments", description: "You are assigned an interview or appointment." },
  publishingFailures: { label: "Publishing failures", description: "Editors only: public snapshot or media preparation failed." },
  dueDigest: { label: "Daily due digest", description: "A morning summary of your work due today or overdue." },
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

export type NotificationFacts = {
  kind: NotificationKind;
  actor: string | null;
  story: string | null;
  detail: string | null;
  items?: readonly DigestItem[];
};

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
      const count = facts.items?.length ?? 0;
      return count === 1 ? "1 item is due today or overdue" : `${count} items are due today or overdue`;
    }
  }
}

export const DIGEST_LIMIT = 25;
const TYPE_LABEL: Record<DigestItem["type"], string> = { task: "Task", production: "Media", appointment: "Appointment", deadline: "Story deadline" };
export const digestLine = (item: DigestItem) => `${TYPE_LABEL[item.type]}: ${item.title} (${item.when})`;

/** Plain text and HTML bodies for an email; `link` is the Byline address the message opens. */
export function notificationEmail(facts: NotificationFacts, link: string): { subject: string; text: string; html: string } {
  const subject = describeNotification(facts);
  const lines = facts.kind === "dueDigest" ? (facts.items ?? []).map(digestLine) : [];
  const text = [subject, ...(lines.length ? ["", ...lines.map((line) => `- ${line}`)] : []), "", `Open in Byline: ${link}`, "", "Change what you receive in Byline → Notifications → Settings."].join("\n");
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<p>${escape(subject)}</p>${lines.length ? `<ul>${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : ""}<p><a href="${escape(link)}">Open in Byline</a></p><p style="color:#666;font-size:12px">Change what you receive in Byline → Notifications → Settings.</p>`;
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
