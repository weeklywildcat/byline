import { collapseRedirects, normalizeRedirectPath } from "@byline/content";
import { APIError, type CollectionConfig } from "payload";
import { administratorsOnly, requestUser } from "../access/user";
import { lockPublicPaths, readRedirects, rejectLiveRedirectSource } from "../public/url-changes";

export const Redirects: CollectionConfig = {
  slug: "redirects",
  admin: { useAsTitle: "from", group: false, defaultColumns: ["from", "to", "reason", "updatedAt"] },
  access: { read: administratorsOnly, create: administratorsOnly, update: administratorsOnly, delete: administratorsOnly },
  hooks: {
    beforeOperation: [({ operation, args, overrideAccess }) => {
      if (!overrideAccess && (operation === "update" || operation === "delete") && !("id" in args)) {
        throw new APIError("Change one redirect at a time.", 400);
      }
      return args;
    }],
    beforeValidate: [({ data }) => {
      if (!data) return data;
      try {
        for (const field of ["from", "to"] as const) {
          if (data[field] !== undefined) data[field] = normalizeRedirectPath(data[field]);
        }
      } catch (error) {
        throw new APIError((error as Error).message, 400);
      }
      return data;
    }],
    beforeChange: [async ({ req, data, originalDoc, operation, context }) => {
      if (context.bylineAutomaticRedirect === true) return data;
      await lockPublicPaths(req);
      if (operation === "update" && originalDoc?.reason !== "manual") throw new APIError("This redirect belongs to a public URL change.", 403);
      data.reason = "manual";
      if (operation === "create") data.createdBy = requestUser(req)?.id ?? null;
      else data.createdBy = originalDoc?.createdBy ?? null;
      await rejectLiveRedirectSource(req, data.from ?? originalDoc?.from);
      try {
        collapseRedirects([
          ...(await readRedirects(req)).filter((row) => row.id !== originalDoc?.id),
          { from: data.from ?? originalDoc?.from, to: data.to ?? originalDoc?.to }
        ]);
      } catch (error) {
        throw new APIError((error as Error).message, 409);
      }
      return data;
    }],
    beforeDelete: [async ({ req, id, context }) => {
      if (context.bylineAutomaticRedirect === true) return;
      await lockPublicPaths(req);
      const row = await req.payload.findByID({ collection: "redirects", id, req, depth: 0, overrideAccess: true });
      if (row.reason !== "manual") throw new APIError("Automatic redirects protect historical public URLs and cannot be deleted here.", 403);
    }]
  },
  fields: [
    { name: "from", label: "Old path", type: "text", required: true, unique: true, maxLength: 500 },
    { name: "to", label: "Destination path", type: "text", required: true, maxLength: 500 },
    { name: "reason", type: "select", required: true, defaultValue: "manual", options: ["manual", "story-url-change", "page-url-change", "section-slug-change"], admin: { readOnly: true } },
    { name: "createdBy", type: "relationship", relationTo: "users", admin: { readOnly: true } }
  ]
};
