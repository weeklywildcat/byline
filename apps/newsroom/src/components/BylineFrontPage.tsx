import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { atLeast, requestUser } from "../access/user";
import { FrontPageDesk } from "../ui/front-page/FrontPageDesk";

export function BylineFrontPage({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
    {atLeast(requestUser(req), "editor") ? <FrontPageDesk api={req.payload.config.routes.api} admin={req.payload.config.routes.admin} /> : <Gutter><p>Only editors can change the homepage.</p></Gutter>}
  </DefaultTemplate>;
}
