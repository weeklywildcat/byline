import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { requestUser } from "../access/user";
import { NewsroomPeopleScreen } from "../ui/people/NewsroomPeopleScreen";

export function BylineProfile({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
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
      {requestUser(req) ? (
        <NewsroomPeopleScreen self />
      ) : (
        <Gutter>
          <p>
            Your account is not enabled for Byline. Ask an administrator for
            access.
          </p>
        </Gutter>
      )}
    </DefaultTemplate>
  );
}
