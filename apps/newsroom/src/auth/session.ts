import { redirect } from "next/navigation";
import type { PayloadRequest } from "payload";

type Search = Record<string, string | string[] | undefined> | undefined;

/**
 * Where an anonymous visitor goes: the login view, carrying the address they
 * were after so signing in returns them there (the login view validates it with
 * `newsroomReturnTo`, so only newsroom paths are ever followed).
 */
export function loginRedirectUrl({
  admin, login, segments, searchParams,
}: { admin: string; login: string; segments?: string[]; searchParams?: Search }): string {
  const path = segments?.length ? `${admin}/${segments.map(encodeURIComponent).join("/")}` : admin;
  const query = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    const single = Array.isArray(value) ? value[0] : value;
    if (key !== "redirect" && single !== undefined) query.set(key, single);
  });
  const search = query.size > 0 ? `?${query}` : "";
  return `${admin}${login}?${new URLSearchParams({ redirect: path + search })}`;
}

/**
 * Payload lets custom admin views render for anonymous requests, so an expired
 * session reaches the view with no user at all. That is a sign-in problem, not
 * an access problem: send it to the login view. A signed-in account that is
 * disabled or has no Byline role still reaches the view, which explains why.
 */
export function redirectIfSignedOut(
  { req, params, searchParams }: {
    req: Pick<PayloadRequest, "user" | "payload">;
    params?: { segments?: string[] };
    searchParams?: Search;
  },
): void {
  if (req.user) return;
  const { routes, admin } = req.payload.config;
  redirect(loginRedirectUrl({ admin: routes.admin, login: admin.routes.login, segments: params?.segments, searchParams }));
}
