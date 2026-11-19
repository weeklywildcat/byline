"use client";

import type { ImportIssue } from "../../polls/engine/xlsform";
import type { SurveyDefinition } from "../../polls/engine/types";
import type { linkedPolls, pollsOverview, surveyDetail, surveyResults } from "../../polls/server";
import { toast } from "sonner";
import { ApiError, getJson, patchJson, postJson } from "../story/api";

/**
 * Poll Studio's reads and writes, through `/api/byline/polls/*` as the
 * signed-in account. The server re-checks every one against the poll.
 */
export type PollsOverview = Awaited<ReturnType<typeof pollsOverview>>;
export type SurveyDetail = Awaited<ReturnType<typeof surveyDetail>>;
export type SurveyResultsView = Awaited<ReturnType<typeof surveyResults>>;
export type LinkedPolls = Awaited<ReturnType<typeof linkedPolls>>;
export type ImportPreview = { definition: SurveyDefinition; issues: ImportIssue[]; source: { filename: string; sha256: string; bytes: number } };

export const pollKeys = {
  all: ["byline", "polls"] as const,
  overview: () => [...pollKeys.all, "overview"] as const,
  survey: (id: number) => [...pollKeys.all, "survey", id] as const,
  results: (id: number, filters: string) => [...pollKeys.all, "results", id, filters] as const,
  people: () => [...pollKeys.all, "people"] as const,
  linked: (kind: "story" | "collection", id: number) => [...pollKeys.all, "linked", kind, id] as const
};

export const fetchOverview = (api: string) => getJson<PollsOverview>(api, "/byline/polls");
export const fetchSurvey = (api: string, id: number) => getJson<SurveyDetail>(api, `/byline/polls/surveys/${id}`);
export const fetchResults = (api: string, id: number, filters: string) => getJson<SurveyResultsView>(api, `/byline/polls/surveys/${id}/results${filters ? `?${filters}` : ""}`);
export const fetchPeople = (api: string) => getJson<{ people: Array<{ id: number; name: string; role: string }> }>(api, "/byline/polls/people");
export const fetchLinks = (api: string, search: string) => getJson<{ stories: Array<{ id: number; title: string }>; collections: Array<{ id: number; title: string }> }>(api, `/byline/polls/links?search=${encodeURIComponent(search)}`);
export const createSurvey = (api: string, body: { title?: string; definition?: SurveyDefinition; sourceFilename?: string; example?: boolean }) => postJson<{ id: number }>(api, "/byline/polls/surveys", body);
export const updateSurvey = (api: string, id: number, body: Record<string, unknown>) => patchJson<SurveyDetail>(api, `/byline/polls/surveys/${id}`, body);
export const publishSurvey = (api: string, id: number, body: { draftRevision: number; note?: string }) => postJson<SurveyDetail>(api, `/byline/polls/surveys/${id}/publish`, body);
export const deleteSurvey = (api: string, id: number, confirmTitle: string) => postJson<{ deleted: true }>(api, `/byline/polls/surveys/${id}/delete`, { confirmTitle });
export const saveLocation = (api: string, id: number | null, body: { name?: string; notes?: string; active?: boolean }) => (id ? patchJson<{ id: number }>(api, `/byline/polls/locations/${id}`, body) : postJson<{ id: number }>(api, "/byline/polls/locations", body));
export const createSession = (api: string, body: { surveyId: number; locationId?: number | null; locationName?: string; period?: string; method?: string }) => postJson<{ id: string }>(api, "/byline/polls/sessions", body);
export const endSession = (api: string, id: string) => postJson<{ ended: true }>(api, `/byline/polls/sessions/${id}/end`, {});
export const startKiosk = (api: string, id: string, pin: string) => postJson<{ kiosk: string }>(api, `/byline/polls/sessions/${id}/kiosk`, { pin });
export type PairingCode = { code: string; expiresAt: string; replaces: boolean };
/** A single-use six-digit code for a device to type at /poll, lasting up to two days. `pin` may be left out to keep the PIN of a code still pending. */
export const preparePairing = (api: string, id: string, body: { pin?: string; replaceDevice?: boolean; expiresInMinutes?: number }) => postJson<PairingCode>(api, `/byline/polls/sessions/${id}/pairing`, body);
export const cancelPairing = (api: string, id: string) => postJson<{ cancelled: true }>(api, `/byline/polls/sessions/${id}/pairing/cancel`, {});
export const createResultsDataset = (api: string, id: number, filters: string) => postJson<{ datasetId: number; rows: number; withheld: number }>(api, `/byline/polls/surveys/${id}/dataset${filters ? `?${filters}` : ""}`, {});
export const fetchLinkedPolls = (api: string, kind: "story" | "collection", id: number) => getJson<LinkedPolls>(api, `/byline/polls/linked?${kind}=${id}`);

/** Uploads a workbook for validation. Nothing is saved. */
export async function uploadWorkbook(api: string, file: File): Promise<ImportPreview> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${api}/byline/polls/import`, { method: "POST", body: form, credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? "Byline couldn't read that workbook.", response.status, body.data ?? {});
  return body as ImportPreview;
}

export const fileHref = (api: string, file: string) => `${api}/byline/polls/files/${file}`;
export const workbookHref = (api: string, id: number, versionId?: number) => `${api}/byline/polls/surveys/${id}/workbook${versionId ? `?version=${versionId}` : ""}`;
/**
 * Saves one of the newsroom's files. A plain `<a download>` is fetched by Safari's
 * download manager, which sends neither an `Origin` nor a `Sec-Fetch-Site` header, so
 * Payload's CSRF check drops the session cookie and the file comes back as a 401 JSON
 * body. Fetching it here, like every other call, sends the cookie, and the saved
 * file is the response itself.
 */
export async function downloadFile(href: string, fallbackName: string) {
  const response = await fetch(href, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message ?? "Byline couldn't download that file.", response.status, body.data ?? {});
  }
  const named = /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1];
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = named || fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A menu item or button's click handler that saves `href`, and says so if it can't. */
export const saveFile = (href: string, fallbackName: string) => () => {
  downloadFile(href, fallbackName).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Byline couldn't download that file."));
};

export const exportHref = (api: string, id: number, kind: "responses" | "summary", filters: string) => `${api}/byline/polls/surveys/${id}/export/${kind}${filters ? `?${filters}` : ""}`;

export const STATUS_LABEL: Record<string, string> = { draft: "Draft", open: "Open", closed: "Closed", archived: "Archived" };

export function formatWhen(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}
