import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { requestUser } from "../access/user";
import { PollStudio } from "../ui/polls/PollStudio";

/**
 * Wildcat Polls' Poll Studio (`/admin/polls`, docs/wildcat-polls.md). The view
 * checks the account; everything it shows comes from /api/byline/polls, which
 * re-checks the account against each poll. Students never reach this screen:
 * the kiosk and public links are the separate `/polls` routes.
 */
export function BylinePolls({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  const user = requestUser(req);
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? <PollStudio api={req.payload.config.routes.api} admin={req.payload.config.routes.admin} /> : <Gutter><p>Your account is not enabled for Byline. Ask an administrator for access.</p></Gutter>}
    </DefaultTemplate>
  );
}
