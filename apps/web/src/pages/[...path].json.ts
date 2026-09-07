import { createSearchIndexDocument } from "@/lib/search-index";
import { getSearchPageProps } from "@/views/search/page";

export const prerender = true;

// Astro ignores underscore-prefixed page directories, so keep the required
// /_byline/ path as the only explicit prerendered catch-all endpoint.
export function getStaticPaths() {
  return [{ params: { path: "_byline/search-index" } }];
}

export async function GET({ params }: { params: { path?: string } }) {
  if (params.path !== "_byline/search-index") {
    return new Response("Not Found", { status: 404 });
  }

  const { items } = await getSearchPageProps();

  return new Response(`${JSON.stringify(createSearchIndexDocument(items))}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
