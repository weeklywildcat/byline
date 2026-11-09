import { resolveStep, schoolYearFor, type ReviewWorkflowDef, type RoleAssignmentDef, type RoutingDirectory, type RoutingFix, type RoutingStory } from "./newsroom-roles";
import { addDays } from "./dates";

/**
 * Starting a new school year (docs/newsroom-roles.md#school-years): who
 * returns, which responsibilities carry over, who leaves, what work is left
 * behind, and whether review routing still works. Pure; the server loads the
 * facts and applies the plan in one transaction. A new year never rewrites
 * the old one: memberships, authorship and review history stay as they were.
 */

export type YearInput = { name?: unknown; startsOn?: unknown; endsOn?: unknown };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const real = (day: string) => DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && addDays(day, 0) === day;

/** The next school year after one, or the one a day falls in when there is none: "2027–28", 1 August to 31 July. */
export function suggestYear(active: { endsOn: string } | null, today: string): { name: string; startsOn: string; endsOn: string } {
  return schoolYearFor(active ? addDays(active.endsOn, 1) : today);
}

export function cleanYear(input: YearInput, existing: ReadonlyArray<{ name: string; startsOn: string; endsOn: string }>): { ok: true; value: { name: string; startsOn: string; endsOn: string } } | { ok: false; problems: string[] } {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : "";
  const startsOn = typeof input.startsOn === "string" ? input.startsOn : "";
  const endsOn = typeof input.endsOn === "string" ? input.endsOn : "";
  const problems: string[] = [];
  if (!name) problems.push("Give the school year a name, like 2027–28.");
  if (!real(startsOn)) problems.push("Choose the first day.");
  if (!real(endsOn)) problems.push("Choose the last day.");
  if (real(startsOn) && real(endsOn)) {
    if (endsOn <= startsOn) problems.push("The last day must come after the first.");
    if (existing.some((year) => year.name === name)) problems.push(`There is already a school year named ${name}.`);
    const overlap = existing.find((year) => startsOn <= year.endsOn && endsOn >= year.startsOn);
    if (overlap) problems.push(`These dates overlap ${overlap.name}.`);
  }
  return problems.length ? { ok: false, problems } : { ok: true, value: { name, startsOn, endsOn } };
}

/* --------------------------------------------------------------------- plan */

export type RolloverPlan = {
  /** Accounts who stay on the staff this year. */
  returning: number[];
  /** Last year's role assignments that carry over. Anyone not returning never carries. */
  carry: number[];
  /** The public title a returning person holds this year, where it changed. */
  titles: Record<string, string>;
  /** Departing accounts whose sign-in is also disabled. Off by default: leaving the staff isn't leaving the newsroom's record. */
  disable: number[];
};

const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];

export function cleanPlan(input: Record<string, unknown> | null | undefined, valid: { users: ReadonlySet<number>; assignments: ReadonlyMap<number, { userId: number }> }): RolloverPlan {
  const returning = ids(input?.returning).filter((id) => valid.users.has(id));
  const staying = new Set(returning);
  const carry = ids(input?.carry).filter((id) => {
    const assignment = valid.assignments.get(id);
    return assignment !== undefined && staying.has(assignment.userId);
  });
  const titles: Record<string, string> = {};
  if (input?.titles && typeof input.titles === "object") {
    for (const [key, value] of Object.entries(input.titles as Record<string, unknown>)) {
      const id = Number(key);
      if (staying.has(id) && typeof value === "string" && value.trim()) titles[String(id)] = value.trim().slice(0, 80);
    }
  }
  const disable = ids(input?.disable).filter((id) => valid.users.has(id) && !staying.has(id));
  return { returning, carry, titles, disable };
}

/** Everyone on last year's staff who isn't returning. */
export const departing = (staff: readonly number[], plan: Pick<RolloverPlan, "returning">): number[] => staff.filter((id) => !plan.returning.includes(id));

/* ------------------------------------------------------------ unfinished work */

export type OpenStory = { id: number; title: string; phase: string; deadline: string | null; writerIds: readonly number[]; editorId: number | null };
export type Unfinished = { userId: number; stories: Array<Pick<OpenStory, "id" | "title" | "phase" | "deadline"> & { as: "writer" | "editor" }> };

const OPEN_PHASES = new Set(["reporting", "drafting", "review", "ready"]);

/** The in-progress Stories each departing person is on. Nothing is reassigned: the editor decides, with the list in front of them. */
export function unfinishedWork(stories: readonly OpenStory[], leaving: readonly number[]): Unfinished[] {
  const result: Unfinished[] = [];
  for (const userId of leaving) {
    const mine = stories
      .filter((story) => OPEN_PHASES.has(story.phase) && (story.writerIds.includes(userId) || story.editorId === userId))
      .map((story) => ({ id: story.id, title: story.title, phase: story.phase, deadline: story.deadline, as: story.editorId === userId && !story.writerIds.includes(userId) ? ("editor" as const) : ("writer" as const) }))
      .sort((a, b) => a.id - b.id);
    if (mine.length) result.push({ userId, stories: mine });
  }
  return result;
}

/* -------------------------------------------------------------- routing check */

export type RoutingIssue = { workflowId: number; workflow: string; step: string; message: string; fix: RoutingFix };

/**
 * Whether review routing would still work in the new year: every active
 * workflow's role and person steps are resolved by the real resolver
 * (`resolveStep`) for a story in each Section and for each media type, against
 * the directory as it will be once the plan is applied. Steps that depend on a
 * particular Story's editor aren't checked here: that is a fact about the
 * Story, not the year.
 */
export function routingCheck(workflows: readonly ReviewWorkflowDef[], directory: RoutingDirectory, media: readonly string[]): RoutingIssue[] {
  const firstSection = [...directory.sections][0];
  const stories: RoutingStory[] = [
    ...[...directory.sections].map(([id, name]): RoutingStory => ({ id: 0, title: name, sectionId: id, sectionName: name, format: "standard", hasVisuals: false, mediaTypes: [], editorId: null, writerIds: [] })),
    // A story always has a Section by the time it is submitted, so a media check uses one.
    ...media.map((type): RoutingStory => ({ id: 0, title: type, sectionId: firstSection?.[0] ?? null, sectionName: firstSection?.[1] ?? null, format: "standard", hasVisuals: true, mediaTypes: [type], editorId: null, writerIds: [] }))
  ];
  if (!stories.length) stories.push({ id: 0, title: "A story", sectionId: null, sectionName: null, format: "standard", hasVisuals: false, mediaTypes: [], editorId: null, writerIds: [] });
  const issues: RoutingIssue[] = [];
  const seen = new Set<string>();
  for (const workflow of workflows) {
    if (workflow.archived) continue;
    for (const step of workflow.steps) {
      if (step.resolver === "story-editor") continue;
      for (const story of stories) {
        const result = resolveStep(step, story, directory);
        if (result.kind !== "failed") continue;
        const key = `${workflow.id}:${step.stepId}:${result.failure}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({ workflowId: workflow.id, workflow: workflow.name, step: step.label, message: result.failure, fix: result.fix });
      }
    }
  }
  return issues;
}

/** Last year's assignments as next year's, for the people and responsibilities the plan carries. */
export function carriedAssignments(previous: readonly RoleAssignmentDef[], plan: Pick<RolloverPlan, "carry">, yearId: number): RoleAssignmentDef[] {
  const keep = new Set(plan.carry);
  return previous.filter((assignment) => keep.has(assignment.id)).map((assignment) => ({ ...assignment, yearId }));
}
