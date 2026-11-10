import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { requestUser } from "../access/user";
import { DataWorkspace } from "../ui/data/DataWorkspace";

/**
 * Byline Data (`/admin/data`): Datasets (the facts) and Projects (what
 * readers see). The view checks the account; everything the screen shows
 * comes from /api/byline/data, which reads and writes as the signed-in user,
 * and every editor-only action is refused there too.
 */
export function BylineData({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {requestUser(req) ? <DataWorkspace /> : <Gutter><p>Your account is not enabled for Byline. Ask an administrator for access.</p></Gutter>}
    </DefaultTemplate>
  );
}
