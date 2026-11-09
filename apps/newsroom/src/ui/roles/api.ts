"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignmentInput } from "../../domain/role-admin";
import type { PreviewStep, RoleInput, RolesOverview, RoutingPreview, WorkflowInput, WorkflowsOverview } from "../../newsroom/newsroom-roles";
import type { RolloverPreview, YearsOverview } from "../../newsroom/school-years";
import type { WorkloadView } from "../../newsroom/workload";
import { ApiError, deleteJson, getJson, patchJson, postJson } from "../story/api";

export type { PreviewStep, RoleMember, RoleRow, RolesOverview, RoutingPreview, WorkflowRow, WorkflowsOverview } from "../../newsroom/newsroom-roles";
export type { WorkloadView } from "../../newsroom/workload";
export { ApiError };

export const rolesKey = ["byline", "newsroom-roles"] as const;
export const workflowsKey = ["byline", "review-workflows"] as const;
export const workloadKey = ["byline", "workload"] as const;

/** The server's reasons a write was refused, as a list a form can show. */
export function problemsOf(error: unknown): string[] {
  if (error instanceof ApiError) {
    const listed = error.data.problems;
    if (Array.isArray(listed) && listed.length) return listed.map(String);
    return [error.message];
  }
  return ["Byline couldn't save that. Try again."];
}

export const useRoles = (api: string) => useQuery({ queryKey: [...rolesKey, api], queryFn: () => getJson<RolesOverview>(api, "/byline/roles") });
export const useWorkflows = (api: string) => useQuery({ queryKey: [...workflowsKey, api], queryFn: () => getJson<WorkflowsOverview>(api, "/byline/review-workflows") });
export const useWorkload = (api: string, enabled = true) => useQuery({ queryKey: [...workloadKey, api], queryFn: () => getJson<WorkloadView>(api, "/byline/workload"), enabled, staleTime: 30_000 });

/** Every role write returns the fresh overview, which replaces the cached one. */
export function useRoleWrites(api: string) {
  const client = useQueryClient();
  const keep = (overview: RolesOverview) => {
    client.setQueryData([...rolesKey, api], overview);
    // Workflows list which roles exist; workload is unaffected.
    void client.invalidateQueries({ queryKey: workflowsKey });
  };
  return {
    saveRole: useMutation({ mutationFn: ({ id, data }: { id: number | null; data: RoleInput }) => (id === null ? postJson<RolesOverview>(api, "/byline/roles", data) : patchJson<RolesOverview>(api, `/byline/roles/${id}`, data)), onSuccess: keep }),
    saveMember: useMutation({
      mutationFn: ({ roleId, assignmentId, data }: { roleId: number; assignmentId: number | null; data: AssignmentInput }) =>
        assignmentId === null ? postJson<RolesOverview>(api, `/byline/roles/${roleId}/assignments`, data) : patchJson<RolesOverview>(api, `/byline/roles/${roleId}/assignments/${assignmentId}`, data),
      onSuccess: keep
    }),
    removeMember: useMutation({ mutationFn: ({ roleId, assignmentId }: { roleId: number; assignmentId: number }) => deleteJson<RolesOverview>(api, `/byline/roles/${roleId}/assignments/${assignmentId}`, {}), onSuccess: keep })
  };
}

export function useWorkflowWrites(api: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: WorkflowInput }) => (id === null ? postJson<WorkflowsOverview>(api, "/byline/review-workflows", data) : patchJson<WorkflowsOverview>(api, `/byline/review-workflows/${id}`, data)),
    onSuccess: (overview) => {
      client.setQueryData([...workflowsKey, api], overview);
      void client.invalidateQueries({ queryKey: rolesKey });
    }
  });
}

export const usePreviewRouting = (api: string) => useMutation({ mutationFn: (data: { storyId: number; workflowId?: number; steps?: unknown }) => postJson<RoutingPreview>(api, "/byline/review-workflows/preview", data) });

export type StoryHit = { id: number; title: string; detail: string };
export const searchStoryHits = (api: string, query: string) => getJson<{ stories: StoryHit[] }>(api, `/byline/home/search?query=${encodeURIComponent(query)}`).then((result) => result.stories);

/** Keep the open record in the address (`?workflow=3`) so a reload or a shared link lands on it, without adding history entries. */
export function rememberInUrl(key: string, id: number | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete(key);
  else url.searchParams.set(key, String(id));
  window.history.replaceState(window.history.state, "", url);
}

/* ------------------------------------------------------------ school years */

export type { RolloverPreview, StaffRow, YearRow, YearsOverview } from "../../newsroom/school-years";
export const yearsKey = ["byline", "school-years"] as const;

export const useYears = (api: string) => useQuery({ queryKey: [...yearsKey, api], queryFn: () => getJson<YearsOverview>(api, "/byline/school-years") });

export function useYearWrites(api: string) {
  const client = useQueryClient();
  const keep = (overview: YearsOverview) => {
    client.setQueryData([...yearsKey, api], overview);
    // A new active year changes who can review what.
    void client.invalidateQueries({ queryKey: rolesKey });
    void client.invalidateQueries({ queryKey: workloadKey });
  };
  return {
    plan: useMutation({ mutationFn: (data: { name: string; startsOn: string; endsOn: string }) => postJson<YearsOverview>(api, "/byline/school-years", data), onSuccess: keep }),
    discard: useMutation({ mutationFn: (id: number) => deleteJson<YearsOverview>(api, `/byline/school-years/${id}`, {}), onSuccess: keep }),
    preview: useMutation({ mutationFn: ({ id, plan }: { id: number; plan: unknown }) => postJson<RolloverPreview>(api, `/byline/school-years/${id}/preview`, plan) }),
    activate: useMutation({ mutationFn: ({ id, plan, confirmed }: { id: number; plan: unknown; confirmed: boolean }) => postJson<YearsOverview>(api, `/byline/school-years/${id}/activate`, { ...(plan as object), confirmed }), onSuccess: keep })
  };
}
