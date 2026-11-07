import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { requestUser } from "../access/user";
import { NewsroomCollectionsScreen } from "../ui/collections/NewsroomCollectionsScreen";

/**
 * Byline Collections (`/admin/collections`, exactly): the newsroom's
 * reporting projects. Payload's raw collection screens stay below it
 * (`/admin/collections/<slug>`, administrators only); this view never
 * matches them. A custom view is not an authorization boundary by itself:
 * the account is checked here, and everything the screen shows comes from
 * /api/byline/collections, which reads and writes as the signed-in user.
 */
export function BylineCollections({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  const user = requestUser(req);
  // Payload leaves custom root views bare; its default template brings the Byline shell (Nav, header).
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? (
        <NewsroomCollectionsScreen currentUserId={Number(user.id)} />
      ) : (
        <Gutter>
          <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
