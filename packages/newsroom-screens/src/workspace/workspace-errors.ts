import { describeEditorialError } from "../editorial/editorial-model";

export type WorkspaceError = {
  message: string;
  status: number | null;
  code: string;
  /** The record changed under the editor (HTTP 409). */
  conflict: boolean;
  forbidden: boolean;
  notFound: boolean;
};

const CONFLICT_CODES = new Set(["byline_stale_record", "byline_brief_conflict", "byline_resource_conflict", "byline_story_collection_conflict", "byline_revision_conflict"]);

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; data?: { status?: unknown } | null; response?: { status?: unknown } };
  for (const value of [record.data?.status, record.status, record.response?.status]) {
    const number = typeof value === "string" ? Number(value) : value;
    if (typeof number === "number" && Number.isFinite(number) && number >= 100) return number;
  }
  return null;
}

/** One safe, classified view of a failed request. Never exposes a raw server response. */
export function workspaceError(error: unknown, fallback = "That couldn't be saved. Try again."): WorkspaceError {
  const status = statusOf(error);
  const code = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? String((error as { code: string }).code) : "";
  const conflict = status === 409 || CONFLICT_CODES.has(code);
  const forbidden = status === 401 || status === 403;
  const notFound = status === 404;
  let message = describeEditorialError(error, fallback);
  if (conflict && !/changed|reload/i.test(message)) message = "Someone else changed this while you were editing. Reload to see their version.";
  if (code === "rest_cookie_invalid_nonce") message = "Your session expired. Reload the page and try again.";
  return { message, status, code, conflict, forbidden, notFound };
}
