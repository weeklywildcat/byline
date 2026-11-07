/**
 * WordPress Core Notes, as Byline shows them.
 *
 * Notes are WordPress comments (`comment_type = note`); Gutenberg owns creating,
 * replying, resolving and anchoring them. Byline only reads a protected summary
 * and a short preview, and links to the real editor. Nothing here describes a
 * Note's body, anchor or position, and a viewer who may not edit the story
 * receives `notes: null` and sees none of this.
 */

/** Thread counts (top-level Notes only: a thread with five replies is one). */
export type ArticleNotesSummary = {
  /** Core Notes are usable for this story. When false there is nothing to show. */
  available: boolean;
  canView: boolean;
  openCount: number;
  resolvedCount: number;
  /** The ordinary post editor. WordPress documents no deep link to the Notes panel. */
  editUrl: string;
};

export type ArticleNotePreview = {
  id: number;
  author: { id: number; name: string; avatarUrl?: string | null };
  /** Plain text, already sanitised and truncated by the server. */
  excerpt: string;
  createdAt: string;
  updatedAt?: string | null;
  replyCount: number;
};

export type ArticleNotesResponse = { summary: ArticleNotesSummary; open: ArticleNotePreview[] };

/** How many open threads the Story Workspace previews. Matches the server's default. */
export const NOTES_PREVIEW_LIMIT = 3;

/** The summary when there is something honest to show, otherwise null. */
export function visibleNotes(notes: ArticleNotesSummary | null | undefined): ArticleNotesSummary | null {
  return notes && notes.available && notes.canView ? notes : null;
}

const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;

/** "3 open notes" */
export const openNotesLabel = (open: number) => count(open, "open note");
/** The Planning tooltip: "3 open article notes" */
export const openArticleNotesLabel = (open: number) => count(open, "open article note");
export const resolvedNotesLabel = (resolved: number) => `${resolved} resolved`;
export const repliesLabel = (replies: number) => count(replies, "reply", "replies");

/** "+4 more open notes", or null when every open thread is already shown. */
export function moreOpenNotesLabel(open: number, shown: number): string | null {
  const rest = open - shown;
  return rest > 0 ? `+${rest} more open ${rest === 1 ? "note" : "notes"}` : null;
}

/** Initials for an avatar fallback: "Caroline Elrod" is "CE", "madonna" is "M". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.length === 1 ? [words[0]!] : [words[0]!, words[words.length - 1]!];
  return letters.map((word) => Array.from(word)[0]!.toLocaleUpperCase()).join("");
}

/** What a PlanningStory contributes to a dense list: a count, or nothing. */
export function openNotesSignal(notes: ArticleNotesSummary | null | undefined): number {
  const visible = visibleNotes(notes);
  return visible && visible.openCount > 0 ? visible.openCount : 0;
}
