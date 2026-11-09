import { addDataAndFileToRequest, APIError, type PayloadHandler, type PayloadRequest } from "payload";
import { newsroomTimeZone } from "../domain/dates";
import { screenContext, type ScreenContext } from "./screen-models";

/**
 * The newsroom API's request helpers, shared by every `/api/byline/*` module
 * (`endpoints.ts`, `reporting/endpoints.ts`, …). Being an admin screen is not
 * permission: each handler re-checks the account through `screenContext`.
 */

export const json = (body: unknown, status = 200, headers: Record<string, string> = { "Cache-Control": "private, no-store" }) => Response.json(body, { status, headers });

export function handle(run: (ctx: ScreenContext, req: PayloadRequest) => Promise<unknown>): PayloadHandler {
  return async (req) => {
    try {
      const ctx = screenContext(req, newsroomTimeZone());
      const result = await run(ctx, req);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      const status = error instanceof APIError ? error.status : typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
      const message = status >= 500 ? "Byline couldn't finish that. Try again." : (error as Error).message;
      if (status >= 500) req.payload.logger.error({ err: error, msg: "Newsroom screen request failed" });
      // A refusal may carry structured detail (e.g. the problems blocking a review submission).
      const detail = status < 500 && error instanceof APIError && error.data && typeof error.data === "object" ? error.data : {};
      return json({ message, code: `byline_${status}`, data: { ...detail, status } }, status);
    }
  };
}

export async function body<T>(req: PayloadRequest): Promise<T> {
  await addDataAndFileToRequest(req);
  return (req.data ?? {}) as T;
}

export function idParam(req: PayloadRequest, name = "id"): number {
  const id = Number(req.routeParams?.[name]);
  if (!Number.isSafeInteger(id) || id <= 0) throw new APIError("Unknown record.", 404);
  return id;
}

