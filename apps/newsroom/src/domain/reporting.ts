/**
 * Reporting: the raw material a story is built from, and the rules that travel
 * with it (docs/reporting.md).
 *
 * > Capture once. Preserve provenance. Route by context. Verify deliberately.
 * > Publish deliberately. Reuse everywhere.
 *
 * Journalists capture information; they never file it into Byline's database
 * architecture. A capture is routed to its one canonical home
 * (`routeCapture`); the Story's Reporting feed is a read model over those
 * homes (`StoryMaterialItem`), never a polymorphic table.
 *
 * This module is pure and shared by the server and the newsroom screens.
 */

type Option<T extends string> = { readonly value: T; readonly label: string };

/* ----------------------------------------------------------- ground rules */

/**
 * A source's ground rules, as the reporter or editor recorded them. Software
 * cannot decide what they mean in every newsroom; Byline only carries them
 * forward and makes them conspicuous before any public use.
 */
export const GROUND_RULES = ["unspecified", "on-record", "background", "off-record"] as const;
export type GroundRule = (typeof GROUND_RULES)[number];
export const GROUND_RULE_OPTIONS: ReadonlyArray<Option<GroundRule>> = [
  { value: "unspecified", label: "Not specified" },
  { value: "on-record", label: "On the record" },
  { value: "background", label: "On background" },
  { value: "off-record", label: "Off the record" }
];

export function isGroundRule(value: unknown): value is GroundRule {
  return typeof value === "string" && (GROUND_RULES as readonly string[]).includes(value);
}

export function groundRuleLabel(value: unknown): string {
  return GROUND_RULE_OPTIONS.find((option) => option.value === value)?.label ?? "Not specified";
}

/**
 * The ground rules in force when material was captured. A snapshot: a later
 * edit of the Source never rewrites what was agreed for an interview already
 * recorded.
 */
export type GroundRulesSnapshot = {
  rule: GroundRule;
  recordingPermission: boolean;
  note: string;
  /** The Source the rules came from, if any. */
  sourceId: number | null;
  /** When the snapshot was taken. */
  capturedAt: string | null;
};

export const EMPTY_GROUND_RULES: GroundRulesSnapshot = { rule: "unspecified", recordingPermission: false, note: "", sourceId: null, capturedAt: null };

export function normalizeGroundRules(value: unknown): GroundRulesSnapshot {
  if (!value || typeof value !== "object") return { ...EMPTY_GROUND_RULES };
  const record = value as Record<string, unknown>;
  const sourceId = Number(record.sourceId);
  return {
    rule: isGroundRule(record.rule) ? record.rule : "unspecified",
    recordingPermission: record.recordingPermission === true,
    note: typeof record.note === "string" ? record.note.slice(0, REPORTING_LIMITS.groundRulesNote) : "",
    sourceId: Number.isSafeInteger(sourceId) && sourceId > 0 ? sourceId : null,
    capturedAt: typeof record.capturedAt === "string" && record.capturedAt ? record.capturedAt : null
  };
}

/**
 * What a quote may do next, from the ground rules it was captured under.
 *
 * - `insert`: the normal verified-quote path.
 * - `caution`: on background or unspecified. Byline makes the restriction
 *   conspicuous and never writes attribution text for it.
 * - `blocked`: off the record. Kept, searchable and highlightable privately;
 *   there is no one-click Insert. Only an editor's explicit, audited override
 *   (`overrideOffRecord`) can make it insertable.
 */
export type QuoteUse = { action: "insert" | "caution" | "blocked"; message: string };

export function quoteUse(rule: GroundRule, overridden = false): QuoteUse {
  if (rule === "off-record") {
    return overridden
      ? { action: "caution", message: "Off the record. An editor approved public use; check what was agreed before publishing." }
      : { action: "blocked", message: "Off the record. Keep it for reporting; it cannot be inserted as a quote." };
  }
  if (rule === "background") return { action: "caution", message: "On background. Check the agreed attribution before using it; Byline will not write one." };
  if (rule === "unspecified") return { action: "caution", message: "Ground rules not recorded. Confirm them with the reporter before publishing." };
  return { action: "insert", message: "On the record." };
}

/* --------------------------------------------------------- confidentiality */

/**
 * Normal material is seen by everyone who can see the Story's work.
 * Confidential material is seen only by its creator, the Story's assigned
 * editor and administrators, enforced server-side
 * (`access/reporting-context.ts`), never by hiding UI.
 */
export const CONFIDENTIALITY_HELP = "Only you, the story's assigned editor and administrators can see confidential material.";

