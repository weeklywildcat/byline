import type { Endpoint } from "payload";
import { body, handle, idParam } from "../newsroom/http";
import { createReportingNote, deleteReportingMaterial, setSourceGroundRules, updateReportingFile, updateReportingNote, uploadReportingFile, type FileInput, type NoteInput } from "./capture";
import { storyReporting } from "./material";
import {
  createSelection,
  deleteSelection,
  editTranscript,
  importTranscript,
  overrideOffRecord,
  quoteProvenance,
  requestTranscription,
  storyQuotes,
  transcriptDetail,
  updateSelection,
  verifySelection,
  type SelectionInput,
  type TranscriptEdit
} from "./transcripts";

/**
 * Reporting's API (`/api/byline/...`). Every handler runs as the signed-in
 * person (`handle` re-checks the account), and every read and write goes
 * through the reporting collections' access, so confidentiality and Story
 * scope are enforced by the server, never by which buttons a screen shows.
 *
 * Multipart requests follow Payload's convention: the file plus a `_payload`
 * JSON field with the other values.
 */
export const reportingEndpoints: Endpoint[] = [
  // The Story's Reporting workspace: material feed (summaries only), sources, appointments, capabilities.
  { path: "/byline/stories/:id/reporting", method: "get", handler: handle((ctx, req) => storyReporting(ctx, idParam(req))) },
  { path: "/byline/stories/:id/reporting/notes", method: "post", handler: handle(async (ctx, req) => createReportingNote(ctx, idParam(req), await body<NoteInput>(req))) },
  { path: "/byline/stories/:id/reporting/files", method: "post", handler: handle(async (ctx, req) => uploadReportingFile(ctx, idParam(req), await body<FileInput>(req))) },
  { path: "/byline/stories/:id/reporting/transcripts", method: "post", handler: handle(async (ctx, req) => importTranscript(ctx, idParam(req), await body(req))) },
  { path: "/byline/stories/:id/reporting/quotes", method: "get", handler: handle((ctx, req) => storyQuotes(ctx, idParam(req))) },
  { path: "/byline/reporting/notes/:id", method: "patch", handler: handle(async (ctx, req) => updateReportingNote(ctx, idParam(req), await body(req))) },
  { path: "/byline/reporting/notes/:id", method: "delete", handler: handle((ctx, req) => deleteReportingMaterial(ctx, "reporting-notes", idParam(req))) },
  { path: "/byline/reporting/files/:id", method: "patch", handler: handle(async (ctx, req) => updateReportingFile(ctx, idParam(req), await body(req))) },
  { path: "/byline/reporting/files/:id", method: "delete", handler: handle((ctx, req) => deleteReportingMaterial(ctx, "reporting-files", idParam(req))) },
  { path: "/byline/reporting/files/:id/transcribe", method: "post", handler: handle((ctx, req) => requestTranscription(ctx, idParam(req))) },
  { path: "/byline/reporting/sources/:id/ground-rules", method: "patch", handler: handle(async (ctx, req) => setSourceGroundRules(ctx, idParam(req), await body(req))) },
  // Transcripts load only when opened.
  { path: "/byline/reporting/transcripts/:id", method: "get", handler: handle((ctx, req) => transcriptDetail(ctx, idParam(req))) },
  { path: "/byline/reporting/transcripts/:id", method: "patch", handler: handle(async (ctx, req) => editTranscript(ctx, idParam(req), await body<TranscriptEdit>(req))) },
  { path: "/byline/reporting/transcripts/:id/selections", method: "post", handler: handle(async (ctx, req) => createSelection(ctx, idParam(req), await body<SelectionInput>(req))) },
  { path: "/byline/reporting/selections/:id", method: "patch", handler: handle(async (ctx, req) => updateSelection(ctx, idParam(req), await body<SelectionInput>(req))) },
  { path: "/byline/reporting/selections/:id", method: "delete", handler: handle((ctx, req) => deleteSelection(ctx, idParam(req))) },
  { path: "/byline/reporting/selections/:id/verify", method: "post", handler: handle(async (ctx, req) => verifySelection(ctx, idParam(req), (await body<{ verified?: unknown }>(req)).verified !== false)) },
  { path: "/byline/reporting/selections/:id/off-record-override", method: "post", handler: handle(async (ctx, req) => overrideOffRecord(ctx, idParam(req), await body(req))) },
  { path: "/byline/reporting/selections/:id/provenance", method: "get", handler: handle((ctx, req) => quoteProvenance(ctx, idParam(req))) }
];
