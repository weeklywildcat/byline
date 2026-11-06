import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { requestUser } from "../access/user";
import { NewsroomCalendarScreen } from "../ui/calendar/NewsroomCalendarScreen";

/**
 * Byline Calendar (`/admin/calendar`): the newsroom's schedule, a first-class
 * destination (not a tab of a Planning page). A custom view is not an
 * authorization boundary by itself: the account is checked here, and the
 * schedule and stories it shows come from /api/byline endpoints that read as
 * the signed-in user.
 */
export function BylineCalendar({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  const user = requestUser(req);
  // Payload leaves custom root views bare; its default template brings the Byline shell (Nav, header).
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? (
        <NewsroomCalendarScreen currentUserId={Number(user.id)} />
      ) : (
        <Gutter>
          <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
