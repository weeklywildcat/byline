import type { ServerProps } from "payload";
import { newsroomUser, relationId } from "../../access/user";
import { canAdministerSystem, navigationFor, SYSTEM_ADMINISTRATION_PATH } from "../../domain/navigation";
import { ROLE_OPTIONS } from "../../domain/vocabulary";
import { BylineSidebar } from "./BylineSidebar";
import type { ShellUser } from "./NavUser";

/**
 * Replaces Payload's navigation entirely (`admin.components.Nav`, which is
 * also Payload's mobile menu). Everyone sees only Byline destinations; raw
 * Payload screens are reached by administrators from System administration in
 * the account menu.
 */
export async function BylineNav({ user, payload }: ServerProps) {
  const account = newsroomUser(user);
  if (!account) return null;
  const admin = payload.config.routes.admin;
  const name = user && typeof user === "object" && "name" in user && typeof user.name === "string" ? user.name : "";
  const person = await linkedPerson(payload, user, account.linkedPerson);
  const shellUser: ShellUser = {
    name: name || "Your account",
    subtitle: person.newsroomRole || ROLE_OPTIONS.find((option) => option.value === account.role)?.label || "",
    avatarUrl: person.avatarUrl,
    ...(person.exists ? { profileHref: `${admin}/profile` } : {})
  };
  return (
    <BylineSidebar
      items={navigationFor(account.role).map((item) => ({ key: item.key, label: item.label, path: item.path, ...(item.exact ? { exact: true } : {}), href: `${admin}${item.path}` || "/" }))}
      adminRoute={admin}
      homeHref={admin || "/"}
      user={shellUser}
      systemHref={canAdministerSystem(account.role) ? `${admin}${SYSTEM_ADMINISTRATION_PATH}` : null}
      logoutUrl={`${payload.config.routes.api}/users/logout`}
      loginHref={`${admin}/login`}
    />
  );
}

/** The account's byline person, read as the user: their newsroom title and portrait, when there is one. */
async function linkedPerson(payload: ServerProps["payload"], user: ServerProps["user"], id: number | string | null): Promise<{ newsroomRole: string; avatarUrl: string | null; exists: boolean }> {
  if (id === null) return { newsroomRole: "", avatarUrl: null, exists: false };
  try {
    const person = await payload.findByID({ collection: "people", id, depth: 1, overrideAccess: false, user, select: { newsroomRole: true, portrait: true } });
    const portrait = person.portrait;
    const url = portrait && typeof portrait === "object" && relationId(portrait) !== null && typeof portrait.url === "string" && portrait.mimeType?.startsWith("image/") ? portrait.url : null;
    return { newsroomRole: typeof person.newsroomRole === "string" ? person.newsroomRole.trim() : "", avatarUrl: url, exists: true };
  } catch {
    return { newsroomRole: "", avatarUrl: null, exists: false };
  }
}
