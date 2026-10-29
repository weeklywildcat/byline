import { z } from "zod";
export const errorCode = z.enum([
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_error",
  "conflict",
  "rate_limited",
  "upstream_unavailable",
  "unsupported",
  "internal_error",
]);
export const errorSchema = z.strictObject({
  code: errorCode,
  message: z.string(),
  retryable: z.boolean(),
  requestId: z.string(),
  fieldErrors: z
    .array(z.strictObject({ field: z.string(), message: z.string() }))
    .optional(),
  current: z
    .strictObject({
      version: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      revision: z.number().int().min(0).optional(),
      updatedAt: z.iso.datetime({ offset: true }).optional(),
    })
    .optional(),
});
export type ErrorCode = z.infer<typeof errorCode>;
const messages: Record<ErrorCode, string> = {
  unauthenticated: "Reconnect Byline to continue.",
  forbidden: "Your WordPress account cannot perform this operation.",
  not_found: "The requested object is unavailable.",
  validation_error: "Check the supplied fields.",
  conflict: "This object changed. Read its current state before trying again.",
  rate_limited: "Too many requests. Try again shortly.",
  upstream_unavailable: "WordPress is temporarily unavailable.",
  unsupported: "This operation is unavailable on this Byline installation.",
  internal_error: "The operation could not be completed.",
};
export class BylineError extends Error {
  constructor(
    public code: ErrorCode,
    public upstreamStatus?: number,
    public current?: z.infer<typeof errorSchema>["current"],
  ) {
    super(messages[code]);
  }
  safe(requestId: string) {
    return errorSchema.parse({
      code: this.code,
      message: this.message,
      retryable: ["conflict", "rate_limited", "upstream_unavailable"].includes(
        this.code,
      ),
      requestId,
      current: this.current,
    });
  }
}
export function safeError(error: unknown, requestId: string) {
  if (error instanceof BylineError) return error.safe(requestId);
  if (error instanceof z.ZodError)
    return errorSchema.parse({
      code: "validation_error",
      message: messages.validation_error,
      retryable: false,
      requestId,
      fieldErrors: error.issues.map((i) => ({
        field: i.path.join("."),
        message:
          i.code === "too_big"
            ? `Use at most ${i.maximum}.`
            : i.code === "too_small"
            ? `Use at least ${i.minimum}.`
            : i.code === "invalid_format"
            ? "Use the documented date, time, identifier or URL format."
            : i.code === "custom"
            ? i.message
            : i.code === "invalid_type"
            ? `Expected ${i.expected}.`
            : "Choose a documented value.",
      })),
    });
  return new BylineError("internal_error").safe(requestId);
}
