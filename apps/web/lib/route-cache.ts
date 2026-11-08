import { nativeMedia, nativeStory } from "./native-snapshot";
import { nativeArticlePresentation } from "./native-article";
import { stableDigest } from "@byline/content";
import { buildArticlePresentation } from "./article-presentation";
import { buildCoveragePresentation } from "./coverage-presentation";
import { isGeneralEditorialPost, isVisibleContentPost } from "./content";
import { getPublicationConfig } from "./publication";
import { getPostContributors, isGuestContributor, getPostPrimaryGameId, type WordPressAuthor, type WordPressPost } from "./wordpress";
import type { WebBuildSnapshot } from "./build-snapshot";

const identity = (person: { id: string | number; type?: string }) => `${person.type === "guest" ? "guest" : "user"}:${person.id}`;
/** Keep the exact presentation calculation shared with the article renderer.
 * The selected related/more-by cards and coverage-area counts, rather than all
 * candidate story bodies, determine whether a different article changes HTML. */
export function articleRenderInputs(snapshot: WebBuildSnapshot, post: WordPressPost) {
  const contributors = getPostContributors(post).map((embedded) => snapshot.contributors.find((candidate) =>
    isGuestContributor(candidate) === isGuestContributor(embedded) && (candidate.id === embedded.id || candidate.slug === embedded.slug)
  ) ?? embedded);
  const author = contributors.find((person): person is WordPressAuthor => !isGuestContributor(person)) ?? null;
  const keys = contributors.map(identity);
  const authorPosts = [...new Map(keys.flatMap((key) => snapshot.indexes.postsByContributor.get(key) ?? []).map((candidate) => [candidate.id, candidate])).values()].filter(isVisibleContentPost);
  const related = [...new Map([
    ...post.categories.flatMap((id) => snapshot.indexes.postsByCategory.get(id) ?? []),
    ...post.tags.flatMap((id) => snapshot.indexes.postsByTag.get(id) ?? [])
  ].map((candidate) => [candidate.id, candidate])).values()].filter(isVisibleContentPost);
  return {
    presentation: buildArticlePresentation({ post, allPosts: snapshot.posts, contributors, author, visiblePosts: snapshot.posts.filter(isVisibleContentPost), authorPosts, relatedCandidates: related, coverages: snapshot.sports.coverages }),
    primaryGame: snapshot.games.find((game) => game.id === getPostPrimaryGameId(post)) ?? null
  };
}

export type DynamicRouteKind = "article" | "category" | "author" | "page" | "coverage";
export function routeCacheDependency(snapshot: WebBuildSnapshot, kind: DynamicRouteKind, id: string | number, publication = getPublicationConfig()) {
  // Revision changes alone must not invalidate every page. All presentation
  // state does: navigation, branding, SEO, feature gates, URLs and locale.
  const { revision: _revision, ...global } = publication;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: publication.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let data: unknown;
  let dependencies: unknown;
  if (kind === "article") {
    const story = nativeStory(Number(id));
    const post = story ? undefined : snapshot.posts.find((entry) => String(entry.id) === String(id));
    if (!story && (!post || !isVisibleContentPost(post))) throw new Error(`No public article ${id} for incremental rendering`);
    const render = story ? { presentation: nativeArticlePresentation(story), primaryGame: null } : articleRenderInputs(snapshot, post!);
    const mediaIds = story?.body.format === "byline-v1" ? Object.values(story.body.media).map(({ id }) => Number(id)) : [];
    const media = story ? [...new Set([...mediaIds, ...(story.image ? [story.image] : [])])].map(nativeMedia) : undefined;
    data = { post, story, media, ...render };
    dependencies = { post: story?.id ?? post!.id, related: render.presentation.relatedStories.map((entry) => entry.id), moreBy: render.presentation.moreByAuthorStories.map((entry) => entry.id), contributors: render.presentation.contributors.map((entry) => entry.id), series: render.presentation.series?.href ?? null };
  } else if (kind === "category") {
    const category = snapshot.categories.find((entry) => String(entry.id) === String(id));
    const posts = snapshot.posts.filter((post) => post.categories.includes(Number(id)) && isGeneralEditorialPost(post));
    data = { category, posts };
    dependencies = { category: id, posts: posts.map((post) => post.id) };
  } else if (kind === "author") {
    const contributor = snapshot.contributors.find((entry) => identity(entry) === String(id));
    const posts = snapshot.indexes.postsByContributor.get(String(id))?.filter(isVisibleContentPost) ?? [];
    data = { contributor, posts };
    dependencies = { contributor: id, posts: posts.map((post) => post.id) };
  } else if (kind === "page") {
    data = snapshot.pages.find((entry) => entry.slug === id);
    dependencies = { page: id };
  } else {
    const coverage = snapshot.sports.coverages.find((entry) => entry.slug === id);
    // The page shows each story's photo, byline and reading time, not just the coverage record.
    data = coverage ? buildCoveragePresentation(coverage, snapshot.posts) : undefined;
    dependencies = { coverage: id, posts: coverage?.stories.map((story) => story.id) ?? [] };
  }
  const environment = {
    publicSite: process.env.NEXT_PUBLIC_SITE_URL || publication.urls.publicSite,
    cmsApi: process.env.NEXT_PUBLIC_WP_API_URL || `${publication.urls.cms.replace(/\/$/, "")}/wp-json/wp/v2`,
    processTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    mirrorMedia: process.env.WORDPRESS_MEDIA_MIRROR !== "0"
  };
  return { key: stableDigest({ version: 1, kind, global, environment, date, data }), dependencies };
}
export function routeCacheKey(snapshot: WebBuildSnapshot, kind: DynamicRouteKind, id: string | number) {
  return routeCacheDependency(snapshot, kind, id).key;
}
