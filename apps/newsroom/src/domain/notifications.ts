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

export type ReminderFacts = {
  type: "deadline" | "appointment";
  target: "story" | "task" | "production" | "appointment";
  when: "tomorrow" | "in 1 hour";
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
const REMINDER_WHEN = new Set<ReminderFacts["when"]>(["tomorrow", "in 1 hour"]);

/** Stored notification JSON is private but still normalized before it becomes copy or HTML. */
export function reminderFacts(value: unknown): ReminderFacts | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as { reminder?: unknown }).reminder;
  if (!candidate || typeof candidate !== "object") return null;
  const { type, target, when } = candidate as Record<string, unknown>;
  if (!REMINDER_TYPES.has(type as ReminderFacts["type"]) || !REMINDER_TARGETS.has(target as ReminderFacts["target"]) || !REMINDER_WHEN.has(when as ReminderFacts["when"])) return null;
  return { type: type as ReminderFacts["type"], target: target as ReminderFacts["target"], when: when as ReminderFacts["when"] };
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
      if (facts.reminder?.type === "appointment") return `${facts.detail ? `“${facts.detail}”` : "Your appointment"} starts in 1 hour`;
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
        return `${subject} is due tomorrow`;
      }
      const count = facts.items?.length ?? 0;
      return count === 1 ? "1 item is due today or overdue" : `${count} items are due today or overdue`;
    }
  }
}

export const DIGEST_LIMIT = 25;
const TYPE_LABEL: Record<DigestItem["type"], string> = { task: "Task", production: "Media", appointment: "Appointment", deadline: "Story deadline" };
export const digestLine = (item: DigestItem) => `${TYPE_LABEL[item.type]}: ${item.title} (${item.when})`;

const EMAIL_KICKERS: Partial<Record<NotificationKind, string>> = {
  storyAssignments: "Assignment",
  readyForReview: "Editorial review",
  storyReturned: "Editorial review",
  mediaAssignments: "Assignment",
  highPriorityTasks: "Priority work",
  appointments: "Schedule",
  publishingFailures: "Attention needed",
  transcriptReady: "Reporting",
  distributionAssignments: "Distribution",
  distributionApproval: "Distribution",
  distributionFailures: "Attention needed",
  frontPageFailures: "Attention needed",
  reviewComplete: "Editorial review",
  reviewRouting: "Attention needed"
};

/** Plain text and deliberately conservative, table-based HTML for broad email-client support. */
export function notificationEmail(facts: NotificationFacts, link: string): { subject: string; text: string; html: string } {
  const subject = describeNotification(facts);
  const lines = facts.kind === "dueDigest" && !facts.reminder ? (facts.items ?? []).map(digestLine) : [];
  const kicker = facts.reminder ? "Reminder" : facts.kind === "dueDigest" ? "Morning briefing" : (EMAIL_KICKERS[facts.kind] ?? "Newsroom update");
  const text = [subject, ...(lines.length ? ["", ...lines.map((line) => `- ${line}`)] : []), "", `Open in Byline: ${link}`, "", "Change what you receive in Byline → Notifications → Settings."].join("\n");
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const itemRows = lines.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;border-collapse:collapse;">${(facts.items ?? []).map((item) => `<tr><td style="padding:12px 0;border-top:1px solid #e8e3df;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><div style="font-size:15px;line-height:1.35;font-weight:650;color:#171717;">${escape(item.title)}</div><div style="margin-top:3px;font-size:12px;line-height:1.4;color:#6b6662;">${escape(TYPE_LABEL[item.type])} · ${escape(item.when)}</div></td></tr>`).join("")}</table>`
    : "";
  const safeLink = escape(link);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ef;color:#171717;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(subject)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f1ef;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e1dbd7;border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:#6f1d35;padding:20px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:17px;line-height:1;font-weight:800;letter-spacing:.12em;color:#ffffff;">BYLINE</td>
                  <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.2;font-weight:700;letter-spacing:.08em;color:#ead9df;">THE WEEKLY WILDCAT</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px 28px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.3;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6f1d35;">${escape(kicker)}</div>
              <h1 style="margin:9px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:27px;line-height:1.18;font-weight:600;color:#171717;">${escape(subject)}</h1>
              ${itemRows}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 0;border-collapse:separate;">
                <tr>
                  <td style="background:#171717;border-radius:7px;">
                    <a href="${safeLink}" style="display:inline-block;padding:12px 17px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;">Open in Byline&nbsp;→</a>
                  </td>
                </tr>
              </table>
              <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #e8e3df;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.5;color:#77716d;">Change what you receive in Byline → Notifications → Settings.</p>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.5;color:#8a8581;">Sent by Byline for The Weekly Wildcat newsroom.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
