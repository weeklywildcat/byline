"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useSearchParams } from "next/navigation";
import { useNewsroomRoutes } from "../shell/account";
import { useShellNavigation } from "../shell/navigation";
import { AnalyticsSettings } from "./AnalyticsSettings";
import { PublicationSettingsPanel } from "./PublicationSettings";
import { SiteRecords } from "./SiteRecords";
import { NewsroomPeopleScreen } from "../people/NewsroomPeopleScreen";
import { RolesScreen } from "../roles/RolesScreen";
import { WorkloadScreen } from "../roles/WorkloadScreen";
import { RolloverScreen } from "../roles/RolloverScreen";

const ADMIN_TABS = ["Publication", "Analytics", "Pages", "Sections", "Topics", "Redirects", "People"] as const;
/** Editors may manage People, but never the administrator-only Site settings. */
export const siteTabsFor = (canAdministerSite: boolean) => canAdministerSite ? ADMIN_TABS : (["People"] as const);

export function SiteWorkspace({ canAdministerSite }: { canAdministerSite: boolean }) {
  const { admin } = useNewsroomRoutes();
  const params = useSearchParams();
  const tabs = siteTabsFor(canAdministerSite);
  const tab = tabs.find((label) => label.toLowerCase() === params?.get("tab"))?.toLowerCase() ?? (canAdministerSite ? "publication" : "people");
  const peopleView = params?.get("view");
  const { runGuarded } = useShellNavigation();
  return <AdminRoot toaster={false}>
    <main className={`mx-auto grid w-full min-w-0 gap-4 px-4 py-6 md:px-8 ${tab === "people" ? "max-w-[1240px]" : "max-w-5xl"}`}>
      <h1 className="text-2xl font-semibold">Site</h1>
      <Tabs value={tab} onValueChange={(value) => runGuarded(() => window.history.pushState(null, "", `${admin}/site?tab=${value}`))}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start">{tabs.map((label) => <TabsTrigger key={label} value={label.toLowerCase()}>{label}</TabsTrigger>)}</TabsList>
        {canAdministerSite ? <>
          <TabsContent value="publication" className="pt-3"><PublicationSettingsPanel /></TabsContent>
          <TabsContent value="analytics" className="pt-3"><AnalyticsSettings /></TabsContent>
          {(["pages", "sections", "topics", "redirects"] as const).map((group) => <TabsContent key={group} value={group} className="pt-3"><SiteRecords group={group} /></TabsContent>)}
        </> : null}
        <TabsContent value="people" className="pt-3">
          {peopleView === "roles" ? <RolesScreen embedded /> : peopleView === "workload" ? <WorkloadScreen embedded /> : peopleView === "rollover" ? <RolloverScreen embedded /> : <NewsroomPeopleScreen embedded />}
        </TabsContent>
      </Tabs>
    </main>
  </AdminRoot>;
}
