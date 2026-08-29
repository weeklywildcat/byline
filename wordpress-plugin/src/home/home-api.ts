import {
  normalizeContentHealthResponse,
  type PlanningRequestOptions
} from "../planning/planning-api";
import type {
  ContentHealthResponse,
  FeedbackResponse,
  PlanningResponse
} from "../planning/planning-model";
import type {
  HomeActivityPayload,
  HomeDeploymentStatus,
  HomeHealthPayload,
  HomePresetMutation,
  HomePresetsPayload,
  HomeNavigationCapabilities
} from "./home-model";

export type HomeRequest = <T>(options: PlanningRequestOptions) => Promise<T>;

export type HomePaths = {
  planning?: string;
  health?: string;
  contentHealth?: string;
  feedback?: string;
  deployment?: string;
  deploymentTrigger?: string;
  activity?: string;
  presets?: string;
};

export type HomeFetchers = {
  getPlanning?: () => Promise<PlanningResponse>;
  getHealth?: () => Promise<HomeHealthPayload>;
  getContentHealth?: () => Promise<ContentHealthResponse>;
  getFeedback?: () => Promise<FeedbackResponse>;
  getDeployment?: () => Promise<HomeDeploymentStatus>;
  retryDeployment?: () => Promise<HomeDeploymentStatus>;
  getActivity?: () => Promise<HomeActivityPayload>;
  getPresets?: () => Promise<HomePresetsPayload>;
  updatePreset?: (type: string, changes: Record<string, unknown>) => Promise<HomePresetMutation>;
  resetPreset?: (type: string) => Promise<HomePresetMutation>;
};

const defaultPaths: Required<HomePaths> = {
  planning: "/byline/v1/editorial/planning",
  health: "/byline/v1/admin/health",
  contentHealth: "/byline/v1/admin/content-health",
  feedback: "/byline/v1/admin/feedback",
  deployment: "/byline/v1/admin/deployment",
  deploymentTrigger: "/byline/v1/admin/deployment/trigger",
  activity: "/byline/v1/editorial/activity?limit=12",
  presets: "/byline/v1/editorial/presets"
};

/**
 * Create Home's read model from the existing protected endpoints. The
 * capability checks keep known-forbidden requests out of the browser while
 * the server remains the final authorization boundary.
 */
export function createHomeFetchers(
  request: HomeRequest,
  paths: HomePaths = {},
  capabilities: HomeNavigationCapabilities = {}
): HomeFetchers {
  const resolved = { ...defaultPaths, ...paths };
  if (paths.deployment && !paths.deploymentTrigger) {
    resolved.deploymentTrigger = `${resolved.deployment.replace(/\/+$/, "")}/trigger`;
  }
  const fetchers: HomeFetchers = {};

  // The planning route is intentionally edit_posts-scoped. A role that can
  // manage Byline configuration but cannot edit stories should still get the
  // Home shell without a predictable 403 request for private newsroom rows.
  if (capabilities.editPosts !== false) {
    fetchers.getPlanning = () => request<PlanningResponse>({ path: resolved.planning });
  }

  if (capabilities.manage) {
    fetchers.getHealth = () => request<HomeHealthPayload>({ path: resolved.health });
  }

  if (capabilities.editPosts !== false || capabilities.manage) {
    fetchers.getContentHealth = () => request<unknown>({ path: resolved.contentHealth }).then(normalizeContentHealthResponse);
  }

  if (capabilities.editOthersPosts || capabilities.manage) {
    fetchers.getFeedback = () => request<FeedbackResponse>({ path: resolved.feedback });
  }

  if (capabilities.manageIntegrations) {
    fetchers.getDeployment = () => request<HomeDeploymentStatus>({ path: resolved.deployment });
    fetchers.retryDeployment = () => request<HomeDeploymentStatus>({ path: resolved.deploymentTrigger, method: "POST" });
  }

  if (capabilities.editOthersPosts || capabilities.manage) {
    fetchers.getActivity = () => request<HomeActivityPayload>({ path: resolved.activity });
  }

  if (capabilities.editPosts !== false || capabilities.manage) {
    fetchers.getPresets = () => request<HomePresetsPayload>({ path: resolved.presets });
  }
  if (capabilities.manage) {
    fetchers.updatePreset = (type, changes) => request<HomePresetMutation>({
      path: `${resolved.presets}/${encodeURIComponent(type)}`,
      method: "POST",
      data: changes
    });
    fetchers.resetPreset = (type) => request<HomePresetMutation>({
      path: `${resolved.presets}/${encodeURIComponent(type)}/reset`,
      method: "POST"
    });
  }

  return fetchers;
}
