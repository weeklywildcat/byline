import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { requestUser } from "../access/user";
import { redirectIfSignedOut } from "../auth/session";
import { canAdministerSystem, navigationFor } from "../domain/navigation";
import { linkedPerson } from "../ui/shell/account-server";
import { MoreScreen } from "../ui/shell/MoreScreen";

export async function BylineMore({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  const user = requestUser(req);
  const { routes, admin } = req.payload.config;
  const person = user && await linkedPerson(req.payload, req.user ?? undefined, user.linkedPerson);

  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? (
        <MoreScreen items={navigationFor(user.role)} canAdminister={canAdministerSystem(user.role)} hasProfile={Boolean(person?.exists)}
          adminRoute={routes.admin} logoutUrl={`${routes.api}/users/logout`} loginHref={`${routes.admin}${admin.routes.login}`} />
      ) : (
        <Gutter><p>Your account is not enabled for Byline. Ask an administrator for access.</p></Gutter>
      )}
    </DefaultTemplate>
  );
}
