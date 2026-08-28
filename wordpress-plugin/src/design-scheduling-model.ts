import { parseBylineDesignDocumentV2, type BylineDesignDocumentV2 } from "@byline/design";

export const DESIGN_SCHEDULE_STATUSES = [
  "scheduled",
  "processing",
  "published",
  "conflict",
  "failed",
  "cancelled"
] as const;

export type DesignScheduleStatus = (typeof DESIGN_SCHEDULE_STATUSES)[number];

export type DesignScheduleExecution = {
  attempts: number;
  idempotencyKey: string;
  startedAt: string | null;
  completedAt: string | null;
  deploymentTriggered: boolean;
};

export type DesignScheduleRecord = {
  id: number;
  template: string;
  document: BylineDesignDocumentV2;
  baseLiveRevision: number;
  scheduledAt: string;
  scheduledBy: number;
  status: DesignScheduleStatus;
  execution: DesignScheduleExecution;
  idempotencyKey: string;
  resultingRevision: number | null;
  error: string | null;
  snapshotHash?: string;
};

export type DesignScheduleParseError = {
  code:
    | "invalid-record"
    | "invalid-template"
    | "invalid-document"
    | "invalid-time"
    | "invalid-revision"
    | "invalid-user"
    | "invalid-status"
    | "invalid-execution";
  message: string;
};

export type ParsedDesignSchedule = {
  record: DesignScheduleRecord;
  errors: [];
};

export type InvalidDesignSchedule = {
  record: null;
  errors: [DesignScheduleParseError, ...DesignScheduleParseError[]];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function status(value: unknown): value is DesignScheduleStatus {
  return typeof value === "string" && (DESIGN_SCHEDULE_STATUSES as readonly string[]).includes(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  const candidate = record(value);
  if (!candidate) return value;

  return Object.fromEntries(
    Object.keys(candidate)
      .sort()
      .map((key) => [key, stableValue(candidate[key])])
  );
}

export function designScheduleSnapshotHash(document: BylineDesignDocumentV2): string {
  // This is a deterministic client-side fingerprint for change detection and
  // UI display. The server remains authoritative for the execution key.
  const json = JSON.stringify(stableValue(document));
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function invalid(code: DesignScheduleParseError["code"], message: string): InvalidDesignSchedule {
  return { record: null, errors: [{ code, message }] };
}

/**
 * Parses the protected REST schedule record into the shape the Studio model
 * can consume. A malformed record is rejected rather than rendered as an
 * upcoming publish with guessed defaults.
 */
export function parseDesignScheduleRecord(
  value: unknown,
  expectedTemplate?: string
): ParsedDesignSchedule | InvalidDesignSchedule {
  const candidate = record(value);
  if (!candidate) return invalid("invalid-record", "The design schedule is not an object.");

  const id = candidate.id;
  if (!positiveInteger(id)) return invalid("invalid-record", "The design schedule id is invalid.");

  const template = candidate.template;
  if (typeof template !== "string" || template.trim() === "" || (expectedTemplate && template !== expectedTemplate)) {
    return invalid("invalid-template", "The design schedule template is invalid.");
  }

  let document: BylineDesignDocumentV2;
  try {
    document = parseBylineDesignDocumentV2(candidate.document, template);
  } catch {
    return invalid("invalid-document", "The design schedule contains an invalid design document.");
  }

  if (!nonNegativeInteger(candidate.baseLiveRevision)) {
    return invalid("invalid-revision", "The design schedule base revision is invalid.");
  }
  if (!validDate(candidate.scheduledAt)) {
    return invalid("invalid-time", "The design schedule time is invalid.");
  }
  if (!positiveInteger(candidate.scheduledBy)) {
    return invalid("invalid-user", "The design schedule author is invalid.");
  }
  if (!status(candidate.status)) {
    return invalid("invalid-status", "The design schedule status is invalid.");
  }

  const executionCandidate = record(candidate.execution);
  if (!executionCandidate
    || !nonNegativeInteger(executionCandidate.attempts)
    || typeof executionCandidate.idempotencyKey !== "string"
    || executionCandidate.idempotencyKey.trim() === ""
    || (executionCandidate.startedAt !== null && !validDate(executionCandidate.startedAt))
    || (executionCandidate.completedAt !== null && !validDate(executionCandidate.completedAt))
    || typeof executionCandidate.deploymentTriggered !== "boolean") {
    return invalid("invalid-execution", "The design schedule execution state is invalid.");
  }

  const idempotencyKey = typeof candidate.idempotencyKey === "string" && candidate.idempotencyKey.trim()
    ? candidate.idempotencyKey
    : executionCandidate.idempotencyKey;
  if (idempotencyKey !== executionCandidate.idempotencyKey) {
    return invalid("invalid-execution", "The design schedule idempotency keys do not match.");
  }

  const resultingRevision = candidate.resultingRevision === null || candidate.resultingRevision === undefined
    ? null
    : nonNegativeInteger(candidate.resultingRevision) ? candidate.resultingRevision : null;
  if (candidate.resultingRevision !== null
    && candidate.resultingRevision !== undefined
    && resultingRevision === null) {
    return invalid("invalid-revision", "The design schedule result revision is invalid.");
  }

  const recordValue: DesignScheduleRecord = {
    id,
    template,
    document,
    baseLiveRevision: candidate.baseLiveRevision,
    scheduledAt: candidate.scheduledAt,
    scheduledBy: candidate.scheduledBy,
    status: candidate.status,
    execution: {
      attempts: executionCandidate.attempts,
      idempotencyKey: executionCandidate.idempotencyKey,
      startedAt: executionCandidate.startedAt as string | null,
      completedAt: executionCandidate.completedAt as string | null,
      deploymentTriggered: executionCandidate.deploymentTriggered
    },
    idempotencyKey,
    resultingRevision,
    error: typeof candidate.error === "string" && candidate.error.trim() ? candidate.error : null,
    ...(typeof candidate.snapshotHash === "string" && candidate.snapshotHash ? { snapshotHash: candidate.snapshotHash } : {})
  };

  return { record: recordValue, errors: [] };
}

export const parseDesignSchedule = parseDesignScheduleRecord;

export function isDesignScheduleDue(recordValue: DesignScheduleRecord, now = new Date()): boolean {
  return recordValue.status === "scheduled" && Date.parse(recordValue.scheduledAt) <= now.getTime();
}

export function isDesignScheduleTerminal(recordValue: DesignScheduleRecord): boolean {
  return recordValue.status === "published" || recordValue.status === "cancelled";
}

export function designScheduleNeedsReview(recordValue: DesignScheduleRecord): boolean {
  return recordValue.status === "conflict" || recordValue.status === "failed";
}

export function designScheduleStatusLabel(value: DesignScheduleStatus): string {
  switch (value) {
    case "scheduled": return "Scheduled";
    case "processing": return "Publishing";
    case "published": return "Published";
    case "conflict": return "Needs review";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
  }
}

export function nextDesignSchedule(records: readonly DesignScheduleRecord[], now = new Date()): DesignScheduleRecord | null {
  return records
    .filter((candidate) => candidate.status === "scheduled" && Date.parse(candidate.scheduledAt) >= now.getTime())
    .slice()
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt) || left.id - right.id)[0] ?? null;
}
