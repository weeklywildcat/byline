import type { useLivePreview } from "@payloadcms/live-preview-react";

/**
 * The one thing Byline adds to Payload's Live Preview transport.
 *
 * Payload's `useLivePreview` populates each unsaved form state by POSTing it
 * to the collection's findByID route (`X-Payload-HTTP-Method-Override: GET`),
 * which runs the normal access control and afterRead population. Its default
 * request targets `stories/<initialData.id>`; Byline's preview route is the
 * static `/preview/story`, so there is no initial document and no ID in the
 * URL. Payload's native LivePreviewWindow already puts the current document's
 * ID in every form-state message (`data.id`), so this handler reads it from
 * there and otherwise sends exactly Payload's request: same method and
 * override header, same body (data, depth, locale, flattenLocales), same
 * credentials. It is not a render API; it only chooses which Story Payload
 * populates.
 *
 * Around that request it keeps what a per-keystroke preview needs and the
 * hook does not provide:
 *
 *  - order: responses can return out of order; a response older than one
 *    already delivered is answered with the newer result, so the article
 *    never steps backwards;
 *  - failure: a failed population answers with the last good result (the
 *    preview stays as it was, marked possibly out of date) and reports why.
 *    Payload's hook would otherwise hand an error body to the page as if it
 *    were the Story.
 */
export type PopulationRequestHandler = NonNullable<Parameters<typeof useLivePreview>[0]["requestHandler"]>;

export type PopulationFailure = "signed-out" | "forbidden" | "not-found" | "unsaved" | "network" | "server";

export type PopulationStatus =
  | { state: "connecting" }
  | { state: "live"; at: number }
  | { state: "failed"; reason: PopulationFailure; status: number | null; message: string; at: number; hasResult: boolean };

/** What the page receives instead of a Story when there is no good result to fall back to. */
export const POPULATION_FAILED = "__bylinePreviewPopulationFailed";

export type StoryPopulation = {
  requestHandler: PopulationRequestHandler;
  subscribe: (listener: () => void) => () => void;
  getStatus: () => PopulationStatus;
};

function failureFor(status: number): PopulationFailure {
  if (status === 401) return "signed-out";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  return "server";
}

function messageFrom(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: unknown }>; message?: unknown };
    const message = parsed.errors?.[0]?.message ?? parsed.message;
    return typeof message === "string" ? message : "";
  } catch {
    return "";
  }
}

const json = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });

/** Story IDs are positive integers in this newsroom; anything else is not a saved Story. */
export function storyIdFrom(data: unknown): number | null {
  const id = (data as { data?: { id?: unknown } } | null)?.data?.id;
  const number = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function createStoryPopulation({ collection = "stories", fetcher = (input: string, init: RequestInit) => fetch(input, init) }: { collection?: string; fetcher?: (input: string, init: RequestInit) => Promise<Response> } = {}): StoryPopulation {
  let status: PopulationStatus = { state: "connecting" };
  const listeners = new Set<() => void>();
  let issued = 0;
  let delivered = 0;
  let lastGood: string | null = null;

  const set = (next: PopulationStatus) => {
    status = next;
    listeners.forEach((listener) => listener());
  };
  const fail = (reason: PopulationFailure, code: number | null, message: string) => {
    set({ state: "failed", reason, status: code, message, at: Date.now(), hasResult: lastGood !== null });
    return json(lastGood ?? JSON.stringify({ [POPULATION_FAILED]: reason }));
  };

  const requestHandler: PopulationRequestHandler = async ({ apiPath, data, serverURL }) => {
    const id = storyIdFrom(data);
    if (id === null) return fail("unsaved", null, "");
    const mine = ++issued;
    let response: Response;
    try {
      response = await fetcher(`${serverURL}${apiPath}/${collection}/${id}`, {
        body: JSON.stringify(data),
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Payload-HTTP-Method-Override": "GET" },
        method: "POST"
      });
    } catch {
      return fail("network", null, "");
    }
    const body = await response.text().catch(() => "");
    if (!response.ok) return fail(failureFor(response.status), response.status, messageFrom(body));
    // A newer state was already delivered: never step back to this older one.
    if (mine < delivered && lastGood !== null) return json(lastGood);
    delivered = mine;
    lastGood = body;
    set({ state: "live", at: Date.now() });
    return json(body);
  };

  return {
    requestHandler,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getStatus: () => status
  };
}
