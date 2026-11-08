import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { atLeast, requestUser } from "../access/user";
import { HealthWorkspace } from "../ui/site/HealthWorkspace";

export function BylineContentHealth({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user ?? undefined} visibleEntities={visibleEntities}>
    {atLeast(requestUser(req), "editor") ? <HealthWorkspace /> : <Gutter><p>Only editors can use Content Health.</p></Gutter>}
  </DefaultTemplate>;
}
