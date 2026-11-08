import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { requestUser } from "../access/user";
import { NewsroomHome } from "../ui/home/NewsroomHome";

/**
 * Replaces Payload's dashboard. The account is re-checked on the server here,
 * and every read Home makes goes through /api/byline endpoints that check it
 * again; being inside the admin layout is not permission.
 */
export function BylineHome({ initPageResult, params, searchParams }: AdminViewServerProps) {
  redirectIfSignedOut({ req: initPageResult.req, params, searchParams });
  const user = requestUser(initPageResult.req);
  if (!user) {
    return (
      <Gutter>
        <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
      </Gutter>
    );
  }
  return <NewsroomHome currentUserId={Number(user.id)} />;
}
