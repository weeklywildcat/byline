import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { requestUser } from "../access/user";
import { storiesRouteFilters } from "@byline/newsroom-screens/planning/planning-api";
import { NewsroomStories } from "../ui/stories/NewsroomStories";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Byline Stories (`/admin/stories`), the reporters' and editors' Stories
 * screen. Payload's raw Stories list (`/admin/collections/stories`) stays the
 * administrators' system fallback. A custom view is not an authorization
 * boundary by itself: the account is checked here, and every read and write
 * the screen makes goes through /api/byline endpoints that check it again.
 */
export function BylineStories({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  const user = requestUser(req);
  // The address names its filters (`workflow=`, `needs_review=1`, `collection=`…): Home and the sidebar link views this way.
  const routeParams = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => { const single = first(value); if (single !== undefined) routeParams.set(key, single); });
  const initialFilters = storiesRouteFilters(routeParams);
  // Payload leaves custom root views bare; its default template brings the Byline shell (Nav, header).
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? (
        <NewsroomStories
          // A sidebar view link while Stories is open is a new address with new filters: start from them.
          key={JSON.stringify(initialFilters)}
          currentUserId={Number(user.id)}
          view={first(searchParams?.view)}
          initialFilters={initialFilters}
        />
      ) : (
        <Gutter>
          <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
