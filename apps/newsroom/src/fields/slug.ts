import type { CollectionSlug, NumberField, TextField, Where } from "payload";
import { isSlug, slugify } from "../domain/slug";

/**
 * A unique slug. Left empty, it is generated from `from` and made unique with
 * a numeric suffix; a slug someone typed is kept as typed and a duplicate is
 * refused. An existing slug never changes on its own: URLs depend on it.
 */
export function slugField(from: string, collection: CollectionSlug, overrides: Partial<TextField> = {}): TextField {
  return {
    name: "slug",
    type: "text",
    required: true,
    unique: true,
    index: true,
    admin: { position: "sidebar", description: "Part of the public URL. Changing it after publication breaks links." },
    validate: (value: unknown) => (isSlug(value) ? true : "Use lowercase letters, numbers and hyphens."),
    hooks: {
      beforeValidate: [
        async ({ value, data, originalDoc, req }) => {
          if (typeof value === "string" && value.trim() !== "") return slugify(value);
          if (originalDoc?.slug) return originalDoc.slug;
          const base = slugify(data?.[from]);
          if (!base) return null;
          for (let attempt = 1; attempt < 50; attempt += 1) {
            const candidate = attempt === 1 ? base : `${base.slice(0, 115)}-${attempt}`;
            const where: Where = originalDoc?.id ? { and: [{ slug: { equals: candidate } }, { id: { not_equals: originalDoc.id } }] } : { slug: { equals: candidate } };
            const { totalDocs } = await req.payload.count({ collection, where, overrideAccess: true, req });
            if (totalDocs === 0) return candidate;
          }
          return `${base.slice(0, 100)}-${Date.now()}`;
        }
      ]
    },
    ...overrides
  } as TextField;
}

/** The WordPress ID a record was imported from. Read-only; only the import sets it. */
export function legacyIdField(name = "legacyWordPressId", label = "WordPress ID"): NumberField {
  return {
    name,
    label,
    type: "number",
    index: true,
    admin: { readOnly: true, position: "sidebar", condition: (data) => Boolean(data?.[name]) },
    access: { update: () => false, create: ({ req }) => req.context?.bylineImport === true }
  };
}
