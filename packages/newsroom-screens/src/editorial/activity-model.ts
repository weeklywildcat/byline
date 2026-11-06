/**
 * Safe, protected newsroom activity records.
 *
 * The PHP projection intentionally contains only bounded labels, identifiers,
 * actors, and timestamps. These types are shared by Home and the Story sidebar
 * so neither surface needs to know the private activity storage shape.
 */

export type EditorialActivityActor = {
  id: number;
  name: string;
};

export type EditorialActivityStory = {
  id: number;
  title: string;
};

export type EditorialActivityRecord = {
  id: number | string;
  action: string;
  type?: string;
  storyId?: number;
  summary: string;
  occurredAt: string;
  actor?: EditorialActivityActor | null;
  story?: EditorialActivityStory | null;
  context?: Record<string, unknown>;
};

export type EditorialActivityPayload = {
  storyId?: number;
  activity?: EditorialActivityRecord[];
  items?: EditorialActivityRecord[];
};
