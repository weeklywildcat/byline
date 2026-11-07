import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, Where } from "payload";
import { inIds, storyScope } from "../access/story-context";
import { atLeast, relationIds, requestUser } from "../access/user";
import { articleBodyEditor } from "@byline/editor/server";
import type { StoryPlan } from "../payload-types";
import {
  CONTENT_FORMATS,
  IMMERSIVE_ALIGNMENT_OPTIONS,
  LIVE_COVERAGE_STATE_OPTIONS,
  STORY_FORMAT_OPTIONS,
  STORY_PRESENTATION_OPTIONS
} from "../domain/vocabulary";
import { legacyIdField, slugField } from "../fields/slug";
import { storyLivePreview } from "../preview/config";

/**
 * Keep the story's plan in step: create it with the story, and copy the
 * contributor list into it on every save (drafts and autosaves included).
 *
 * Payload writes draft saves only to the versions table, so the main stories
 * row can lag the draft a writer is working on. Access decisions therefore read
 * the team from the unversioned plan, which always reflects the latest save.
 */
const syncPlan: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  const contributors = relationIds(doc.contributors) as number[];
  const existing = await req.payload.find({
    collection: "story-plans",
    where: { story: { equals: doc.id } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req
  });
  const plan = existing.docs[0];
  if (!plan) {
    const user = requestUser(req);
    await req.payload.create({
      collection: "story-plans",
      data: {
        story: doc.id as number,
        workflow: "pitch",
        contributors,
        createdBy: (user?.id as number | undefined) ?? null,
        // A preset may seed workflow, editor and deadline (Phase 3 New Story).
        ...((req.context?.bylinePlan ?? {}) as Partial<Pick<StoryPlan, "workflow" | "editor" | "deadline" | "plannedPublication">>)
      },
      overrideAccess: true,
      context: { bylineSystem: true },
      req
    });
    return doc;
  }
  const current = relationIds(plan.contributors).map(String).join(",");
  if (operation === "update" && current !== contributors.map(String).join(",")) {
    await req.payload.update({
      collection: "story-plans",
      id: plan.id,
      data: { contributors },
      overrideAccess: true,
      context: { bylineSystem: true },
      req
    });
  }
  return doc;
};

/** The first publication time is part of the public URL, so it is set once and kept. */
const stampFirstPublication: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data._status === "published" && !data.publishedAt && !originalDoc?.publishedAt) {
    data.publishedAt = new Date().toISOString();
  }
  return data;
};

/** Only an import may set or change how a body is stored; `legacy-html` bodies stay read-only. */
const pinContentFormat: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (req.context?.bylineImport === true) return data;
  if (operation === "create") {
    data.contentFormat = "byline-v1";
    delete data.legacyHtml;
    delete data.legacySource;
  } else {
    data.contentFormat = originalDoc?.contentFormat ?? "byline-v1";
    if (originalDoc?.contentFormat === "legacy-html") {
      data.legacyHtml = originalDoc.legacyHtml;
      data.legacySource = originalDoc.legacySource;
    }
  }
  return data;
};

/**
 * One canonical Story. News, features, opinion, sports recaps, photo essays,
 * investigations and data stories are compositions of it.
 *
 * Publication is Payload's own `_status` with Versions, Drafts, Autosave and
 * scheduled publishing. Newsroom workflow, the editor, deadlines, the brief and
 * links live on the story's unversioned plan (`story-plans`): saving copy never
 * moves workflow, and restoring an old version never restores old planning.
 */
