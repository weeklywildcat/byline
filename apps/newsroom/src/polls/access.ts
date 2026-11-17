import { APIError } from "payload";
import { atLeast, relationIds, sameId, type NewsroomUser } from "../access/user";

/**
 * Who may do what in Wildcat Polls (docs/wildcat-polls.md#permissions).
 * The one place these decisions are made; every endpoint calls it.
 *
 * - Administrators: everything, including deleting a poll and its responses.
 * - Editors: create, edit, publish and close any poll; manage locations and
 *   per-poll grants; read results; run fieldwork.
 * - Staff: run fieldwork for polls granted to them (or open to all staff), and
 *   read results only when granted. A grant never makes anyone an editor.
 */

export type SurveyGrants = { openToAllStaff?: boolean | null; interviewers?: unknown; analysts?: unknown };

export const canManagePolls = (user: NewsroomUser | null) => atLeast(user, "editor");
export const canAdministerPolls = (user: NewsroomUser | null) => atLeast(user, "administrator");

export function canInterview(user: NewsroomUser | null, survey: SurveyGrants): boolean {
  if (!user) return false;
  if (atLeast(user, "editor") || survey.openToAllStaff === true) return true;
  return relationIds(survey.interviewers).some((id) => sameId(id, user.id));
}

export function canViewResults(user: NewsroomUser | null, survey: SurveyGrants): boolean {
  if (!user) return false;
  if (atLeast(user, "editor")) return true;
  return relationIds(survey.analysts).some((id) => sameId(id, user.id));
}

export function canSeeSurvey(user: NewsroomUser | null, survey: SurveyGrants): boolean {
  return canInterview(user, survey) || canViewResults(user, survey);
}

export function requireManager(user: NewsroomUser | null): asserts user is NewsroomUser {
  if (!canManagePolls(user)) throw new APIError("Only editors can change polls.", 403);
}

export function requireAdministrator(user: NewsroomUser | null): asserts user is NewsroomUser {
  if (!canAdministerPolls(user)) throw new APIError("Only administrators can do that.", 403);
}

/** A session's interviewer may run it; so may any editor (to end one left open). */
export function canRunSession(user: NewsroomUser | null, session: { interviewerId: number }): boolean {
  return Boolean(user && (atLeast(user, "editor") || sameId(user.id, session.interviewerId)));
}
