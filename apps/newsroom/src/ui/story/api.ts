"use client";

/**
 * The Story screen's reads and writes outside the story form: its plan,
 * sections, people and Story Workspace records. All go through Payload's REST
 * API with the signed-in session, so collection and field access apply to every
 * call; nothing here is mirrored into the story's form state.
 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type Paginated<T> = { docs: T[]; totalDocs: number };

async function request<T>(api: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ?? "Byline could not save that change.";
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export function query(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return `?${search.toString()}`;
}

export const getJson = <T,>(api: string, path: string) => request<T>(api, path);
export const patchJson = <T,>(api: string, path: string, body: unknown) => request<T>(api, path, { method: "PATCH", body: JSON.stringify(body) });
