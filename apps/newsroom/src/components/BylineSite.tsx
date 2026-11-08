import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { atLeast, requestUser } from "../access/user";
import { SiteWorkspace } from "../ui/site/SiteWorkspace";

export function BylineSite({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
    {atLeast(requestUser(req), "administrator") ? <SiteWorkspace /> : <Gutter><p>Only administrators manage the site.</p></Gutter>}
  </DefaultTemplate>;
}
