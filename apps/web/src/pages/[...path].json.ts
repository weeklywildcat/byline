import { getBuildSnapshot } from "@/lib/build-snapshot";
import { isVisibleContentPost } from "@/lib/content";
import { buildLiveFeed } from "@/lib/live-coverage";
import { createSearchIndexDocument } from "@/lib/search-index";
import { getPostLiveCoverage } from "@/lib/wordpress";
import { getSearchPageProps } from "@/views/search/page";

export const prerender = true;

const LIVE_PREFIX = "_byline/live/";

// Astro ignores underscore-prefixed page directories, so keep the required
// /_byline/ path as the only explicit prerendered catch-all endpoint. It also
// emits /_byline/live/<postId>.json for every story that has been live; open
// live pages re-read it (no-cache, see scripts/generate-headers.mjs).
export async function getStaticPaths() {
  const snapshot = await getBuildSnapshot();
  const livePaths = snapshot.posts
    .filter((post) => isVisibleContentPost(post) && getPostLiveCoverage(post))
    .map((post) => ({ params: { path: `${LIVE_PREFIX}${post.id}` } }));
  return [{ params: { path: "_byline/search-index" } }, ...livePaths];
}

const json = (value: unknown) => new Response(`${JSON.stringify(value)}\n`, {
  headers: {
    "Content-Type": "application/json; charset=utf-8"
  }
});

export async function GET({ params }: { params: { path?: string } }) {
  if (params.path?.startsWith(LIVE_PREFIX)) {
    const snapshot = await getBuildSnapshot();
    const id = Number(params.path.slice(LIVE_PREFIX.length));
    const post = snapshot.posts.find((candidate) => candidate.id === id);
    const feed = post ? buildLiveFeed(post) : null;
    return feed ? json(feed) : new Response("Not Found", { status: 404 });
  }

  if (params.path !== "_byline/search-index") {
    return new Response("Not Found", { status: 404 });
  }

  const { items } = await getSearchPageProps();

  return json(createSearchIndexDocument(items));
}
