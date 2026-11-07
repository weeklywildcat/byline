"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useSearchParams } from "next/navigation";
import { useNewsroomRoutes } from "../shell/account";
import { useShellNavigation } from "../shell/navigation";
import { PublicationSettingsPanel } from "./PublicationSettings";
import { SiteRecords } from "./SiteRecords";

const tabs = ["Publication", "Pages", "Sections", "Topics", "Redirects"] as const;
export function SiteWorkspace() {
  const { admin } = useNewsroomRoutes();
  const params = useSearchParams();
  const tab = tabs.find((label) => label.toLowerCase() === params?.get("tab"))?.toLowerCase() ?? "publication";
  const { runGuarded } = useShellNavigation();
  return <AdminRoot toaster={false}>
    <main className="mx-auto grid w-full max-w-5xl min-w-0 gap-4 px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold">Site</h1>
      <Tabs value={tab} onValueChange={(value) => runGuarded(() => window.history.pushState(null, "", `${admin}/site?tab=${value}`))}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start">{tabs.map((label) => <TabsTrigger key={label} value={label.toLowerCase()}>{label}</TabsTrigger>)}</TabsList>
        <TabsContent value="publication" className="pt-3"><PublicationSettingsPanel /></TabsContent>
        {(["pages", "sections", "topics", "redirects"] as const).map((group) => <TabsContent key={group} value={group} className="pt-3"><SiteRecords group={group} /></TabsContent>)}
      </Tabs>
    </main>
  </AdminRoot>;
}
