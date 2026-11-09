import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type CollectionConfig, type Field, type FieldAccess, type PayloadRequest } from "payload";
import { changeReporting, createReporting, readReporting } from "../access/reporting-context";
import { atLeast, newsroomUser, relationChanged, relationId, requestUser, sameId } from "../access/user";
import { normalizeGroundRules, REPORTING_FILE_MIME_TYPES, REPORTING_LIMITS, reportingFileKind } from "../domain/reporting";
import { recordStoryActivity } from "../newsroom/story-activity";
import { privateReportingDir } from "../reporting/paths";
import { queueTranscriptionAfterUpload } from "../reporting/transcription/queue";
import { transcriptSearchText } from "../domain/transcript";

/**
 * Raw reporting material (docs/reporting.md). Four private collections, each
 * the canonical home of one kind of capture. None is versioned, none is public,
 * none advances the public revision, and none appears in any public
 * projection: they are absent from `public/tracking.ts`'s table on purpose.
 *
 * - `reporting-notes`: a reporter's private plain-text notes on a story.
 *   Not Story Notes, which are threaded collaboration.
 * - `reporting-files`: private uploads (interview recordings, PDFs,
 *   documents), stored apart from Media and served only through Payload's
 *   access-checked file route.
 * - `reporting-transcripts`: one transcript per recording, provider-neutral.
 * - `transcript-selections`: highlights and quotes, stored as snapshots.
 *
 * Access is `access/reporting-context.ts`: normal material follows the
 * Story's audience; confidential material only its creator, the Story's
 * assigned editor and administrators.
 */

const systemWrite = ({ req }: { req: PayloadRequest }) => req.context?.bylineSystem === true || req.context?.bylineImport === true;
const hiddenUnlessAdmin = ({ user }: { user: unknown }) => !atLeast(newsroomUser(user), "administrator");

const storyField: Field = { name: "story", type: "relationship", relationTo: "stories", required: true, index: true, access: { update: () => false } };
const confidentialField: Field = {
  name: "confidential",
  type: "checkbox",
  defaultValue: false,
  required: true,
  index: true,
  admin: { description: "Only the creator, the story's assigned editor and administrators can see confidential material." }
};
const createdByField: Field = { name: "createdBy", type: "relationship", relationTo: "users", index: true, admin: { readOnly: true }, access: { create: systemWrite, update: systemWrite } };
const clientKeyField: Field = {
  name: "clientKey",
  type: "text",
  unique: true,
  index: true,
  maxLength: REPORTING_LIMITS.clientKey,
  admin: { hidden: true },
  access: { update: () => false }
};
const groundRulesField: Field = {
  name: "groundRules",
  type: "json",
  admin: { readOnly: true, description: "The ground rules in force when this was captured (a snapshot)." },
  access: { create: systemWrite, update: systemWrite }
};

/** Creator from the request (never the body), and a capture time. */
const stampCreator: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === "create" && !(req.context?.bylineImport === true && data.createdBy)) {
    data.createdBy = requestUser(req)?.id ?? data.createdBy ?? null;
    data.capturedAt = data.capturedAt ?? new Date().toISOString();
  }
  return data;
};

/** A source or appointment named on material must be on the same story. */
const sameStoryContext: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const story = data.story ?? originalDoc?.story;
  for (const [field, collection] of [["source", "sources"], ["appointment", "appointments"]] as const) {
    const id = relationId(data[field]);
    if (id === null || !relationChanged(id, originalDoc?.[field])) continue;
    const found = await req.payload.find({ collection, where: { id: { equals: id } }, depth: 0, limit: 1, overrideAccess: true, select: { story: true }, req });
    if (!sameId(found.docs[0]?.story, story)) throw new APIError(`That ${field} is not on this story.`, 400);
  }
  return data;
};

/** Confidentiality changes are editorial decisions: logged (never the material itself). */
function logConfidentiality(collection: string): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, operation, req }) => {
    if (operation === "update" && previousDoc && Boolean(previousDoc.confidential) !== Boolean(doc.confidential) && req.context?.bylineSystem !== true) {
      await recordStoryActivity(req, doc.story, doc.confidential ? "material-made-confidential" : "material-made-normal", doc.id);
      // Derived material follows its recording (transcripts and their selections).
      if (collection === "reporting-files") await propagateConfidentiality(req, doc.id, Boolean(doc.confidential));
    }
    return doc;
  };
}

