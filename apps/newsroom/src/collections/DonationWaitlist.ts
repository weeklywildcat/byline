import { APIError, type CollectionConfig } from "payload";
import { atLeast, editorsOnly, nobody, newsroomUser } from "../access/user";

const EMAIL_MAX = 320;

export function normalizeDonationEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new APIError("Enter a valid email address.", 400);
  }
  return email;
}

/**
 * Private list of readers who asked to hear when Weekly Wildcat donations open.
 * Public writes go through the narrow /api/donation-waitlist endpoint; the
 * collection's normal REST API is never public.
 */
export const DonationWaitlist: CollectionConfig = {
  slug: "donation-waitlist",
  labels: { singular: "Donation waitlist entry", plural: "Donation waitlist" },
  lockDocuments: false,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "createdAt"],
    group: "Site",
    hidden: ({ user }) => !atLeast(newsroomUser(user), "editor"),
    description: "People who asked to be notified when Weekly Wildcat donations open."
  },
  access: {
    read: editorsOnly,
    create: nobody,
    update: nobody,
    delete: editorsOnly
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.email !== undefined) data.email = normalizeDonationEmail(data.email);
        return data;
      }
    ]
  },
  fields: [
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
      index: true,
      maxLength: EMAIL_MAX
    }
  ]
};
