import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { requestUser } from "../access/user";
import { administrationFor, canAdministerSystem } from "../domain/navigation";
import { SystemAdministrationScreen } from "../ui/system/SystemAdministrationScreen";

/**
 * System administration (`/admin/system`): administrators' entry to Payload's
 * own collection screens, for maintenance, debugging and migration work. It is
 * reached from the account menu, never from the newsroom navigation, and the
 * role is checked here on the server; each raw screen still enforces its own
 * collection access.
 */
export function SystemAdministration({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  const user = requestUser(req);
  const admin = req.payload.config.routes.admin;
  // Payload leaves custom root views bare; its default template brings the Byline shell (Nav, header).
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user && canAdministerSystem(user.role) ? (
        <SystemAdministrationScreen links={administrationFor(user.role).map((item) => ({ key: item.key, label: item.label, href: `${admin}${item.path}` }))} />
      ) : (
        <Gutter>
          <p>System administration is available to administrators only.</p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
