import type { Payload } from "payload";
import { relationId } from "../access/user";
import type { Person } from "../payload-types";

/** A build input, not a public media URL. Phase 7 materializes public renditions. */
export type PublicPerson = {
  id: number;
  name: string;
  slug: string;
  pronouns: string;
  newsroomRole: string;
  shortBio: string;
  bio: string;
  status: Person["status"];
  portrait: {
    id: number;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
  directoryVisible: boolean;
  hasProfilePage: boolean;
  href: string | null;
  publicEmail: string;
  socials: { label: string; url: string }[];
};

/**
 * The future authors/guests compatibility datasets share one Person authority.
 * Classification follows editorial status, NEVER account linkage. No Users
 * query, join, private image URL or spread of a CMS record is allowed here.
 * Not connected to Snapshot v1/v2 or production delivery in this phase.
 */
export async function publicPeople(
  payload: Payload,
): Promise<{ authors: PublicPerson[]; guests: PublicPerson[] }> {
  const found = await payload.find({
    collection: "people",
    select: {
      name: true,
      slug: true,
      pronouns: true,
      newsroomRole: true,
      shortBio: true,
      bio: true,
      portrait: true,
      status: true,
      directoryVisible: true,
      hasProfilePage: true,
      publicEmail: true,
      socials: true,
    },
    depth: 0,
    pagination: false,
    sort: "name",
    overrideAccess: true,
  });
  const ids = [
    ...new Set(
      found.docs
        .map((doc) => Number(relationId(doc.portrait)))
        .filter((id) => id > 0),
    ),
  ];
  const media = ids.length
    ? await payload.find({
        collection: "media",
        where: { id: { in: ids } },
        select: { alt: true, width: true, height: true, mimeType: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })
    : { docs: [] };
  const photos = new Map(media.docs.map((doc) => [doc.id, doc]));
  const people = found.docs.map((doc): PublicPerson => {
    const asset = photos.get(Number(relationId(doc.portrait)));
    return {
      id: doc.id,
      name: doc.name,
      slug: doc.slug,
      pronouns: doc.pronouns ?? "",
      newsroomRole: doc.newsroomRole ?? "",
      shortBio: doc.shortBio ?? "",
      bio: doc.bio ?? "",
      status: doc.status,
      portrait: asset?.mimeType?.startsWith("image/")
        ? {
            id: asset.id,
            alt: asset.alt ?? "",
            width: asset.width ?? null,
            height: asset.height ?? null,
          }
        : null,
      directoryVisible: doc.directoryVisible === true,
      hasProfilePage: doc.hasProfilePage === true,
      href: doc.hasProfilePage && doc.slug ? `/author/${doc.slug}/` : null,
      publicEmail: doc.publicEmail ?? "",
      socials: (doc.socials ?? []).map(({ label, url }) => ({ label, url })),
    };
  });
  return {
    authors: people.filter((person) => person.status !== "guest"),
    guests: people.filter((person) => person.status === "guest"),
  };
}
