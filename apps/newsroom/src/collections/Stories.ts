import { beforeStoryActivity, afterStoryActivity } from "../newsroom/story-activity";
import { requireStoryFacts } from "../newsroom/story-readiness";
import { queueFactsAfterStoryChange } from "../newsroom/video-facts";
import { notifyAfterStoryChange } from "../newsroom/notification-hooks";
import { publicURLHooks } from "../public/url-changes";
import { guardOffRecordQuotes, syncQuoteProvenance } from "../reporting/provenance";
import { seedDistributionAfterStoryChange } from "../distribution/policy";
import { APIError, ValidationError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type CollectionConfig, type Where } from "payload";
import { publicationMediaReport, storyMediaRequirements } from "../publication-media/readiness";
import { inIds, storyScope } from "../access/story-context";
import { editorsOnlyField, atLeast, relationIds, requestUser } from "../access/user";
import { articleBodyEditor } from "@byline/editor/server";
import { guardPrivilegedBlocks, repairEmptyStoryBody, requireCompleteBody } from "../hooks/story-body";
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
        ...((req.context?.bylinePlan ?? {}) as Partial<Pick<StoryPlan, "workflow" | "editor" | "deadline" | "plannedPublication" | "preset">>)
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

/**
 * Publishing needs every Media the story publishes directly (lead image and
 * body blocks) to be publishable now: metadata complete and a current
 * prepared generation in the store. Drafts and autosaves are never blocked; a
 * reporter can keep writing while an image prepares. The server decides,
 * whatever the browser thought (docs/publication-media.md#publishing).
 */
const requirePublishableMedia: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (data._status !== "published" || req.context?.bylineImport === true) return data;
  const story = {
    featuredMedia: data.featuredMedia !== undefined ? data.featuredMedia : originalDoc?.featuredMedia,
    body: data.body !== undefined ? data.body : originalDoc?.body,
    contentFormat: data.contentFormat ?? originalDoc?.contentFormat
  };
  const requirements = storyMediaRequirements(story);
  const report = await publicationMediaReport(req.payload, requirements, { req });
  if (report.ready) return data;
  const featured = requirements.find((item) => item.role === "image")?.id;
  throw new ValidationError({
    collection: "stories",
    req,
    errors: report.items.filter((item) => item.state !== "ready").flatMap((item) => item.issues.map((issue) => ({
      path: item.mediaId === featured ? "featuredMedia" : "body",
      message: `${item.filename ?? `Media ${item.mediaId}`} · ${issue.message}`
    })))
  });
};

/** Preserve the first publication instant on unpublish and ordinary republishes. */
const stampFirstPublication: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (originalDoc?.publishedAt && !data.publishedAt) data.publishedAt = originalDoc.publishedAt;
  else if (data._status === "published" && !data.publishedAt) data.publishedAt = new Date().toISOString();
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
const urlChanges = publicURLHooks("stories");

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
    // Editors may move Stories to Trash; only administrators may permanently delete.
    // Payload passes data.deletedAt for a soft-delete and no data for a hard delete.
    delete: ({ req, data }) => {
      const user = requestUser(req);
      return atLeast(user, "administrator") || (atLeast(user, "editor") && Boolean(data?.deletedAt));
    }
  },
  hooks: {
    beforeOperation: [({ args, operation, req, overrideAccess }) => {
      if ((operation === "update" || operation === "restoreVersion") && !overrideAccess && !args.draft && !atLeast(requestUser(req), "editor")) {
        throw new APIError("Only editors can change a public story. Save your edits as a draft.", 403);
      }
      if (operation === "update" || operation === "restoreVersion") req.context.bylineStoryDraftWrite = args.draft === true;
      if (operation === "restoreVersion") req.context.bylineVersionRestore = { draft: args.draft === true };
      return args;
    }],
    beforeChange: [({ data, req }) => {
      const restore = req.context.bylineVersionRestore as { draft: boolean } | undefined;
      if (restore?.draft) data._status = "draft";
      data.versionActor = Number(requestUser(req)?.id) || null;
      data.versionRestored = Boolean(restore);
      delete req.context.bylineVersionRestore;
      return data;
    }, ({ data, originalDoc, req }) => {
      if (!data.liveCoverage || req.context.bylineImport === true) return data;
      const previous = originalDoc?.liveCoverage;
      const state = data.liveCoverage.state ?? previous?.state ?? "off";
      const now = new Date().toISOString();
      data.liveCoverage = {
        state,
        startedAt: state === "off" ? null : previous?.startedAt ?? now,
        endedAt: state === "ended" ? previous?.endedAt ?? now : null
      };
      return data;
    }, pinContentFormat, requireStoryFacts, guardPrivilegedBlocks, requireCompleteBody, requirePublishableMedia, guardOffRecordQuotes, stampFirstPublication, urlChanges.beforeChange, beforeStoryActivity],
    afterChange: [syncPlan, urlChanges.afterChange, afterStoryActivity, queueFactsAfterStoryChange, notifyAfterStoryChange, syncQuoteProvenance, seedDistributionAfterStoryChange],
    beforeDelete: [async ({ id, req }) => {
      // A hard delete removes private dependents; the ordinary trash update keeps them.
      const where = { story: { equals: id } };
      await req.payload.db.deleteMany({ collection: "story-notes", where, req });
      await req.payload.db.deleteMany({ collection: "story-activity", where, req });
      await req.payload.db.deleteMany({ collection: "notifications", where, req });
      // Private reporting and distribution go with a permanently deleted Story (files leave the disk too).
      await req.payload.db.deleteMany({ collection: "transcript-selections", where, req });
      await req.payload.db.deleteMany({ collection: "reporting-transcripts", where, req });
      await req.payload.db.deleteMany({ collection: "reporting-notes", where, req });
      await req.payload.delete({ collection: "reporting-files", where, overrideAccess: true, req });
      await req.payload.db.deleteMany({ collection: "distribution-items", where, req });
    }]
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
        {
          name: "body", label: false, type: "richText", editor: articleBodyEditor,
          hooks: { afterRead: [repairEmptyStoryBody], beforeChange: [repairEmptyStoryBody] },
          admin: { condition: (data) => data?.contentFormat !== "legacy-html" }
        },
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
            { name: "state", type: "select", defaultValue: "off", options: [...LIVE_COVERAGE_STATE_OPTIONS], access: { create: editorsOnlyField, update: editorsOnlyField } },
            { name: "startedAt", type: "date", access: { create: () => false, update: () => false }, admin: { readOnly: true } },
            { name: "endedAt", type: "date", access: { create: () => false, update: () => false }, admin: { readOnly: true } }
          ]
        },
        slugField("headline", "stories"),
        { name: "publishedAt", type: "date", index: true, access: { create: editorsOnlyField, update: editorsOnlyField }, admin: { position: "sidebar", description: "First publication. Part of the article URL." } },
      ]
    },
    { name: "plan", type: "join", collection: "story-plans", on: "story", admin: { hidden: true } },
    { name: "versionActor", type: "number", admin: { hidden: true }, access: { create: () => false, update: () => false } },
    { name: "versionRestored", type: "checkbox", admin: { hidden: true }, access: { create: () => false, update: () => false } },
    // Migration provenance only. Keep the imported ID in storage, but never let
    // Payload reserve its document sidebar for a read-only implementation detail.
    { ...legacyIdField(), admin: { hidden: true } }
  ]
};
