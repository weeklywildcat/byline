import type { CollectionConfig } from "payload";
import { withPublicChangeTracking, type PublicSlice, type PublicTrackingOptions } from "./revision";
import {
  collectionPublicSlice,
  correctionPublicSlice,
  eventPublicSlice,
  mediaPublicSlice,
  pagePublicSlice,
  personPublicSlice,
  sectionPublicSlice,
  storyPublicSlice,
  topicPublicSlice
} from "./slices";

/**
 * The one table of collections whose changes can reach the public site, and
 * how (docs/payload-build-snapshots.md#public-mutation-coverage). Every other
 * collection (story plans, tasks, sources, appointments, production
 * assignments, interviews, resources, users, folders, live updates until
 * Phase 11, polls until Phase 11, jobs) is private and never advances the
 * public revision. The Publication Global tracks itself
 * (`globals/Publication.ts`).
 */
export const PUBLIC_COLLECTIONS: Record<string, { slice: PublicSlice; options?: PublicTrackingOptions }> = {
  stories: { slice: storyPublicSlice },
  pages: { slice: pagePublicSlice },
  events: { slice: eventPublicSlice },
  people: { slice: personPublicSlice },
  sections: { slice: sectionPublicSlice },
  topics: { slice: topicPublicSlice },
  collections: { slice: collectionPublicSlice },
  corrections: { slice: correctionPublicSlice },
  media: { slice: mediaPublicSlice, options: { ignoreCreate: true } }
};

/** Adds public change tracking to a collection that participates in the public projection. */
export function withPublicTracking(collection: CollectionConfig): CollectionConfig {
  const entry = PUBLIC_COLLECTIONS[collection.slug];
  return entry ? (withPublicChangeTracking(collection as never, entry.slice, entry.options) as CollectionConfig) : collection;
}
