import { THE_PROWLER } from "@/lib/the-prowler";

/**
 * How a navigation link relates to the page being rendered: "page" when it is
 * that page, "true" when the page sits inside the link's section (an article,
 * a later page of the archive), nothing otherwise. The value goes straight
 * into aria-current.
 */
export type CurrentLink = "page" | "true" | undefined;

const ARTICLE_PATH = /^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/[^/]+\/?$/;

function withTrailingSlash(path: string) {
  return path.endsWith("/") ? path : `${path}/`;
}

/** The section archive an article address belongs to, as the header links it. */
function articleSectionPath(pathname: string) {
  const category = ARTICLE_PATH.exec(pathname)?.[1];
  if (!category) return undefined;
  return category === THE_PROWLER.slug ? THE_PROWLER.path : `/category/${category}/`;
}

export function currentLink(linkUrl: string, pathname: string | undefined): CurrentLink {
  if (!pathname || !linkUrl.startsWith("/") || linkUrl === "/") return undefined;
  const page = withTrailingSlash(pathname);
  const link = withTrailingSlash(linkUrl);
  if (page === link) return "page";
  if (page.startsWith(link) || articleSectionPath(page) === link) return "true";
  return undefined;
}
