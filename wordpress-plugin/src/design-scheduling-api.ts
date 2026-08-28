import apiFetch, { type APIFetchOptions } from "@wordpress/api-fetch";
import type { BylineDesignDocumentV2 } from "@byline/design";
import {
  parseDesignScheduleRecord,
  type DesignScheduleRecord
} from "./design-scheduling-model";

export type DesignScheduleRequest = Pick<APIFetchOptions, "path" | "method" | "data">;
export type DesignScheduleTransport = <T>(request: DesignScheduleRequest) => Promise<T>;

export type CreateDesignScheduleInput = {
  document: BylineDesignDocumentV2;
  baseRevisionId: number;
  scheduledAt: string;
  idempotencyKey?: string;
};

export type DesignScheduleApi = {
  list(template: string): Promise<DesignScheduleRecord[]>;
  create(template: string, input: CreateDesignScheduleInput): Promise<DesignScheduleRecord>;
  reschedule(template: string, scheduleId: number, scheduledAt: string): Promise<DesignScheduleRecord>;
  rebase(template: string, scheduleId: number, baseRevisionId: number): Promise<DesignScheduleRecord>;
  cancel(template: string, scheduleId: number): Promise<DesignScheduleRecord>;
};

export class DesignScheduleApiError extends Error {
  readonly operation: string;
  readonly errors: ReadonlyArray<{ code: string; message: string }>;

  constructor(operation: string, errors: ReadonlyArray<{ code: string; message: string }>) {
    super(`The ${operation} design schedule response was invalid.`);
    this.name = "DesignScheduleApiError";
    this.operation = operation;
    this.errors = errors;
  }
}

function templatePath(template: string) {
  return `/byline/v1/admin/design/${encodeURIComponent(template)}`;
}

export function designSchedulePath(
  template: string,
  action: "list" | "create" | "reschedule" | "rebase" | "cancel",
  scheduleId?: number
) {
  const base = templatePath(template);
  if (action === "list") return `${base}/schedules`;
  if (action === "create") return `${base}/schedule`;

  const id = encodeURIComponent(String(scheduleId ?? 0));
  if (action === "reschedule") return `${base}/schedule/${id}/reschedule`;
  if (action === "rebase") return `${base}/schedule/${id}/rebase`;
  return `${base}/schedule/${id}`;
}

function parseOne(value: unknown, template: string, operation: string): DesignScheduleRecord {
  const parsed = parseDesignScheduleRecord(value, template);
  if (!parsed.record) throw new DesignScheduleApiError(operation, parsed.errors);
  return parsed.record;
}

function parseList(value: unknown, template: string): DesignScheduleRecord[] {
  if (!Array.isArray(value)) {
    throw new DesignScheduleApiError("list", [{ code: "invalid-record", message: "The schedule list is not an array." }]);
  }

  return value.map((entry) => parseOne(entry, template, "list"));
}

export function createDesignScheduleApi(request: DesignScheduleTransport): DesignScheduleApi {
  return {
    async list(template) {
      const response = await request<unknown>({ path: designSchedulePath(template, "list"), method: "GET" });
      return parseList(response, template);
    },

    async create(template, input) {
      const response = await request<unknown>({
        path: designSchedulePath(template, "create"),
        method: "POST",
        data: input
      });
      return parseOne(response, template, "create");
    },

    async reschedule(template, scheduleId, scheduledAt) {
      const response = await request<unknown>({
        path: designSchedulePath(template, "reschedule", scheduleId),
        method: "POST",
        data: { scheduledAt }
      });
      return parseOne(response, template, "reschedule");
    },

    async rebase(template, scheduleId, baseRevisionId) {
      const response = await request<unknown>({
        path: designSchedulePath(template, "rebase", scheduleId),
        method: "POST",
        data: { baseRevisionId }
      });
      return parseOne(response, template, "rebase");
    },

    async cancel(template, scheduleId) {
      const response = await request<unknown>({
        path: designSchedulePath(template, "cancel", scheduleId),
        method: "DELETE"
      });
      return parseOne(response, template, "cancel");
    }
  };
}

/** Authenticated REST adapter used by Studio when the host chooses to wire it in. */
export function createWordPressDesignScheduleApi(): DesignScheduleApi {
  return createDesignScheduleApi((request) => apiFetch(request));
}
