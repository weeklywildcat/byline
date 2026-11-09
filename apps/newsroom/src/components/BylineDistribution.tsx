import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { atLeast, requestUser } from "../access/user";
import { newsroomTimeZone } from "../domain/dates";
import { DistributionDesk } from "../ui/distribution/DistributionDesk";

export function BylineDistribution({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  const user = requestUser(req);
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
    {user && atLeast(user, "editor")
      ? <DistributionDesk api={req.payload.config.routes.api} admin={req.payload.config.routes.admin} timeZone={newsroomTimeZone()} userId={Number(user.id)} />
      : <Gutter><p>Only editors can open the Distribution desk. Your Stories' distribution is on each Story's History tab.</p></Gutter>}
  </DefaultTemplate>;
}
