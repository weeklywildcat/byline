"use client";

import { ContentHealth } from "@byline/newsroom-screens/planning/ContentHealth";
import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useMemo } from "react";
import { createBylineRequest } from "../home/payload-fetchers";
import { useNewsroomRoutes } from "../shell/account";
import { useShellNavigation } from "../shell/navigation";

export function HealthWorkspace() {
  const { api, story } = useNewsroomRoutes();
  const { navigate } = useShellNavigation();
  const fetchers = useMemo<Pick<PlanningFetchers, "getContentHealth" | "runContentHealthScan" | "recheckContentHealth" | "setContentHealthDisposition">>(() => {
    const request = createBylineRequest(api);
    return {
      getContentHealth: () => request("/content-health"),
      runContentHealthScan: () => request("/content-health/scan", "POST"),
      recheckContentHealth: (id) => request(`/content-health/stories/${id}/recheck`, "POST"),
      setContentHealthDisposition: (input) => request("/content-health/disposition", "POST", input)
    };
  }, [api]);
  return <AdminRoot toaster={false}><main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
    <ContentHealth fetchers={fetchers} onOpenStory={(id) => navigate(story(id))} />
  </main></AdminRoot>;
}
