import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { requestUser } from "../access/user";
import { NewsroomMediaScreen } from "../ui/media/NewsroomMediaScreen";

/**
 * Byline Media (`/admin/media`): the newsroom's Library (Payload Media and
 * its native folders) and production Work, one destination. A custom view is
 * not an authorization boundary by itself: the account is checked here, and
 * everything the screen shows comes from /api/byline/media endpoints that
 * read and write as the signed-in user. Payload's raw Media collection stays
 * an administrator fallback (System administration).
 */
export function BylineMedia({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  const user = requestUser(req);
  // Payload leaves custom root views bare; its default template brings the Byline shell (Nav, header).
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? (
        <NewsroomMediaScreen currentUserId={Number(user.id)} />
      ) : (
        <Gutter>
          <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
