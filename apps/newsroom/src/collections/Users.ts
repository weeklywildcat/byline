import { lockAccountChanges, requireOtherAdministrator } from "../newsroom/accounts";
import { APIError, type CollectionConfig, type PayloadRequest } from "payload";
import { administratorsOnly, administratorsOnlyField, atLeast, newsroomUser, requestUser, sameId } from "../access/user";
import { ROLE_OPTIONS } from "../domain/vocabulary";

const selfOrAdministrator = ({ req, id }: { req: PayloadRequest; id?: number | string }) => {
  const user = requestUser(req);
  return Boolean(user && (atLeast(user, "administrator") || sameId(user.id, id)));
};

/**
 * Private sign-in accounts. A public byline is a `people` record; an account
 * points at its person through `linkedPerson`. Disabling or deleting an account
 * never touches people, so no historical byline can disappear.
 */
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "Account", plural: "Accounts" },
  auth: {
    useSessions: true,
    tokenExpiration: 60 * 60 * 10,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: { sameSite: "Lax", secure: process.env.NODE_ENV === "production" }
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "email", "role", "enabled"],
    group: false,
    hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator")
  },
  access: {
    // Enabled accounts may use the newsroom; a disabled account is signed out everywhere.
    admin: ({ req }) => requestUser(req) !== null,
    // Colleagues' names are needed to assign work; private fields are restricted below.
    read: ({ req }) => requestUser(req) !== null,
    create: administratorsOnly,
    update: ({ req, id }) => selfOrAdministrator({ req, id }),
    delete: administratorsOnly,
    unlock: administratorsOnly
  },
  hooks: {
    beforeOperation: [async ({ operation, args, req, overrideAccess }) => {
      if (!overrideAccess && (operation === "update" || operation === "delete") && !("id" in args)) {
        throw new APIError("Change one sign-in account at a time.", 400);
      }
      if (operation === "create" || operation === "update" || operation === "delete") await lockAccountChanges(req);
      return args;
    }],
    beforeDelete: [async ({ req, id }) => {
      const account = await req.payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true, req });
      if (account.role === "administrator" && account.enabled === true) await requireOtherAdministrator(req, id);
    }],
    beforeLogin: [
      ({ user }) => {
        if (user.enabled !== true) throw new APIError("This account is disabled.", 403);
      }
    ],
    beforeChange: [
      async ({ req, data, operation }) => {
        // The very first account is the newsroom's enabled administrator, whatever the form says.
        if (operation !== "create") return data;
        const { totalDocs } = await req.payload.count({ collection: "users", overrideAccess: true, req });
        if (totalDocs === 0) Object.assign(data, { role: "administrator", enabled: true });
        return data;
      },
      async ({ req, data, originalDoc, operation }) => {
        // Never leave the newsroom without an enabled administrator.
        if (operation !== "update" || originalDoc?.role !== "administrator" || originalDoc?.enabled === false) return data;
        const demoted = (data.role !== undefined && data.role !== "administrator") || data.enabled === false;
        if (!demoted) return data;
        await requireOtherAdministrator(req, originalDoc.id);
        return data;
      }
    ]
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 120 },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "staff",
      options: [...ROLE_OPTIONS],
      saveToJWT: true,
      access: { update: administratorsOnlyField, create: administratorsOnlyField }
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      index: true,
      admin: { description: "A disabled account cannot sign in. Its bylines and history stay." },
      access: { update: administratorsOnlyField, create: administratorsOnlyField }
    },
    {
      name: "linkedPerson",
      type: "relationship",
      relationTo: "people",
      admin: { description: "The public byline this account writes as." },
      access: { update: administratorsOnlyField, create: administratorsOnlyField }
    },
    {
      name: "googleSubject",
      type: "text",
      unique: true,
      index: true,
      admin: { readOnly: true, description: "Set on the first Google sign-in of an invited account." },
      access: { read: administratorsOnlyField, update: () => false, create: () => false }
    },
    {
      name: "discordUserId",
      type: "text",
      index: true,
      access: { read: ({ req, id }) => selfOrAdministrator({ req, id }), update: administratorsOnlyField, create: administratorsOnlyField }
    },
    {
      name: "preferences",
      type: "group",
      access: { read: ({ req, id }) => selfOrAdministrator({ req, id }) },
      fields: [
        { name: "notifyAssignments", type: "checkbox", defaultValue: true, label: "Work assigned to me" },
        { name: "notifyAppointments", type: "checkbox", defaultValue: true, label: "Interviews and appointments" },
        { name: "notifyDigest", type: "checkbox", defaultValue: true, label: "Daily due-work digest" }
      ]
    }
  ]
};