async function propagateConfidentiality(req: PayloadRequest, fileId: unknown, confidential: boolean) {
  const transcripts = await req.payload.find({ collection: "reporting-transcripts", where: { file: { equals: relationId(fileId) } }, depth: 0, pagination: false, overrideAccess: true, select: {}, req });
  const ids = transcripts.docs.map((row) => row.id);
  if (!ids.length) return;
  const context = { ...req.context, bylineSystem: true };
  await req.payload.update({ collection: "reporting-transcripts", where: { id: { in: ids } }, data: { confidential }, overrideAccess: true, depth: 0, context, req });
  await req.payload.update({ collection: "transcript-selections", where: { transcript: { in: ids } }, data: { confidential }, overrideAccess: true, depth: 0, context, req });
}

const reportingAdmin = { group: "Reporting", hidden: hiddenUnlessAdmin };

export const ReportingNotes: CollectionConfig = {
  slug: "reporting-notes",
  labels: { singular: "Reporting note", plural: "Reporting notes" },
  admin: { ...reportingAdmin, useAsTitle: "text", defaultColumns: ["text", "story", "createdBy", "capturedAt"] },
  lockDocuments: false,
  access: { read: readReporting(), create: createReporting, update: changeReporting(), delete: changeReporting() },
  hooks: { beforeChange: [stampCreator, sameStoryContext], afterChange: [logConfidentiality("reporting-notes")] },
  fields: [
    storyField,
    { name: "text", type: "textarea", required: true, maxLength: REPORTING_LIMITS.noteText },
    { name: "source", type: "relationship", relationTo: "sources", index: true },
    { name: "appointment", type: "relationship", relationTo: "appointments", index: true },
    confidentialField,
    createdByField,
    { name: "capturedAt", type: "date", index: true, admin: { readOnly: true } },
    clientKeyField
  ]
};

/** The file's kind, its original name and the ground rules are facts of the upload, set by the system. */
const describeUpload: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  const file = req.file;
  if (operation === "create" && file) {
    data.kind = reportingFileKind(String(file.mimetype ?? data.mimeType ?? ""));
    data.originalFilename = data.originalFilename ?? String(file.name ?? data.filename ?? "").slice(0, 255);
  }
  if (operation === "create" && data.groundRules !== undefined) data.groundRules = normalizeGroundRules(data.groundRules);
  return data;
};

/** Removing a recording removes what was derived from it (its transcript and selections). */
const removeDerived = async ({ doc, req }: { doc: { id: unknown }; req: PayloadRequest }) => {
  const transcripts = await req.payload.find({ collection: "reporting-transcripts", where: { file: { equals: doc.id } }, depth: 0, pagination: false, overrideAccess: true, select: {}, req });
  const ids = transcripts.docs.map((row) => row.id);
  if (!ids.length) return;
  await req.payload.delete({ collection: "transcript-selections", where: { transcript: { in: ids } }, overrideAccess: true, req });
  await req.payload.delete({ collection: "reporting-transcripts", where: { id: { in: ids } }, overrideAccess: true, req });
};

