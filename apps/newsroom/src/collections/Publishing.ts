import type { CollectionConfig } from "payload";
import { inIds, scopeManages, storyScope } from "../access/story-context";
import { administratorsOnly, editorsOnly, relationId, requestUser, signedIn } from "../access/user";
import { proseEditor } from "../editor/prose";
import { CORRECTION_TYPE_OPTIONS, COVERAGE_FORMAT_OPTIONS, COVERAGE_STATUS_OPTIONS } from "../domain/vocabulary";
import { legacyIdField, slugField } from "../fields/slug";

/**
 * Coverage and series. The ordered `stories` list here is the one truth about
 * membership; a story's coverage is derived from it, never stored on the story.
 */
export const Coverages: CollectionConfig = {
  slug: "coverages",
  admin: { useAsTitle: "title", defaultColumns: ["title", "format", "status"], group: false },
  access: { read: signedIn, create: editorsOnly, update: editorsOnly, delete: editorsOnly },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    slugField("title", "coverages"),
    { name: "format", type: "select", required: true, defaultValue: "coverage", options: [...COVERAGE_FORMAT_OPTIONS] },
    { name: "status", type: "select", required: true, defaultValue: "active", index: true, options: [...COVERAGE_STATUS_OPTIONS] },
    { name: "description", type: "textarea", maxLength: 600 },
    { name: "overview", type: "textarea", maxLength: 6000 },
    { name: "artwork", type: "upload", relationTo: "media" },
    { type: "row", fields: [{ name: "startAt", type: "date" }, { name: "endAt", type: "date" }] },
    { name: "stories", type: "relationship", relationTo: "stories", hasMany: true, admin: { description: "In reading order for a series." } },
    legacyIdField()
  ]
};

/** Corrections, clarifications, editor's notes and substantive updates: first-class records on a story. */
export const Corrections: CollectionConfig = {
  slug: "corrections",
  admin: { useAsTitle: "text", defaultColumns: ["type", "story", "date"], group: false },
  access: {
    read: signedIn,
    create: editorsOnly,
    update: editorsOnly,
    delete: editorsOnly
  },
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === "create" && !data.createdBy) data.createdBy = requestUser(req)?.id ?? null;
        return data;
      }
    ]
  },
  fields: [
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "type", type: "select", required: true, defaultValue: "correction", options: [...CORRECTION_TYPE_OPTIONS] },
    { name: "text", type: "textarea", required: true, maxLength: 2000 },
    { name: "date", label: "Correction date", type: "date", required: true, index: true },
    { name: "publishedAt", label: "Shown publicly from", type: "date", admin: { description: "Only when it differs from the correction date." } },
    { name: "createdBy", type: "relationship", relationTo: "users", admin: { readOnly: true } },
    legacyIdField()
  ]
};

/**
 * Institutional pages (About, Standards, Contact, Staff, Media Kit…). The
 * homepage is code-defined and is not a page. Page blocks arrive with the
 * editor package; there is no page builder.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  admin: { useAsTitle: "title", defaultColumns: ["title", "slug", "_status"], group: false },
  versions: { maxPerDoc: 100, drafts: { autosave: { interval: 1500 }, schedulePublish: true, validate: false } },
  lockDocuments: { duration: 300 },
  trash: true,
  access: { read: signedIn, create: administratorsOnly, update: administratorsOnly, delete: administratorsOnly },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    slugField("title", "pages"),
    { name: "parent", type: "relationship", relationTo: "pages" },
    { name: "summary", type: "textarea", maxLength: 600 },
    { name: "body", type: "richText", editor: proseEditor },
    { name: "noindex", label: "Hide from search engines", type: "checkbox", defaultValue: false, admin: { position: "sidebar" } },
    legacyIdField()
  ]
};

/**
 * Live coverage updates. A story with live coverage keeps its format; the
 * public projection (Phase 11) exposes only published updates on published
 * stories, through the same-origin Worker proxy.
 */
export const LiveUpdates: CollectionConfig = {
  slug: "live-updates",
  labels: { singular: "Live update", plural: "Live updates" },
  admin: { useAsTitle: "headline", defaultColumns: ["headline", "story", "publishedAt", "pinned"], group: "Records" },
  access: {
    read: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", [...scope.managed, ...scope.participant]);
    },
    create: async ({ req, data }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return data ? scopeManages(scope, data.story) : scope.all || scope.managed.length > 0;
    },
    update: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", scope.managed);
    },
    delete: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", scope.managed);
    }
  },
  hooks: {
    beforeChange: [
      ({ data, operation, req, originalDoc }) => {
        if (operation === "create") {
          data.author = data.author ?? requestUser(req)?.id ?? null;
          data.publishedAt = data.publishedAt ?? new Date().toISOString();
        } else if (relationId(data.story) !== null && relationId(data.story) !== relationId(originalDoc?.story)) {
          data.story = originalDoc?.story;
        }
        return data;
      }
    ]
  },
  fields: [
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "headline", type: "text", maxLength: 200 },
    { name: "body", type: "richText", editor: proseEditor, required: true },
    { name: "photo", type: "upload", relationTo: "media" },
    { name: "author", type: "relationship", relationTo: "users", admin: { readOnly: true } },
    { name: "state", type: "select", defaultValue: "published", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }], index: true },
    { name: "publishedAt", type: "date", index: true },
    { name: "pinned", type: "checkbox", defaultValue: false, admin: { description: "Pinning replaces the previous key update." } },
    legacyIdField()
  ]
};
