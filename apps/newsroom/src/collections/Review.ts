import type { CollectionConfig, Where } from "payload";
import { inIds, storyScope } from "../access/story-context";
import { editorsOnly, nobody, requestUser } from "../access/user";
import { RUN_STATUSES } from "../domain/review";
import { STORY_FORMAT_OPTIONS } from "../domain/vocabulary";

/**
 * Review (docs/review.md): configurable ordered workflows, and the runs and
 * comments of Stories going through them. All private. Every write is the
 * review engine's (`newsroom/review.ts`, `newsroom/review-workflows.ts`),
 * which authorizes the person first and serializes the change; nobody writes
 * these collections directly.
 */

export const ReviewWorkflows: CollectionConfig = {
  slug: "review-workflows",
  labels: { singular: "Review workflow", plural: "Review workflows" },
  admin: { useAsTitle: "name", group: "System", hidden: true },
  lockDocuments: false,
  access: { read: editorsOnly, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 80 },
    { name: "description", type: "textarea", maxLength: 400 },
    // The workflow for stories no other workflow claims. Exactly one is default (the endpoint keeps it so).
    { name: "isDefault", type: "checkbox", defaultValue: false, index: true },
    { name: "archived", type: "checkbox", defaultValue: false, index: true },
    {
      name: "appliesTo",
      type: "group",
      fields: [
        { name: "sections", type: "relationship", relationTo: "sections", hasMany: true },
        { name: "formats", type: "select", hasMany: true, options: [...STORY_FORMAT_OPTIONS] }
      ]
    },
    // Ordered steps (domain/newsroom-roles.ts WorkflowStep), validated by normalizeStep/workflowProblems.
    { name: "steps", type: "json", required: true },
    { name: "revision", type: "number", required: true, defaultValue: 1, admin: { readOnly: true } }
  ]
};

export const ReviewRuns: CollectionConfig = {
  slug: "review-runs",
  labels: { singular: "Review", plural: "Reviews" },
  admin: { group: "System", hidden: true },
  lockDocuments: false,
  access: {
    // Whoever may read the Story's plan, and the people the run is waiting for.
    read: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", [...scope.managed, ...scope.participant]);
    },
    create: nobody,
    update: nobody,
    delete: nobody
  },
  fields: [
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "workflow", type: "relationship", relationTo: "review-workflows", index: true },
    // The workflow as it was at submission (RunSnapshot); later edits never change a review in flight.
    { name: "snapshot", type: "json", required: true },
    { name: "status", type: "select", required: true, defaultValue: "active", index: true, options: RUN_STATUSES.map((value) => ({ value, label: value })) },
    { name: "round", type: "number", required: true, defaultValue: 1 },
    { name: "steps", type: "json", required: true },
    // Everyone who may act on the open step now (queues, notifications).
    { name: "reviewers", type: "relationship", relationTo: "users", hasMany: true, index: true },
    // Everyone routed to or acting on this review; while it is open they may read the Story (access/story-context.ts).
    { name: "participants", type: "relationship", relationTo: "users", hasMany: true, index: true },
    // The exact immutable Payload version under review (the `_stories_v` row id).
    { name: "submittedVersion", type: "text", required: true, index: true },
    { name: "submittedAt", type: "date", required: true },
    { name: "submittedBy", type: "relationship", relationTo: "users" },
    { name: "decisions", type: "json" },
    { name: "failure", type: "text" },
    { name: "statusSince", type: "date" },
    // Compare-and-swap counter: every engine write requires the revision it read.
    { name: "revision", type: "number", required: true, defaultValue: 1 }
  ]
};

export const ReviewComments: CollectionConfig = {
  slug: "review-comments",
  labels: { singular: "Review comment", plural: "Review comments" },
  admin: { group: "System", hidden: true },
  lockDocuments: false,
  access: {
    // Pending comments are their author's alone until the reviewer decides; published ones follow the Story.
    read: async ({ req }) => {
      const user = requestUser(req);
      const scope = await storyScope(req);
      if (!user || !scope) return false;
      const stories = scope.all ? null : [...scope.managed, ...scope.participant];
      const visible: Where = { and: [{ state: { not_equals: "pending" } }, ...(stories ? [inIds("story", stories)] : [])] };
      return { or: [{ author: { equals: user.id } }, visible] } satisfies Where;
    },
    create: nobody,
    update: nobody,
    delete: nobody
  },
  fields: [
    { name: "run", type: "relationship", relationTo: "review-runs", required: true, index: true },
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "round", type: "number", required: true },
    { name: "stepId", type: "text", required: true },
    // The submitted version the quote comes from. Never re-anchored to later text.
    { name: "version", type: "text", required: true },
    { name: "quote", type: "textarea", maxLength: 1000 },
    { name: "anchor", type: "json" },
    { name: "body", type: "textarea", required: true, maxLength: 4000 },
    { name: "author", type: "relationship", relationTo: "users", required: true, index: true },
    { name: "state", type: "select", required: true, defaultValue: "pending", index: true, options: [{ value: "pending", label: "Pending" }, { value: "published", label: "Published" }, { value: "resolved", label: "Resolved" }] },
    { name: "parent", type: "relationship", relationTo: "review-comments", index: true },
    { name: "publishedAt", type: "date" },
    { name: "resolvedAt", type: "date" },
    { name: "resolvedBy", type: "relationship", relationTo: "users" }
  ]
};
