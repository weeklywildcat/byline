import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { requestUser } from "../access/user";
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
  redirectIfSignedOut({ req, params, searchParams });
  const user = requestUser(req);
  // `coverage=` was the earlier name of the Collection scope; still accepted at the boundary.
  const collection = Number(first(searchParams?.collection) ?? first(searchParams?.coverage));
  // Payload leaves custom root views bare; its default template brings the Byline shell (Nav, header).
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
      {user ? (
        <NewsroomStories
          currentUserId={Number(user.id)}
          view={first(searchParams?.view)}
          initialFilters={{ mine: first(searchParams?.mine) === "1", ...(Number.isSafeInteger(collection) && collection > 0 ? { collectionId: collection } : {}) }}
        />
      ) : (
        <Gutter>
          <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
