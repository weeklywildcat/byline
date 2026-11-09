import type { CollectionConfig, FieldAccess } from "payload";
import { editorsOnly, nobody, signedIn } from "../access/user";
import { NEWSROOM_ROLE_SCOPES, ROLE_SCOPE_MODES, SCHOOL_YEAR_STATUSES } from "../domain/newsroom-roles";
import { PRODUCTION_TYPE_OPTIONS } from "../domain/vocabulary";

const systemOnly: FieldAccess = ({ req }) => req.context?.bylineSystem === true || req.context?.bylineImport === true;
const label = (value: string) => value.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => `${dash ? " " : ""}${letter.toUpperCase()}`);

/**
 * Newsroom operations (docs/newsroom-roles.md). Three different things that
 * must never be confused:
 *
 * - **Security role** (`users.role`: Staff, Editor, Administrator) decides
 *   what the application lets someone do.
 * - **Public identity** (`people.newsroomRole`: "Staff Writer") is printed on
 *   bylines.
 * - **Newsroom Role** (these collections: Section Editor, Copy Desk…) is a
 *   private operational responsibility that review routing resolves. It
 *   grants no application permission.
 *
 * Memberships belong to a school year, so a rollover never rewrites history:
 * last year's Sports Editor stays last year's Sports Editor.
 *
 * Every write goes through the newsroom endpoints (`newsroom/newsroom-roles.ts`,
 * `newsroom/school-years.ts`), which check the editor role and serialize
 * changes; collection access refuses direct writes from everyone else.
 */

export const SchoolYears: CollectionConfig = {
  slug: "school-years",
  labels: { singular: "School year", plural: "School years" },
  admin: { useAsTitle: "name", group: "System", hidden: true },
  lockDocuments: false,
  access: { read: signedIn, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: "name", type: "text", required: true, unique: true, maxLength: 40 },
    { name: "startsOn", type: "text", required: true, admin: { description: "First day (YYYY-MM-DD)." } },
    { name: "endsOn", type: "text", required: true, admin: { description: "Last day (YYYY-MM-DD)." } },
    // Exactly one active year: a partial unique index (migration 20261109_200000_newsroom_review) enforces it.
    { name: "status", type: "select", required: true, defaultValue: "planned", index: true, options: SCHOOL_YEAR_STATUSES.map((value) => ({ value, label: label(value) })), access: { update: systemOnly } },
    { name: "activatedAt", type: "date", admin: { readOnly: true }, access: { update: systemOnly } },
    { name: "activatedBy", type: "relationship", relationTo: "users", admin: { readOnly: true }, access: { update: systemOnly } },
    { name: "revision", type: "number", required: true, defaultValue: 1, admin: { readOnly: true } }
  ]
};

export const StaffMemberships: CollectionConfig = {
  slug: "staff-memberships",
  labels: { singular: "Staff membership", plural: "Staff memberships" },
  admin: { group: "System", hidden: true },
  lockDocuments: false,
  access: { read: editorsOnly, create: nobody, update: nobody, delete: nobody },
  indexes: [{ fields: ["schoolYear", "user"], unique: true }],
  fields: [
    { name: "schoolYear", type: "relationship", relationTo: "school-years", required: true, index: true },
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true },
    // That year's public title, kept for the record ("Staff Writer" in 2025–26, "Editor" in 2026–27).
    { name: "title", type: "text", maxLength: 80 },
    { name: "status", type: "select", required: true, defaultValue: "active", index: true, options: [{ value: "active", label: "Active" }, { value: "departed", label: "Departed" }] },
    { name: "departedAt", type: "date" }
  ]
};

export const NewsroomRoles: CollectionConfig = {
  slug: "newsroom-roles",
  labels: { singular: "Newsroom role", plural: "Newsroom roles" },
  admin: { useAsTitle: "name", group: "System", hidden: true },
  lockDocuments: false,
  // Staff see role names through review state ("Waiting for Copy Desk"), never by reading this list.
  access: { read: editorsOnly, create: nobody, update: nobody, delete: nobody },
  fields: [
    // Stable key that workflows and history refer to; never shown.
    { name: "key", type: "text", required: true, unique: true, maxLength: 60 },
    { name: "name", type: "text", required: true, maxLength: 80 },
    { name: "description", type: "textarea", maxLength: 400 },
    { name: "scopeKind", type: "select", required: true, defaultValue: "none", options: NEWSROOM_ROLE_SCOPES.map((value) => ({ value, label: label(value) })) },
    // How a reporter sees a scoped assignment: "{scope} Editor" reads "Sports Editor".
    { name: "waitingLabel", type: "text", maxLength: 80 },
    { name: "archived", type: "checkbox", defaultValue: false, index: true },
    { name: "revision", type: "number", required: true, defaultValue: 1, admin: { readOnly: true } }
  ]
};

export const RoleAssignments: CollectionConfig = {
  slug: "role-assignments",
  labels: { singular: "Role assignment", plural: "Role assignments" },
  admin: { group: "System", hidden: true },
  lockDocuments: false,
  access: { read: editorsOnly, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: "role", type: "relationship", relationTo: "newsroom-roles", required: true, index: true },
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true },
    { name: "schoolYear", type: "relationship", relationTo: "school-years", required: true, index: true },
    { name: "scopeMode", type: "select", required: true, defaultValue: "global", options: ROLE_SCOPE_MODES.map((value) => ({ value, label: label(value) })) },
    { name: "sections", type: "relationship", relationTo: "sections", hasMany: true },
    { name: "mediaTypes", type: "select", hasMany: true, options: [...PRODUCTION_TYPE_OPTIONS] }
  ]
};
