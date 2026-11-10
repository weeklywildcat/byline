import type { EffectivePhase } from "./lifecycle";

/**
 * Story Attention (docs/story-lifecycle.md#attention): one Story is one unit
 * of attention. A Story's sources, appointments, media work, checklist and
 * review feed its attention; they do not become separate Home rows.
 *
 * This is the one implementation. The server computes it for the stories a
 * reader can see (Home, Stories, Peek and the Story screen all read the
 * result) and nothing in the UI recalculates it. It is deterministic and
 * explainable: fixed rules, a fixed priority order, no scoring.
 */

export const ATTENTION_KINDS = [
  "routing-failed",
  "changes-requested",
  "review-assigned",
  "deadline-overdue",
  "appointment-soon",
  "media-due",
  "checklist-due",
  "waiting-on-source",
  "media-needed",
  "deadline-soon",
  "ready-to-publish"
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** Where acting on a signal happens in the Story. */
export type AttentionTarget =
  | { view: "story" }
  | { view: "reporting"; record?: { kind: "source" | "appointment"; id: number } }
  | { view: "review" }
  | { view: "feedback" }
  | { view: "media"; id?: number }
  | { view: "checklist"; id?: number };

export type AttentionSignal = {
  kind: AttentionKind;
  /** 0 is most urgent; equal priorities keep the ATTENTION_KINDS order, then `at`. */
  priority: number;
  /** Short and human: "Changes requested", "Interview tomorrow · 8:00 AM". */
  label: string;
  detail: string | null;
  /** Why Byline raised it, in a sentence (shown on request, never as the only text). */
  explanation: string;
  target: AttentionTarget;
  /** Whether it asks something of the reader (their story, their review, their assignment). */
  mine: boolean;
  /** The instant or day the signal is about, for ordering. */
  at: string | null;
};

export type StoryAttention = {
  storyId: number;
  phase: EffectivePhase;
  signals: AttentionSignal[];
  /** Whether the reader has anything to do on this Story (Home's "Needs your attention"). */
  needsViewer: boolean;
};

/* ------------------------------------------------------------------ input */

export type AttentionPerson = { id: number; name: string };

export type AttentionReview = {
  /** waiting: a gate is open; changes-requested: back with the writers; routing-failed: no reviewer could be found. */
  state: "waiting" | "in-progress" | "changes-requested" | "routing-failed";
  /** The open gate's label ("Section Edit") and who it waits for ("Sports Editor", a person or a role queue). */
  stepLabel: string | null;
  waitingFor: string | null;
  /** Users who may act on the open gate now: the assignee or, for a queue, every eligible member. */
  reviewerIds: number[];
  publishedComments: number;
  /** When the current state began. */
  since: string | null;
  failure: string | null;
};

export type AttentionInput = {
  storyId: number;
  phase: EffectivePhase;
  deadline: string | null;
  scheduledAt: string | null;
  /** People who write the Story (byline accounts, its creator) and its assigned editor. */
  writerIds: number[];
  editorId: number | null;
  review: AttentionReview | null;
  sources: Array<{ id: number; label: string; status: string; since: string | null; assigneeIds: number[] }>;
  appointments: Array<{ id: number; title: string; kind: string; status: string; startAt: string | null; windowStart: string | null; assigneeIds: number[] }>;
  media: Array<{ id: number; title: string; type: string; status: string; deadline: string | null; assigneeIds: number[] }>;
  checklist: Array<{ id: number; title: string; due: string | null; done: boolean; assigneeIds: number[] }>;
};

export type AttentionViewer = { id: number; isEditor: boolean };

export type AttentionClock = { now: Date; timeZone: string };

/* ------------------------------------------------------------------ rules */

const DAY = 86_400_000;
const WAITING_SOURCE_DAYS = 3;
const APPOINTMENT_HOURS = 48;
const MEDIA_DUE_DAYS = 2;

function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** "today", "tomorrow", "Friday" (this week) or "Nov 14". */
export function relativeDay(day: string, clock: AttentionClock): string {
  const today = localDay(clock.now, clock.timeZone);
  const diff = dayDiff(today, day);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  const date = new Date(`${day}T12:00:00Z`);
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function timeOfDay(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(instant));
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const APPOINTMENT_NOUN: Record<string, string> = { interview: "Interview", meeting: "Meeting", event: "Event", photo: "Photo shoot", "press-conference": "Press conference", game: "Game", performance: "Performance" };

function includes(ids: readonly number[], id: number): boolean {
  return ids.some((candidate) => candidate === id);
}

/**
 * The Story's attention for one reader. Pure: the server loads the inputs
 * (only records the reader may read) and calls this; tests call it directly.
 */
export function storyAttention(input: AttentionInput, viewer: AttentionViewer, clock: AttentionClock): StoryAttention {
  const signals: AttentionSignal[] = [];
  const active = input.phase !== "published" && input.phase !== "dropped" && input.phase !== "on-hold";
  const writer = includes(input.writerIds, viewer.id);
  const storyEditor = input.editorId === viewer.id;
  const responsible = writer || storyEditor;
  const today = localDay(clock.now, clock.timeZone);
  const push = (signal: Omit<AttentionSignal, "priority">) => signals.push({ ...signal, priority: ATTENTION_KINDS.indexOf(signal.kind) });

  const review = input.review;
  if (active && review?.state === "routing-failed") {
    push({
      kind: "routing-failed",
      label: "Can't be sent for review",
      detail: review.failure,
      explanation: "Byline could not find a reviewer for this Story's next review step. An editor needs to fix the newsroom roles.",
      target: { view: "story" },
      mine: viewer.isEditor || writer,
      at: review.since
    });
  }
  if (active && review?.state === "changes-requested") {
    push({
      kind: "changes-requested",
      label: "Changes requested",
      detail: review.publishedComments ? `${review.publishedComments} ${review.publishedComments === 1 ? "comment" : "comments"}` : null,
      explanation: `${review.waitingFor ?? "An editor"} sent this Story back with changes to make before it is resubmitted.`,
      target: { view: "feedback" },
      mine: writer,
      at: review.since
    });
  }
  if (active && (review?.state === "waiting" || review?.state === "in-progress")) {
    const reviewer = includes(review.reviewerIds, viewer.id);
    push({
      kind: "review-assigned",
      label: reviewer ? "Ready for your review" : `Waiting for ${review.waitingFor ?? "review"}`,
      detail: review.stepLabel,
      explanation: reviewer
        ? `This Story is at ${review.stepLabel ?? "a review step"} and you can review it.`
        : `This Story is with ${review.waitingFor ?? "a reviewer"} at ${review.stepLabel ?? "review"}.`,
      target: { view: "review" },
      mine: reviewer,
      at: review.since
    });
  }

  if (active && input.deadline && input.phase !== "ready") {
    const diff = dayDiff(today, input.deadline);
    if (diff < 0) {
      push({
        kind: "deadline-overdue",
        label: "Overdue",
        detail: `Was due ${relativeDay(input.deadline, clock)}`,
        explanation: "Its deadline has passed and it is not yet ready.",
        target: { view: "story" },
        mine: responsible,
        at: input.deadline
      });
    } else if (diff <= 1) {
      push({
        kind: "deadline-soon",
        label: `Due ${relativeDay(input.deadline, clock)}`,
        detail: null,
        explanation: "Its deadline is today or tomorrow.",
        target: { view: "story" },
        mine: responsible,
        at: input.deadline
      });
    }
  }

  if (active) {
    const soon = input.appointments
      .filter((item) => item.status !== "completed" && item.status !== "cancelled" && item.startAt)
      .filter((item) => {
        const at = Date.parse(item.startAt!);
        return at >= clock.now.getTime() - 3_600_000 && at <= clock.now.getTime() + APPOINTMENT_HOURS * 3_600_000;
      })
      .sort((a, b) => a.startAt!.localeCompare(b.startAt!) || a.id - b.id)[0];
    if (soon) {
      const day = localDay(new Date(soon.startAt!), clock.timeZone);
      push({
        kind: "appointment-soon",
        label: `${APPOINTMENT_NOUN[soon.kind] ?? "Appointment"} ${relativeDay(day, clock)} · ${timeOfDay(soon.startAt!, clock.timeZone)}`,
        detail: soon.title,
        explanation: "A scheduled interview or event for this Story is within two days.",
        target: { view: "reporting", record: { kind: "appointment", id: soon.id } },
        mine: includes(soon.assigneeIds, viewer.id) || (soon.assigneeIds.length === 0 && responsible),
        at: soon.startAt
      });
    }

    const waiting = input.sources
      .filter((source) => (source.status === "waiting" || source.status === "contacted") && source.since)
      .map((source) => ({ source, waited: dayDiff(localDay(new Date(source.since!), clock.timeZone), today) }))
      .filter((entry) => entry.waited >= WAITING_SOURCE_DAYS)
      .sort((a, b) => b.waited - a.waited || a.source.id - b.source.id)[0];
    if (waiting) {
      push({
        kind: "waiting-on-source",
        label: `Waiting on ${waiting.source.label}`,
        detail: days(waiting.waited),
        explanation: `${waiting.source.label} was contacted ${days(waiting.waited)} ago and hasn't been interviewed. Follow up or find another source.`,
        target: { view: "reporting", record: { kind: "source", id: waiting.source.id } },
        mine: includes(waiting.source.assigneeIds, viewer.id) || (waiting.source.assigneeIds.length === 0 && responsible),
        at: waiting.source.since
      });
    }

    const openMedia = input.media.filter((item) => item.status !== "done" && item.status !== "selected" && item.status !== "uploaded");
    const due = openMedia
      .filter((item) => item.assigneeIds.length > 0 && item.deadline)
      .filter((item) => dayDiff(today, localDay(new Date(item.deadline!), clock.timeZone)) <= MEDIA_DUE_DAYS)
      .sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.id - b.id)[0];
    if (due) {
      const day = localDay(new Date(due.deadline!), clock.timeZone);
      const late = dayDiff(today, day) < 0;
      push({
        kind: "media-due",
        label: late ? `${due.title} overdue` : `${due.title} due ${relativeDay(day, clock)}`,
        detail: null,
        explanation: late ? "Assigned media work is past its due date." : "Assigned media work is due within two days.",
        target: { view: "media", id: due.id },
        mine: includes(due.assigneeIds, viewer.id),
        at: due.deadline
      });
    }
    const needed = openMedia.filter((item) => item.assigneeIds.length === 0).sort((a, b) => a.id - b.id)[0];
    if (needed) {
      push({
        kind: "media-needed",
        label: `${sentence(needed.title)} still needed`,
        detail: "No one assigned",
        explanation: "Media work for this Story has no one assigned to it.",
        target: { view: "media", id: needed.id },
        mine: viewer.isEditor || storyEditor,
        at: needed.deadline
      });
    }

    const checklist = input.checklist
      .filter((item) => !item.done && item.due)
      .filter((item) => dayDiff(today, localDay(new Date(item.due!), clock.timeZone)) <= 1)
      .sort((a, b) => a.due!.localeCompare(b.due!) || a.id - b.id)[0];
    if (checklist) {
      const day = localDay(new Date(checklist.due!), clock.timeZone);
      push({
        kind: "checklist-due",
        label: checklist.title,
        detail: dayDiff(today, day) < 0 ? "Overdue" : `Due ${relativeDay(day, clock)}`,
        explanation: "An open checklist item is due today, tomorrow or earlier.",
        target: { view: "checklist", id: checklist.id },
        mine: includes(checklist.assigneeIds, viewer.id) || (checklist.assigneeIds.length === 0 && responsible),
        at: checklist.due
      });
    }
  }

  if (input.phase === "ready" && !input.scheduledAt) {
    push({
      kind: "ready-to-publish",
      label: "Ready to publish",
      detail: null,
      explanation: "Review is complete. It can be scheduled or published.",
      target: { view: "story" },
      mine: viewer.isEditor,
      at: null
    });
  }

  signals.sort((a, b) => a.priority - b.priority || (a.at ?? "~").localeCompare(b.at ?? "~"));
  return { storyId: input.storyId, phase: input.phase, signals, needsViewer: signals.some((signal) => signal.mine) };
}

/** The one or two signals a compact surface (Board card, Peek) shows: the reader's own first. */
export function leadingSignals(attention: StoryAttention | null | undefined, limit = 1): AttentionSignal[] {
  if (!attention) return [];
  const mine = attention.signals.filter((signal) => signal.mine);
  const rest = attention.signals.filter((signal) => !signal.mine);
  return [...mine, ...rest].slice(0, limit);
}
