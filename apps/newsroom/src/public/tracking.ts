import type { CollectionConfig } from "payload";
import { sql } from "@payloadcms/db-postgres";
import { drizzleFor } from "../publication-media/state";
import { withPublicChangeTracking, type PublicSlice, type PublicTrackingOptions } from "./revision";
import {
  collectionPublicSlice,
  correctionPublicSlice,
  eventPublicSlice,
  mediaPublicSlice,
  liveUpdatePublicSlice,
  pagePublicSlice,
  personPublicSlice,
  pollPublicSlice,
  sectionPublicSlice,
  storyPublicSlice,
  topicPublicSlice
} from "./slices";

/**
 * The one table of collections whose changes can reach the public site, and
 * how (docs/payload-build-snapshots.md#public-mutation-coverage). Every other
 * collection (story plans, tasks, sources, appointments, production
 * assignments, interviews, resources, users, folders, jobs) is private and never advances the
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
  collections: {
    slice: collectionPublicSlice,
    options: {
      onPublicWrite: async (req, id) => {
        // The normal updatedAt includes private planning edits. Keep the
        // public date with the same change that advances the revision.
        const db = await drizzleFor(req.payload, req);
        await db.execute(sql`update collections set public_modified_at = now() where id = ${id}`);
      }
    }
  },
  corrections: { slice: correctionPublicSlice },
  polls: { slice: pollPublicSlice },
  "live-updates": { slice: liveUpdatePublicSlice },
  media: { slice: mediaPublicSlice, options: { ignoreCreate: true } }
};

/** Adds public change tracking to a collection that participates in the public projection. */
export function withPublicTracking(collection: CollectionConfig): CollectionConfig {
  const entry = PUBLIC_COLLECTIONS[collection.slug];
  return entry ? (withPublicChangeTracking(collection as never, entry.slice, entry.options) as CollectionConfig) : collection;
}
