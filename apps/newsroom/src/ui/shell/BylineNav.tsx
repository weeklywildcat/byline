import type { ServerProps } from "payload";
import { newsroomUser } from "../../access/user";
import { administrationFor, navigationFor } from "../../domain/navigation";
import { BylineSidebar } from "./BylineSidebar";

/**
 * Replaces Payload's navigation entirely (`admin.components.Nav`). Nobody sees
 * Payload's generic collection list; administrators get a secondary
 * Administration section for maintenance.
 */
export function BylineNav({ user, payload }: ServerProps) {
  const account = newsroomUser(user);
  if (!account) return null;
  const admin = payload.config.routes.admin;
  const link = (item: { key: string; label: string; path: string }) => ({ key: item.key, label: item.label, href: `${admin}${item.path}` });
  const name = user && typeof user === "object" && "name" in user && typeof user.name === "string" ? user.name : "";
  return (
    <BylineSidebar
      items={navigationFor(account.role).map(link)}
      administration={administrationFor(account.role).map(link)}
      newStoryHref={`${admin}/collections/stories/create`}
      homeHref={admin || "/"}
      userName={name}
      logoutUrl={`${payload.config.routes.api}/users/logout`}
      loginHref={`${admin}/login`}
    />
  );
}
