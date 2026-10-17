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
    href: `/category/${section.slug}/`
  }));

export const PUBLIC_SECTION_SLUGS = new Set(PUBLIC_SECTIONS.map((section) => section.slug));
export const FOCUS_SECTION_SLUGS = new Set(PUBLIC_SECTIONS.filter((section) => section.slug === "culture").map((section) => section.slug));

export function getSectionDescription(slug: string) {
  return publication.sections.find((section) => section.slug === slug)?.description.trim() ?? "";
}

// A category description written in WordPress wins, but only when it says
// something. One- or two-word labels ("Breaking & general") make poor search
// snippets, so those fall back to the publication's own section description.
const MIN_CATEGORY_DESCRIPTION_WORDS = 6;
const MIN_CATEGORY_DESCRIPTION_LENGTH = 40;

export function isUsableCategoryDescription(description: string) {
  const text = description.trim();

  return text.length >= MIN_CATEGORY_DESCRIPTION_LENGTH && text.split(/\s+/).length >= MIN_CATEGORY_DESCRIPTION_WORDS;
}

/** The meta description for a section page. `description` is the plain-text WordPress category description. */
export function getCategorySeoDescription(category: { slug: string; name: string; description: string }) {
  if (isUsableCategoryDescription(category.description)) {
    return category.description.trim();
  }

  return (
    getSectionDescription(category.slug) ||
    `${category.name} coverage from ${publication.identity.shortName}, the student newspaper of ${publication.identity.organizationName || "our school"}.`
  );
}
