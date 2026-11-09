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
  HomePresetsPayload
} from "./home-model";
import type { HomeBootstrap } from "./newsroom-model";
import type { StoryFetchers } from "../story/story-fetchers";

export type HomeFetchers = StoryFetchers & {
  getHome?: () => Promise<HomeBootstrap>;
  searchStories?: (query: string) => Promise<{ stories: Array<{ id: number; title: string }> }>;
  getPlanning?: () => Promise<PlanningResponse>;
  getHealth?: () => Promise<HomeHealthPayload>;
  getContentHealth?: () => Promise<ContentHealthResponse>;
  getFeedback?: () => Promise<FeedbackResponse>;
  getDeployment?: () => Promise<HomeDeploymentStatus>;
  retryDeployment?: () => Promise<HomeDeploymentStatus>;
  getActivity?: () => Promise<HomeActivityPayload>;
  updatePreset?: (type: string, changes: Record<string, unknown>) => Promise<HomePresetMutation>;
  resetPreset?: (type: string) => Promise<HomePresetMutation>;
};
