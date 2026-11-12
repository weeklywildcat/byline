"use client";

import type { CaptureResult } from "../../reporting/capture";
import type { ReportingWorkspace } from "../../reporting/material";
import type { SelectionView, TranscriptDetail } from "../../reporting/transcripts";
import { deleteJson, getJson, patchJson, postJson } from "../story/api";

export type { CaptureResult, ReportingWorkspace, SelectionView, TranscriptDetail };

/**
 * Reporting's client calls. Everything goes through `/api/byline/...`, where
 * the server resolves context and access; nothing here decides who may see what.
 */
export const reportingKey = (storyId: number) => ["byline", "story-reporting", storyId] as const;
export const transcriptKey = (id: number) => ["byline", "reporting-transcript", id] as const;

export const loadReporting = (api: string, storyId: number) => getJson<ReportingWorkspace>(api, `/byline/stories/${storyId}/reporting`);
export const loadTranscript = (api: string, id: number) => getJson<TranscriptDetail>(api, `/byline/reporting/transcripts/${id}`);
export const loadQuotes = (api: string, storyId: number) => getJson<{ quotes: SelectionView[] }>(api, `/byline/stories/${storyId}/reporting/quotes`);
export const saveNote = (api: string, storyId: number, data: Record<string, unknown>) => postJson<CaptureResult>(api, `/byline/stories/${storyId}/reporting/notes`, data);
export const editNote = (api: string, id: number, data: Record<string, unknown>) => patchJson<{ id: number }>(api, `/byline/reporting/notes/${id}`, data);
export const removeNote = (api: string, id: number) => deleteJson<{ id: number }>(api, `/byline/reporting/notes/${id}`, {});
export const editFile = (api: string, id: number, data: Record<string, unknown>) => patchJson<{ id: number }>(api, `/byline/reporting/files/${id}`, data);
export const removeFile = (api: string, id: number) => deleteJson<{ id: number }>(api, `/byline/reporting/files/${id}`, {});
export const saveGroundRules = (api: string, sourceId: number, data: Record<string, unknown>) => patchJson<unknown>(api, `/byline/reporting/sources/${sourceId}/ground-rules`, data);
export const editTranscript = (api: string, id: number, data: Record<string, unknown>) => patchJson<{ updatedAt: string; segments: TranscriptDetail["segments"] }>(api, `/byline/reporting/transcripts/${id}`, data);
export const saveSelection = (api: string, transcriptId: number, data: Record<string, unknown>) => postJson<SelectionView>(api, `/byline/reporting/transcripts/${transcriptId}/selections`, data);
export const editSelection = (api: string, id: number, data: Record<string, unknown>) => patchJson<{ id: number }>(api, `/byline/reporting/selections/${id}`, data);
export const removeSelection = (api: string, id: number) => deleteJson<{ id: number }>(api, `/byline/reporting/selections/${id}`, {});
export const verifySelection = (api: string, id: number, verified: boolean) => postJson<{ state: string }>(api, `/byline/reporting/selections/${id}/verify`, { verified });
export const overrideOffRecord = (api: string, id: number, reason: string) => postJson<{ id: number }>(api, `/byline/reporting/selections/${id}/off-record-override`, { reason });

/** Multipart upload with progress, following Payload's convention (`file` plus a `_payload` JSON field). */
export function uploadFile<T>(api: string, path: string, file: Blob, filename: string, payload: Record<string, unknown>, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const form = new FormData();
    form.set("file", file, filename);
    form.set("_payload", JSON.stringify(payload));
    const request = new XMLHttpRequest();
    request.open("POST", `${api}${path}`);
    request.withCredentials = true;
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    request.onerror = () => reject(Object.assign(new Error("The connection dropped. Retry when you're back online."), { status: 0 }));
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(request.responseText) as Record<string, unknown>; } catch { /* non-JSON */ }
      if (request.status >= 200 && request.status < 300) resolve(body as T);
      else reject(Object.assign(new Error(request.status === 413 ? "That file is too large to upload." : String(body.message ?? "The upload didn't finish.")), { status: request.status }));
    };
    request.send(form);
  });
}

/** An opaque key for one capture; the server returns the first record for a retried key. */
export function newClientKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function positionLabel(ms: number | null): string {
  if (ms === null) return "--:--";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(total % 60).padStart(2, "0")}`;
}