export const Stories: CollectionConfig = {
  slug: "stories",
  admin: {
    useAsTitle: "headline",
    defaultColumns: ["headline", "section", "_status", "updatedAt"],
    group: false,
    listSearchableFields: ["headline", "slug", "deck"],
    // Payload's native Live Preview: its pane, toolbar, devices and pop-out; Byline renders /preview/story.
    livePreview: storyLivePreview
  },
  versions: {
    maxPerDoc: 200,
    drafts: {
      autosave: { interval: 1200 },
      schedulePublish: true,
      validate: false
    }
  },
  lockDocuments: { duration: 300 },
  trash: true,
  access: {
    // Editors read everything. Staff read published stories plus the stories they work on.
    read: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      if (scope.all) return true;
      return { or: [{ _status: { equals: "published" } }, inIds("id", [...scope.managed, ...scope.participant])] } satisfies Where;
    },
    readVersions: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("parent", scope.managed);
    },
    // Publishing is an editor's decision. Payload also calls these with `_status: "published"`
    // to decide whether to offer Publish, so the button follows the same rule.
    create: ({ req, data }) => {
      const user = requestUser(req);
      return Boolean(user) && (data?._status !== "published" || atLeast(user, "editor"));
    },
    update: async ({ req, data }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      if (data?._status === "published" && !atLeast(scope.user, "editor")) return false;
      return scope.all ? true : inIds("id", scope.managed);
    },
    delete: ({ req }) => atLeast(requestUser(req), "editor")
  },
  hooks: {
    beforeChange: [pinContentFormat, stampFirstPublication],
    afterChange: [syncPlan]
  },
  fields: [
    {
      // Presentational only (no data namespace): its custom Field is the Byline Story
      // screen, which renders inside Payload's Edit view and form.
      type: "collapsible",
      label: "Story",
      admin: { components: { Field: "/ui/story/StoryScreen#StoryScreen" } },
      fields: [
        { name: "headline", type: "text", required: true, maxLength: 300 },
        { name: "deck", type: "textarea", maxLength: 600 },
        { name: "kicker", type: "text", maxLength: 80 },
        {
          type: "row",
          fields: [
            { name: "section", type: "relationship", relationTo: "sections", index: true },
            { name: "topics", type: "relationship", relationTo: "topics", hasMany: true }
          ]
        },
        { name: "contributors", type: "relationship", relationTo: "people", hasMany: true, admin: { description: "The byline, in order." } },
        { name: "featuredMedia", type: "upload", relationTo: "media" },
        { name: "featuredCaption", type: "textarea", maxLength: 1000, admin: { description: "This story's caption for the lead image. Credit comes from the photo." } },
        {
          name: "contentFormat",
          type: "select",
          required: true,
          defaultValue: "byline-v1",
          options: CONTENT_FORMATS.map((value) => ({ value, label: value === "byline-v1" ? "Byline editor" : "Imported WordPress body" })),
          admin: { readOnly: true, position: "sidebar" }
        },
        // The byline-v1 body: prose plus the Byline story blocks (@byline/editor). Never Payload's generic block forms.
        { name: "body", label: false, type: "richText", editor: articleBodyEditor, admin: { condition: (data) => data?.contentFormat !== "legacy-html" } },
        {
          name: "legacyHtml",
          label: "Imported body (HTML)",
          type: "code",
          admin: { language: "html", readOnly: true, condition: (data) => data?.contentFormat === "legacy-html", description: "Imported from WordPress. It renders as published; converting it to the Byline editor is a separate, reviewed step." }
        },
        { name: "legacySource", label: "Original Gutenberg source", type: "code", admin: { language: "html", readOnly: true, hidden: true } },
        {
          type: "collapsible",
          label: "Presentation",
          admin: { initCollapsed: false },
          fields: [
            { name: "format", type: "select", required: true, defaultValue: "standard", options: [...STORY_FORMAT_OPTIONS] },
            {
              name: "video",
              type: "group",
              admin: { condition: (data) => data?.format === "video" },
              fields: [
                { name: "url", label: "YouTube URL", type: "text" },
                { name: "metadata", type: "json", admin: { readOnly: true, hidden: true } }
              ]
            },
            { name: "presentation", type: "select", required: true, defaultValue: "standard", options: [...STORY_PRESENTATION_OPTIONS] },
            {
              name: "immersiveAlignment",
              label: "Headline position",
              type: "select",
              defaultValue: "bottom-left",
              options: [...IMMERSIVE_ALIGNMENT_OPTIONS],
              admin: { condition: (data) => data?.presentation === "immersive" }
            }
          ]
        },
        { name: "reportingNote", label: "How we reported this", type: "textarea", maxLength: 4000 },
        {
          name: "liveCoverage",
          type: "group",
          admin: { description: "Live coverage is a timeline of updates on this story, not a story format." },
          fields: [
            { name: "state", type: "select", defaultValue: "off", options: [...LIVE_COVERAGE_STATE_OPTIONS] },
            { name: "startedAt", type: "date", admin: { readOnly: true } },
            { name: "endedAt", type: "date", admin: { readOnly: true } }
          ]
        },
        slugField("headline", "stories"),
        { name: "publishedAt", type: "date", index: true, admin: { position: "sidebar", readOnly: true, description: "First publication. Part of the article URL." } },
      ]
    },
    { name: "plan", type: "join", collection: "story-plans", on: "story", admin: { hidden: true } },
    legacyIdField()
  ]
};
