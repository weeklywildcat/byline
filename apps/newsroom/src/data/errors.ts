import { APIError } from "payload";

/** A refusal the Data screens show as is, with optional structured detail (issues, conflicts). */
export class DataError extends APIError {
  readonly code: string;
  constructor(code: string, message: string, status = 400, data: Record<string, unknown> = {}) {
    super(message, status, { code, ...data }, status < 500);
    this.code = code;
  }
}