/* ----------------------------------------------------------------- limits */

export const REPORTING_LIMITS = {
  noteText: 8000,
  groundRulesNote: 600,
  /** Raw reporting files: interview audio is large (Payload's multipart limit, payload.config.ts). */
  fileBytes: 300 * 1024 * 1024,
  materialPage: 200,
  search: 120,
  clientKey: 80
} as const;

/** Idempotency keys from the Field outbox: client-generated, opaque, bounded. */
export function validClientKey(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : null;
}

/* ---------------------------------------------------------- reporting files */

/** What a private reporting file is, from the reporter's point of view (never its storage). */
export const REPORTING_FILE_KINDS = ["audio", "document", "image", "other"] as const;
export type ReportingFileKind = (typeof REPORTING_FILE_KINDS)[number];

/**
 * Private reporting files. Audio includes what phones record in the browser
 * (WebM/Opus, Ogg, MP4/AAC). Images are allowed here only as private material
 * (a photographed document); photographs for publication go to Media.
 */
export const REPORTING_FILE_MIME_TYPES = [
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "video/webm",
  "application/pdf", "text/plain", "text/vtt", "application/x-subrip",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
] as const;

export function reportingFileKind(mimeType: string): ReportingFileKind {
  const type = mimeType.toLowerCase();
  if (type.startsWith("audio/") || type === "video/webm") return "audio";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || type.startsWith("text/") || type.includes("word") || type.includes("excel") || type.includes("spreadsheet") || type === "application/x-subrip") return "document";
  return "other";
}

/** The type an uploaded interview recording is sent as when the browser reports none, by extension (all in the list above). */
const RECORDING_EXTENSION_TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav", webm: "audio/webm", ogg: "audio/ogg", oga: "audio/ogg" };

/** The file picker filter for "Upload a recording": audio, plus the extensions for pickers that only match by name. */
export const RECORDING_ACCEPT = ["audio/*", "video/webm", ...Object.keys(RECORDING_EXTENSION_TYPES).map((extension) => `.${extension}`)].join(",");

/**
 * The type to upload a chosen file as, if it is a recording the collection
 * keeps: the browser's own type, or, when the browser reports none (common
 * for .m4a), the type its extension implies. `null` when it isn't one.
 */
export function recordingMimeType(name: string, type: string): string | null {
  const mime = type.toLowerCase().split(";")[0].trim();
  if ((REPORTING_FILE_MIME_TYPES as readonly string[]).includes(mime)) return reportingFileKind(mime) === "audio" ? mime : null;
  if (mime !== "" && mime !== "application/octet-stream") return null;
  return RECORDING_EXTENSION_TYPES[name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""] ?? null;
}

/**
 * Why a chosen file can't be uploaded as an interview recording, or `null`
 * when it can. Checked in the browser so the reporter hears it before a long
 * upload; the collection's own MIME list still decides on the server.
 */
export function recordingUploadProblem(name: string, type: string, bytes: number): string | null {
  if (!recordingMimeType(name, type)) return "That isn't a recording Byline can keep. Use MP3, M4A, WAV, AAC, Ogg or WebM audio.";
  if (bytes > REPORTING_LIMITS.fileBytes) return `That recording is larger than ${Math.round(REPORTING_LIMITS.fileBytes / 1_048_576)} MB.`;
  return null;
}

/* ---------------------------------------------------------------- capture */

/** What the person did. Never a storage choice. */
export type CaptureIntent = "note" | "live" | "photo" | "recording" | "file" | "link" | "transcript";

/** The canonical home a capture is routed to. */
export type CaptureDestination = "reporting-note" | "live-update" | "media" | "reporting-file" | "resource" | "reporting-transcript";

/**
 * Routes a capture to its canonical home. The only place this decision is
 * made: the Reporting workspace, Field Mode and the server all call it.
 *
 * - typed text, Save note → a private Reporting Note
 * - typed text, Post live → a Live Update
 * - a photograph → Media (the one asset system), never a private file
 * - an interview recording → a private Reporting File
 * - any other attachment → a private Reporting File, unless the person
 *   explicitly chose a public Media workflow for an image
 * - a pasted URL → the Story's resource links
 * - an imported transcript → a Reporting Transcript
 */
export function routeCapture(input: { intent: CaptureIntent; mimeType?: string; publicMedia?: boolean }): CaptureDestination {
  switch (input.intent) {
    case "note": return "reporting-note";
    case "live": return "live-update";
    case "recording": return "reporting-file";
    case "link": return "resource";
    case "transcript": return "reporting-transcript";
    case "photo": return "media";
    case "file": return input.publicMedia === true && (input.mimeType ?? "").toLowerCase().startsWith("image/") ? "media" : "reporting-file";
  }
}

