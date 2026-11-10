"use client";

import type { DataQuery, DatasetSchema } from "@byline/data";
import type { DataOverview, DatasetDetail, DataRow, ImportPreviewResult, ProjectDetail, RowChange, RowsPage } from "../../data/server";
import { getJson, patchJson, postJson } from "../story/api";

/**
 * The Data workspace's reads and writes, all through `/api/byline/data/*`
 * as the signed-in user. The server re-checks every one; hiding a control is
 * never the permission.
 */
export const dataKeys = {
  all: ["byline", "data"] as const,
  overview: () => [...dataKeys.all, "overview"] as const,
  dataset: (id: number) => [...dataKeys.all, "dataset", id] as const,
  rows: (id: number, query?: unknown) => [...dataKeys.all, "dataset", id, "rows", query ?? "all"] as const,
  project: (id: number) => [...dataKeys.all, "project", id] as const
};

export const fetchOverview = (api: string) => getJson<DataOverview>(api, "/byline/data");
export const fetchDataset = (api: string, id: number) => getJson<DatasetDetail>(api, `/byline/data/datasets/${id}`);
export const fetchRows = (api: string, id: number, query: Partial<DataQuery>) => getJson<RowsPage>(api, `/byline/data/datasets/${id}/rows?query=${encodeURIComponent(JSON.stringify(query))}`);

/** Every row of a dataset the browser may hold whole (pages of 1,000, bounded by the caller). */
export async function fetchAllRows(api: string, id: number, max: number): Promise<RowsPage> {
  const first = await fetchRows(api, id, { limit: 1000, offset: 0, sort: [{ field: "$position", direction: "asc" }] });
  const rows = [...first.rows];
  while (rows.length < Math.min(first.total, max)) {
    const page = await fetchRows(api, id, { limit: 1000, offset: rows.length, sort: [{ field: "$position", direction: "asc" }] });
    if (!page.rows.length) break;
    rows.push(...page.rows);
  }
  return { ...first, rows };
}

export const createDataset = (api: string, input: { title: string; description?: string; schema?: DatasetSchema }) => postJson<{ id: number; key: string }>(api, "/byline/data/datasets", input);
export const saveDataset = (api: string, id: number, input: { title?: string; description?: string; schema?: DatasetSchema; baseSchema?: DatasetSchema }) => patchJson<DatasetDetail>(api, `/byline/data/datasets/${id}`, input);
export const deleteDataset = (api: string, id: number) => fetch(`${api}/byline/data/datasets/${id}`, { method: "DELETE", credentials: "include" }).then(async (response) => {
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? "Byline couldn't delete that dataset.");
});
export const addRows = (api: string, id: number, rows: Array<{ values?: Record<string, unknown>; included?: boolean; recordId?: string }>, after?: number) => postJson<{ rows: DataRow[]; workingRevision: number }>(api, `/byline/data/datasets/${id}/rows`, { rows, after });
export const changeRows = (api: string, id: number, changes: RowChange[]) => patchJson<{ rows: DataRow[]; workingRevision: number }>(api, `/byline/data/datasets/${id}/rows`, { changes });
export const removeRows = (api: string, id: number, ids: string[]) => postJson<{ deleted: number; workingRevision: number }>(api, `/byline/data/datasets/${id}/rows/delete`, { ids });
export const importCsv = (api: string, id: number, input: { text: string; mapping: Array<string | null>; commit: boolean }) => postJson<{ preview: ImportPreviewResult; committed: boolean }>(api, `/byline/data/datasets/${id}/import`, input);
export const publishData = (api: string, id: number, expectedRevision: number) => postJson<{ release: DatasetDetail["release"]; revision: number; reused: boolean }>(api, `/byline/data/datasets/${id}/publish`, { expectedRevision });
export const exportUrl = (api: string, id: number, scope: "public" | "all") => `${api}/byline/data/datasets/${id}/export${scope === "all" ? "?fields=all" : ""}`;

export const fetchProject = (api: string, id: number) => getJson<ProjectDetail>(api, `/byline/data/projects/${id}`);
export const createProject = (api: string, input: { title: string; presentation: string; dataset?: string }) => postJson<{ id: number }>(api, "/byline/data/projects", input);
export const saveProject = (api: string, id: number, input: Record<string, unknown>) => patchJson<ProjectDetail>(api, `/byline/data/projects/${id}`, input);
export const publishProject = (api: string, id: number) => postJson<ProjectDetail>(api, `/byline/data/projects/${id}/publish`, {});
export const unpublishProject = (api: string, id: number) => postJson<ProjectDetail>(api, `/byline/data/projects/${id}/unpublish`, {});
export const searchStories = (api: string, search: string) => getJson<{ stories: Array<{ id: number; headline: string; publishedAt: string | null }> }>(api, `/byline/data/stories?search=${encodeURIComponent(search)}`);