export const ReportingFiles: CollectionConfig = {
  slug: "reporting-files",
  labels: { singular: "Reporting file", plural: "Reporting files" },
  admin: { ...reportingAdmin, useAsTitle: "originalFilename", defaultColumns: ["originalFilename", "kind", "story", "createdBy", "capturedAt"] },
  lockDocuments: false,
  upload: {
    // Its own directory: never Media's, never a publication store (reporting/paths.ts).
    staticDir: privateReportingDir(),
    mimeTypes: [...REPORTING_FILE_MIME_TYPES],
    focalPoint: false,
    crop: false,
    // No previews: nothing about a private recording or document is pre-rendered.
    imageSizes: [],
    disableLocalStorage: false,
    // Payload's file route checks this collection's read access for every request (including Range requests for audio).
    modifyResponseHeaders: ({ headers }) => {
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow");
      headers.set("Referrer-Policy", "no-referrer");
      return headers;
    }
  },
  access: { read: readReporting(), create: createReporting, update: changeReporting(), delete: changeReporting() },
  hooks: {
    beforeChange: [stampCreator, sameStoryContext, describeUpload],
    afterChange: [logConfidentiality("reporting-files"), queueTranscriptionAfterUpload],
    afterDelete: [removeDerived]
  },
  fields: [
    storyField,
    { name: "kind", type: "select", required: true, defaultValue: "other", options: ["audio", "document", "image", "other"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })), access: { update: systemWrite } },
    { name: "originalFilename", type: "text", maxLength: 255, access: { update: () => false } },
    { name: "source", type: "relationship", relationTo: "sources", index: true },
    { name: "appointment", type: "relationship", relationTo: "appointments", index: true },
    confidentialField,
    groundRulesField,
    createdByField,
    { name: "capturedAt", type: "date", index: true, admin: { readOnly: true } },
    { name: "durationMs", type: "number", min: 0, admin: { readOnly: true } },
    { name: "sha256", type: "text", index: true, admin: { readOnly: true }, access: { create: systemWrite, update: systemWrite } },
    clientKeyField
  ]
};

/** Transcript text edits keep timing and provenance; the plain-text search projection follows the segments. */
const projectSearchText: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (data.segments !== undefined) {
    data.searchText = transcriptSearchText(Array.isArray(data.segments) ? data.segments : []);
    if (operation === "update" && req.context?.bylineSystem !== true) {
      data.editedBy = requestUser(req)?.id ?? null;
      data.editedAt = new Date().toISOString();
    }
  }
  // Provenance never moves: a transcript belongs to one recording on one story.
  if (operation === "update" && originalDoc && data.file !== undefined && relationChanged(data.file, originalDoc.file)) throw new APIError("A transcript cannot move to another recording.", 400);
  return data;
};

const transcriptState = [
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" }
];

export const ReportingTranscripts: CollectionConfig = {
  slug: "reporting-transcripts",
  labels: { singular: "Transcript", plural: "Transcripts" },
  admin: { ...reportingAdmin, useAsTitle: "id", defaultColumns: ["id", "story", "state", "origin", "updatedAt"] },
  lockDocuments: false,
  access: { read: readReporting(), create: createReporting, update: changeReporting(), delete: changeReporting() },
  hooks: { beforeChange: [stampCreator, projectSearchText] },
  fields: [
    storyField,
    { name: "file", type: "relationship", relationTo: "reporting-files", required: true, unique: true, index: true, access: { update: () => false } },
    // Inherited from the recording when the transcript is made (never asked for again).
    { name: "source", type: "relationship", relationTo: "sources", index: true, access: { update: systemWrite } },
    { name: "appointment", type: "relationship", relationTo: "appointments", index: true, access: { update: systemWrite } },
    { ...confidentialField, access: { update: systemWrite } } as Field,
    groundRulesField,
    { name: "state", type: "select", required: true, defaultValue: "queued", index: true, options: transcriptState, access: { update: systemWrite } },
    { name: "origin", type: "select", required: true, defaultValue: "machine", options: [{ value: "machine", label: "Machine transcript" }, { value: "manual", label: "Manual transcript" }], access: { update: systemWrite } },
    { name: "provider", type: "text", maxLength: 80, access: { update: systemWrite } },
    { name: "model", type: "text", maxLength: 120, access: { update: systemWrite } },
    { name: "language", type: "text", maxLength: 16 },
    { name: "durationMs", type: "number", min: 0, access: { update: systemWrite } },
    // `TranscriptSegment[]` (domain/transcript.ts): provider-neutral, stable segment ids.
    { name: "segments", type: "json" },
    { name: "searchText", type: "textarea", admin: { hidden: true }, access: { create: systemWrite, update: systemWrite } },
    { name: "failure", type: "text", maxLength: 400, access: { update: systemWrite } },
    { name: "attempts", type: "number", defaultValue: 0, admin: { hidden: true }, access: { create: systemWrite, update: systemWrite } },
    { name: "completedAt", type: "date", access: { create: systemWrite, update: systemWrite } },
    createdByField,
    { name: "capturedAt", type: "date", admin: { readOnly: true } },
    { name: "editedBy", type: "relationship", relationTo: "users", admin: { readOnly: true }, access: { create: systemWrite, update: systemWrite } },
    { name: "editedAt", type: "date", admin: { readOnly: true }, access: { create: systemWrite, update: systemWrite } }
  ]
};