/* ------------------------------------------------------ Story Material model */

export type MaterialPerson = { id: number; name: string };

/** The provenance every capture carries forward from where it was made. */
export type MaterialContext = {
  source: { id: number; label: string } | null;
  appointment: { id: number; title: string } | null;
};

type MaterialBase = MaterialContext & {
  /** Stable across kinds: `<kind>:<id>`. */
  key: string;
  id: number;
  occurredAt: string;
  author: MaterialPerson | null;
  confidential: boolean;
  /** May the reader change or remove it (creator, managers, or the restricted audience)? */
  canEdit: boolean;
};

export type ReportingNoteMaterial = MaterialBase & { kind: "note"; text: string };

export type TranscriptSummary = {
  id: number;
  state: "queued" | "processing" | "ready" | "failed";
  origin: "machine" | "manual";
  language: string | null;
  durationMs: number | null;
  quoteCount: number;
  verifiedCount: number;
  failure: string | null;
  progressPercent: number | null;
  progressMessage: string | null;
};

export type ReportingFileMaterial = MaterialBase & {
  kind: "file";
  fileKind: ReportingFileKind;
  filename: string;
  mimeType: string;
  filesize: number;
  durationMs: number | null;
  /** The access-controlled file route; never an anonymous URL. */
  url: string;
  groundRules: GroundRulesSnapshot;
  transcript: TranscriptSummary | null;
};

export type MediaMaterial = MaterialBase & {
  kind: "media";
  filename: string;
  previewUrl: string | null;
  alt: string;
  /** Linked to the Story through a production assignment, or captured for it. */
  via: "assignment" | "capture";
};

export type ResourceMaterial = MaterialBase & { kind: "resource"; label: string; url: string; purpose: string };

export type LiveUpdateMaterial = MaterialBase & { kind: "live"; text: string; state: "draft" | "published" };

export type StoryMaterialItem = ReportingNoteMaterial | ReportingFileMaterial | MediaMaterial | ResourceMaterial | LiveUpdateMaterial;
export type StoryMaterialKind = StoryMaterialItem["kind"];

/** The lightweight filters: views over one feed, never filing destinations. */
export const MATERIAL_FILTERS = [
  { value: "all", label: "All" },
  { value: "audio", label: "Audio" },
  { value: "documents", label: "Documents" },
  { value: "photos", label: "Photos" },
  { value: "notes", label: "Notes" }
] as const;
export type MaterialFilter = (typeof MATERIAL_FILTERS)[number]["value"];

export function materialMatchesFilter(item: StoryMaterialItem, filter: MaterialFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "audio": return item.kind === "file" && item.fileKind === "audio";
    case "documents": return (item.kind === "file" && (item.fileKind === "document" || item.fileKind === "other")) || item.kind === "resource";
    case "photos": return item.kind === "media" || (item.kind === "file" && item.fileKind === "image");
    case "notes": return item.kind === "note" || item.kind === "live";
  }
}

/** Plain-text search across what the feed already holds (never transcript bodies, which load on demand). */
export function materialMatchesSearch(item: StoryMaterialItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.kind === "note" || item.kind === "live" ? item.text : "",
    item.kind === "file" || item.kind === "media" ? item.filename : "",
    item.kind === "resource" ? `${item.label} ${item.url}` : "",
    item.source?.label ?? "", item.appointment?.title ?? "", item.author?.name ?? ""
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

/** Newest first, ties broken by key so the feed never reshuffles. */
export function sortMaterial(items: StoryMaterialItem[]): StoryMaterialItem[] {
  return [...items].sort((a, b) => (a.occurredAt === b.occurredAt ? a.key.localeCompare(b.key) : a.occurredAt < b.occurredAt ? 1 : -1));
}

/** Groups the feed under the newsroom day it happened ("Today", "Yesterday", or the date). */
export function materialDayGroups(items: StoryMaterialItem[], timeZone: string, now = new Date()): Array<{ label: string; items: StoryMaterialItem[] }> {
  const day = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const today = day(now);
  const yesterday = day(new Date(now.getTime() - 86_400_000));
  const groups: Array<{ label: string; items: StoryMaterialItem[] }> = [];
  for (const item of items) {
    const key = day(item.occurredAt);
    const label = key === today ? "Today" : key === yesterday ? "Yesterday" : new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" }).format(new Date(item.occurredAt));
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
