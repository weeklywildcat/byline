import type { CollectionConfig } from "payload";
import { administratorsOnly, atLeast, newsroomUser, signedIn } from "../access/user";
import { legacyIdField, slugField } from "../fields/slug";

/**
 * Public school events: the canonical records behind the public site's
 * `schoolEvents` dataset (the WordPress `ww_school_event` contract).
 *
 * Times are instants (Payload dates). The public projection renders them as
 * the publication's local wall time (`YYYY-MM-DDTHH:MM`), the shape the
 * static site compares at build time to decide what is upcoming; the
 * snapshot always carries every published event, never a list pre-filtered
 * to "upcoming". Drafts keep unpublished events out of the public dataset.
 *
 * Not in normal staff navigation until a Byline Events screen exists:
 * administrators use the raw System screens. The WordPress import (Phase 8)
 * keeps event IDs through the controlled import context.
 */
export const EVENT_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "canceled", label: "Canceled" }
] as const;

export const Events: CollectionConfig = {
  slug: "events",
  labels: { singular: "Event", plural: "Events" },
  admin: { useAsTitle: "title", defaultColumns: ["title", "startAt", "eventStatus", "_status"], group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  versions: { maxPerDoc: 50, drafts: { validate: true } },
  trash: true,
  access: { read: signedIn, create: administratorsOnly, update: administratorsOnly, delete: administratorsOnly },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    slugField("title", "events"),
    { name: "eventType", label: "Event type", type: "text", maxLength: 60 },
    { type: "row", fields: [
      { name: "startAt", label: "Starts", type: "date", required: true, index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
      { name: "endAt", label: "Ends", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
      { name: "allDay", label: "All day", type: "checkbox", defaultValue: false }
    ] },
    { name: "location", type: "text", maxLength: 200 },
    { name: "description", type: "textarea", maxLength: 2000 },
    { name: "externalUrl", label: "External URL", type: "text", maxLength: 2000, validate: (value: unknown) => (value === null || value === undefined || value === "" || /^https?:\/\/\S+$/i.test(String(value)) ? true : "Use an http(s) URL.") },
    // `eventStatus`, not `status`: Payload's drafts `_status` would share its database enum name.
    { name: "eventStatus", label: "Status", type: "select", required: true, defaultValue: "scheduled", options: [...EVENT_STATUS_OPTIONS] },
    legacyIdField()
  ]
};
