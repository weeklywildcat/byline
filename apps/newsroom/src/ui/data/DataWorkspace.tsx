"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useNewsroomRoutes } from "../shell/account";
import { useShellNavigation } from "../shell/navigation";
import { DataHome } from "./DataHome";
import { DatasetWorkspace } from "./DatasetWorkspace";
import { ProjectWorkspace } from "./ProjectWorkspace";

/**
 * Byline Data (`/admin/data`, docs/byline-data.md): two ideas, plainly named.
 *
 *   Datasets  the facts the newsroom keeps    ?dataset=<id>
 *   Projects  what readers see                ?project=<id>
 *
 * The address is the workspace's state, moved through the shell's own
 * navigation so an unsaved project is never left by accident. Always the
 * normal global sidebar.
 */
export type DataTab = "projects" | "datasets";

export function useDataNavigation() {
  const { admin } = useNewsroomRoutes();
  const { navigate } = useShellNavigation();
  return useCallback((target: { dataset?: number; project?: number; tab?: DataTab }) => {
    const search = new URLSearchParams();
    if (target.dataset) search.set("dataset", String(target.dataset));
    else if (target.project) search.set("project", String(target.project));
    else if (target.tab && target.tab !== "projects") search.set("tab", target.tab);
    const query = search.toString();
    navigate(`${admin}/data${query ? `?${query}` : ""}`);
  }, [admin, navigate]);
}

const positive = (value: string | null | undefined) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export function DataWorkspace() {
  return (
    <AdminRoot toaster={false} className="byline-data">
      <DataRouter />
    </AdminRoot>
  );
}

function DataRouter() {
  const params = useSearchParams();
  const dataset = positive(params?.get("dataset"));
  const project = positive(params?.get("project"));
  if (dataset) return <DatasetWorkspace key={`dataset-${dataset}`} id={dataset} />;
  if (project) return <ProjectWorkspace key={`project-${project}`} id={project} />;
  return <DataHome tab={params?.get("tab") === "datasets" ? "datasets" : "projects"} />;
}