/** Verification is only written by the verify endpoint, as the system: never a field a form can set. */
const verificationWrite: FieldAccess = ({ req }) => req.context?.bylineSystem === true || req.context?.bylineVerification === true;

export const TranscriptSelections: CollectionConfig = {
  slug: "transcript-selections",
  labels: { singular: "Transcript selection", plural: "Transcript selections" },
  admin: { ...reportingAdmin, useAsTitle: "text", defaultColumns: ["text", "story", "kind", "state", "updatedAt"] },
  lockDocuments: false,
  access: { read: readReporting(), create: createReporting, update: changeReporting(), delete: changeReporting() },
  hooks: {
    beforeChange: [
      stampCreator,
      ({ data, originalDoc, operation }) => {
        if (operation === "update" && originalDoc && data.transcript !== undefined && relationChanged(data.transcript, originalDoc.transcript)) throw new APIError("A selection cannot move to another transcript.", 400);
        // Changing the words un-verifies them: verification is of exact words against the audio.
        if (operation === "update" && originalDoc?.state === "verified" && data.text !== undefined && data.text !== originalDoc.text) {
          data.state = "saved";
          data.verifiedBy = null;
          data.verifiedAt = null;
        }
        return data;
      }
    ]
  },
  fields: [
    storyField,
    { name: "transcript", type: "relationship", relationTo: "reporting-transcripts", required: true, index: true, access: { update: () => false } },
    { name: "file", type: "relationship", relationTo: "reporting-files", index: true, access: { update: () => false } },
    { name: "source", type: "relationship", relationTo: "sources", index: true, access: { update: systemWrite } },
    { name: "kind", type: "select", required: true, defaultValue: "quote", options: [{ value: "highlight", label: "Highlight" }, { value: "quote", label: "Quote" }] },
    // A snapshot of the words, never character offsets into a transcript that may be edited later.
    { name: "text", type: "textarea", required: true, maxLength: 4000 },
    { name: "attribution", type: "text", maxLength: 300 },
    { name: "speaker", type: "text", maxLength: 160 },
    { name: "startMs", type: "number", min: 0 },
    { name: "endMs", type: "number", min: 0 },
    { name: "segmentIds", type: "json", access: { update: systemWrite } },
    { name: "note", label: "Private note", type: "textarea", maxLength: 2000 },
    groundRulesField,
    { ...confidentialField, access: { update: systemWrite } } as Field,
    { name: "state", type: "select", required: true, defaultValue: "saved", index: true, options: [{ value: "saved", label: "Saved" }, { value: "verified", label: "Verified" }], access: { create: verificationWrite, update: verificationWrite } },
    { name: "verifiedBy", type: "relationship", relationTo: "users", admin: { readOnly: true }, access: { create: verificationWrite, update: verificationWrite } },
    { name: "verifiedAt", type: "date", admin: { readOnly: true }, access: { create: verificationWrite, update: verificationWrite } },
    {
      // An editor's explicit, audited decision to allow public use of off-the-record words.
      name: "offRecordOverride",
      type: "group",
      access: { create: systemWrite, update: systemWrite },
      fields: [
        { name: "by", type: "relationship", relationTo: "users" },
        { name: "at", type: "date" },
        { name: "reason", type: "textarea", maxLength: 600 }
      ]
    },
    // Where the quote is used: maintained from Story saves (reporting/provenance.ts), never by hand.
    { name: "usedIn", type: "relationship", relationTo: "stories", hasMany: true, index: true, admin: { readOnly: true }, access: { create: systemWrite, update: systemWrite } },
    createdByField,
    { name: "capturedAt", type: "date", admin: { readOnly: true } }
  ]
};
