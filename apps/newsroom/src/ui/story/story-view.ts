/**
 * Where in a Story the reader is (docs/story-screen.md).
 *
 * A Story has two workspaces, **Plan** and **Write**, side by side as tabs
 * under the Story header. They are places to work, never lifecycle stages:
 * moving between them changes nothing about the Story.
 *
 * Review, History and a Transcript are focused views reached deliberately
 * (the header's Review action or status, the overflow menu, a transcript in
 * Plan's Reporting), each with a way back to the workspace. They are never
 * tabs.
 *
 * The address carries all of it, so a link, Back/Forward and a reload land
 * in the same place:
 *
 * | Address | Shows |
 * | --- | --- |
 * | `?view=plan` / `?view=write` | that workspace |
 * | `?view=plan&section=reporting` | Plan, at a section |
 * | `?view=review` / `?view=history` | the focused view |
 * | `?transcript=<id>` | the transcript, focused, over Plan |
 * | (none) | the default workspace for this Story (`defaultWorkspace`) |
 *
 * Older links keep working: `?view=reporting`, `?tab=reporting`,
 * `?appointment=` and `?capture=` open Plan at Reporting; `?tab=plan` opens
 * Plan; `?tab=production` opens Plan at To do (where media assignments now
 * live); `?tab=write`, `?tab=live` and `?tab=publish` open Write;
 * `?tab=history` opens History.
 */

export const STORY_WORKSPACES = ["plan", "write"] as const;
export type StoryWorkspace = (typeof STORY_WORKSPACES)[number];

/** A focused view over the workspaces. `null` is the workspace itself. */
export const STORY_MODES = ["review", "history", "transcript"] as const;
export type StoryMode = (typeof STORY_MODES)[number];

/** Plan's sections, in reading order: what the jump links and old links can name. */
export const PLAN_SECTIONS = ["brief", "reporting", "todo", "activity"] as const;
export type PlanSection = (typeof PLAN_SECTIONS)[number];

/** What a capture shortcut asks Plan's Reporting to open. */
export const CAPTURE_INTENTS = ["note", "record", "file", "photo", "link", "transcript"] as const;
export type CaptureIntent = (typeof CAPTURE_INTENTS)[number];

export type StoryLocation = {
  /** The workspace the address names, or `null` when it names none (the Story's default applies). */
  workspace: StoryWorkspace | null;
  mode: StoryMode | null;
  section: PlanSection | null;
  capture: CaptureIntent | null;
  transcript: number | null;
  appointment: string;
};

export type StoryPlace = { workspace?: StoryWorkspace | null; mode?: StoryMode | null; section?: PlanSection | null; capture?: CaptureIntent | null; transcript?: number | null; appointment?: string | null };

const pick = <T extends string>(values: readonly T[], value: string | null): T | null => (value !== null && (values as readonly string[]).includes(value) ? (value as T) : null);

export function parseStoryLocation(search: string): StoryLocation {
  const params = new URLSearchParams(search);
  const view = params.get("view") ?? "";
  const legacy = params.get("tab") ?? "";
  const capture = pick(CAPTURE_INTENTS, params.get("capture"));
  const appointment = params.get("appointment") ?? "";
  const transcriptId = Number(params.get("transcript"));
  const transcript = Number.isSafeInteger(transcriptId) && transcriptId > 0 ? transcriptId : null;
  let section = pick(PLAN_SECTIONS, params.get("section"));
  let workspace = pick(STORY_WORKSPACES, view);
  let mode: StoryMode | null = view === "review" || view === "history" ? view : null;

  if (!workspace && !mode) {
    // Reporting is Plan's Reporting section now; every way that used to open it still does.
    if (view === "reporting" || legacy === "reporting" || capture || appointment) { workspace = "plan"; section ??= "reporting"; }
    else if (legacy === "history") mode = "history";
    else if (legacy === "plan") workspace = "plan";
    else if (legacy === "production") { workspace = "plan"; section ??= "todo"; }
    else if (legacy === "write" || legacy === "live" || legacy === "publish") workspace = "write";
  }
  // A transcript is Reporting material: it opens focused, over Plan.
  if (transcript !== null && !mode) { mode = "transcript"; workspace = "plan"; section ??= "reporting"; }
  // A section only means something in Plan.
  if (section && !workspace && !mode) workspace = "plan";
  return { workspace, mode, section, capture, transcript, appointment };
}

/**
 * The address for a place in the Story, keeping unrelated parameters and
 * dropping everything the old layouts used. One-shot intents (a capture, an
 * appointment) are consumed: going back to the same workspace must not
 * replay them.
 */
export function storyLocationSearch(search: string, next: StoryPlace): string {
  const params = new URLSearchParams(search);
  for (const key of ["tab", "view", "section", "capture", "transcript", "appointment"]) params.delete(key);
  if (next.mode === "review" || next.mode === "history") params.set("view", next.mode);
  else if (next.mode === "transcript" && next.transcript) params.set("transcript", String(next.transcript));
  else if (next.workspace) params.set("view", next.workspace);
  const plan = !next.mode && next.workspace === "plan";
  if (plan && next.section) params.set("section", next.section);
  if (plan && next.capture) params.set("capture", next.capture);
  if (plan && next.appointment) params.set("appointment", next.appointment);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * Which workspace a Story opens in when the address names none:
 *
 * 1. a Story with no article text yet (a fresh Pitch) opens Plan, where its
 *    assignment is;
 * 2. otherwise the workspace this reader last used on this Story;
 * 3. otherwise Write.
 *
 * Never the lifecycle: a Story in Reporting with a drafted body opens Write.
 */
export function defaultWorkspace(input: { hasArticleText: boolean; remembered: StoryWorkspace | null }): StoryWorkspace {
  if (!input.hasArticleText) return "plan";
  return input.remembered ?? "write";
}

/** Whether a Lexical body (or an archived HTML body) holds anything a reader would read. Empty paragraphs are not content. */
export function hasArticleText(body: unknown, legacyHtml?: unknown): boolean {
  if (typeof legacyHtml === "string" && legacyHtml.replace(/<[^>]*>/g, "").trim()) return true;
  const visit = (node: unknown, depth: number): boolean => {
    if (!node || typeof node !== "object" || depth > 64) return false;
    const record = node as { text?: unknown; children?: unknown; fields?: unknown; type?: unknown };
    if (typeof record.text === "string" && record.text.trim()) return true;
    // A block (photo, quote, embed…) is content even without a text node.
    if (record.type === "block" && record.fields && typeof record.fields === "object") return true;
    return Array.isArray(record.children) && record.children.some((child) => visit(child, depth + 1));
  };
  const root = body && typeof body === "object" ? (body as { root?: unknown }).root : null;
  return visit(root, 0);
}
