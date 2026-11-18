import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { atLeast, requestUser } from "../access/user";
import { AnalyticsDesk } from "../ui/analytics/AnalyticsDesk";

/**
 * The Analytics desk (`/admin/analytics`, docs/google-analytics.md): editors and administrators. The
 * view checks the account; every report is re-checked by `/api/byline/analytics/*`.
 */
export function BylineAnalytics({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
    {atLeast(requestUser(req), "editor") ? <AnalyticsDesk /> : <Gutter><p>Only editors can use Analytics.</p></Gutter>}
  </DefaultTemplate>;
}
