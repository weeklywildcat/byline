import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { atLeast, requestUser } from "../access/user";
import { NewsroomPeopleScreen } from "../ui/people/NewsroomPeopleScreen";

export function BylinePeople({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      {atLeast(requestUser(req), "editor") ? (
        <NewsroomPeopleScreen />
      ) : (
        <Gutter>
          <p>
            Only editors manage People. Open My profile in your account menu to
            edit your own public profile.
          </p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
