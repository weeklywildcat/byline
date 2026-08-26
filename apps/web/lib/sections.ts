import { getPublicationConfig } from "@/lib/publication";

export type PublicSection = {
  name: string;
  slug: string;
  href: string;
};

const publication = getPublicationConfig();

export const PUBLIC_SECTIONS: PublicSection[] = publication.sections
  .filter((section) => section.active)
  .filter((section) => section.slug !== "sports" || publication.features.sports)
  .map((section) => ({
    name: section.name,
    slug: section.slug,
    href: section.slug === "sports" ? "/sports/" : `/category/${section.slug}/`
  }));

export const PUBLIC_SECTION_SLUGS = new Set(PUBLIC_SECTIONS.map((section) => section.slug));
export const FOCUS_SECTION_SLUGS = new Set(PUBLIC_SECTIONS.filter((section) => section.slug === "culture").map((section) => section.slug));
