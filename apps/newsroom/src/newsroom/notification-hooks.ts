import type { CollectionAfterChangeHook } from "payload";
import { relationId, relationIds, sameId } from "../access/user";
import { editorRecipients, notify, usersForPeople } from "./notifications";

/**
 * The collection hooks that raise notifications. Each compares the saved
 * document with its previous state, so only a real change notifies (an
 * autosave that leaves the editor, workflow or assignees alone never does),
 * and each runs inside the saving transaction through `notify()`, which never
 * fails or delays the save. Who triggered the change is never notified.
 */

const added = (now: unknown, before: unknown) => {
  const had = new Set(relationIds(before).map(String));
  return relationIds(now).filter((id) => !had.has(String(id)));
};

/** Stories: people newly added to the byline are told they are on the story. */
export const notifyAfterStoryChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const people = added(doc?.contributors, previousDoc?.contributors);
  if (people.length) await notify(req, { kind: "storyAssignments", recipients: await usersForPeople(req, people), story: doc.id, detail: "byline" });
  return doc;
};

const REVIEW = new Set(["editing", "ready"]);
const BACK_TO_WORK = new Set(["pitch", "assigned", "reporting", "writing"]);

/** Story plans: a new editor, a story moving into review, or being sent back. */
export const notifyAfterPlanChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const story = relationId(doc?.story);
  if (story === null) return doc;
  const before = operation === "create" ? null : previousDoc;
  if (doc.editor && !sameId(doc.editor, before?.editor)) await notify(req, { kind: "storyAssignments", recipients: [doc.editor], story, detail: "editor" });
  if (before && doc.workflow !== before.workflow) {
    if (REVIEW.has(doc.workflow) && !REVIEW.has(before.workflow)) {
      // No editor yet: the review is everyone-who-edits' to pick up.
      await notify(req, { kind: "readyForReview", recipients: doc.editor ? [doc.editor] : await editorRecipients(req), story });
    } else if (BACK_TO_WORK.has(doc.workflow) && REVIEW.has(before.workflow)) {
      await notify(req, { kind: "storyReturned", recipients: await usersForPeople(req, relationIds(doc.contributors)), story });
    }
  }
  return doc;
};

/** High and urgent tasks tell their assignees: newly assigned, or newly made high priority. */
export const notifyAfterTaskChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (doc?.priority !== "high" && doc?.priority !== "urgent") return doc;
  const before = operation === "create" ? null : previousDoc;
  const raised = before?.priority !== doc.priority && before?.priority !== (doc.priority === "urgent" ? "high" : "urgent");
  const recipients = raised ? relationIds(doc.assignees) : added(doc.assignees, before?.assignees);
  if (recipients.length && doc.state !== "completed") await notify(req, { kind: "highPriorityTasks", recipients, story: doc.story, detail: doc.title });
  return doc;
};

/** Photo, graphic, video and audio work tells its new assignees. */
export const notifyAfterProductionChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const recipients = added(doc?.assignees, operation === "create" ? null : previousDoc?.assignees);
  if (recipients.length) await notify(req, { kind: "mediaAssignments", recipients, story: doc.story, detail: doc.title });
  return doc;
};

/** Interviews and appointments tell their new assignees. */
export const notifyAfterAppointmentChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const recipients = added(doc?.assignees, operation === "create" ? null : previousDoc?.assignees);
  if (recipients.length) await notify(req, { kind: "appointments", recipients, story: doc.story, detail: doc.title });
  return doc;
};
