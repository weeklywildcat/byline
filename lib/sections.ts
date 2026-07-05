export type PublicSection = {
  name: string;
  slug: string;
  href: string;
};

export const PUBLIC_SECTIONS: PublicSection[] = [
  { name: "News", slug: "news", href: "/category/news/" },
  { name: "Sports", slug: "sports", href: "/sports/" },
  { name: "Opinion", slug: "opinion", href: "/category/opinion/" },
  { name: "Features", slug: "features", href: "/category/features/" },
];

export const PUBLIC_SECTION_SLUGS = new Set(PUBLIC_SECTIONS.map((section) => section.slug));
export const FOCUS_SECTION_SLUGS = new Set(["culture"]);
