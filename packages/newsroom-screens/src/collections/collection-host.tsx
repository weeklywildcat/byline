import { createContext, use, type ReactNode } from "react";
import type { PlanningFetchers } from "../planning/planning-api";
import type { StoryFetchers } from "../story/story-fetchers";
import type { MediaPicker } from "../workspace/media-picker";
import type { StoryWorkspace } from "../workspace/workspace-types";
import type { CollectionApi } from "./collection-api";

/**
 * Everything the shared Collection screens take from their host. The screens
 * never build an address or call a CMS: WordPress and Payload each supply
 * their CollectionApi, story fetchers (moves, task edits, story creation),
 * how to open a story (Story Peek, the Story workspace, an appointment in
 * its Plan), the Calendar scoped to a Collection, and their media picker.
 */
export type CollectionHost = {
  api: CollectionApi;
  fetchers: Partial<PlanningFetchers> & StoryFetchers;
  currentUserId: number | null;
  /** Story Peek, the one quick view. */
  openStory: (storyId: number) => void;
  /** A story's full Story workspace, or an appointment in its Plan. */
  storyHref: (storyId: number, options?: { appointmentId?: string }) => string;
  openStoryWorkspace: (storyId: number, options?: { appointmentId?: string }) => void;
  /** Where a newly created story opens (the host's Story workspace). */
  onStoryCreated: (created: StoryWorkspace) => void;
  /** The Calendar, already scoped to this Collection. */
  calendarHref?: (collectionId: number) => string;
  openCalendar?: (collectionId: number) => void;
  /** Choosing files from the host's media library (artwork, resources). */
  media?: MediaPicker;
  /** WordPress keeps a Collection activity list; Payload has none yet. */
  activity?: boolean;
  /** The host's global Create for a Collection (one flow, one dialog). */
  createCollection?: () => void;
};

const CollectionHostContext = createContext<CollectionHost | null>(null);

export function CollectionHostProvider({ value, children }: { value: CollectionHost; children: ReactNode }) {
  return <CollectionHostContext value={value}>{children}</CollectionHostContext>;
}

export function useCollectionHost(): CollectionHost {
  const host = use(CollectionHostContext);
  if (!host) throw new Error("Collection screens need a CollectionHostProvider.");
  return host;
}
