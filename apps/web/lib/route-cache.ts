import { nativeMedia, nativeStory, publicDataPresentationRegistry } from "./native-snapshot";
import { publicDataProject, publicDataProjectById, publicDataSection } from "./public-data";
import { nativeArticlePresentation } from "./native-article";
import { stableDigest } from "@byline/content";
import { buildArticlePresentation } from "./article-presentation";
import { buildCoveragePresentation } from "./coverage-presentation";
import { isGeneralEditorialPost, isVisibleContentPost } from "./content";
import { getPublicationConfig } from "./publication";
import { getPostContributors, isGuestContributor, getPostPrimaryGameId, type ArchiveAuthor, type ArchivePost } from "./public-content";
import type { WebBuildSnapshot } from "./build-snapshot";

const identity = (person: { id: string | number; type?: string }) => `${person.type === "guest" ? "guest" : "user"}:${person.id}`;
/** Keep the exact presentation calculation shared with the article renderer.
 * The selected related/more-by cards and coverage-area counts, rather than all
 * candidate story bodies, determine whether a different article changes HTML. */
export function articleRenderInputs(snapshot: WebBuildSnapshot, post: ArchivePost) {
  const contributors = getPostContributors(post).map((embedded) => snapshot.contributors.find((candidate) =>
    isGuestContributor(candidate) === isGuestContributor(embedded) && (candidate.id === embedded.id || candidate.slug === embedded.slug)
  ) ?? embedded);
  const author = contributors.find((person): person is ArchiveAuthor => !isGuestContributor(person)) ?? null;
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

/**
 * What a Story's Data Project blocks draw: for each embedded project, its
 * public facts, the exact release descriptors its bindings name and its
 * presentation's descriptor. The embed's heading and description are in the
 * body already. Another project, dataset or release never appears here, so it
 * never changes this Story's key.
 */
function dataEmbedInputs(story: NonNullable<ReturnType<typeof nativeStory>>) {
  if (story.body.format !== "byline-v1") return [];
  const ids = [...new Set(story.body.nodes.flatMap((node) => (node.type === "dataProject" && node.project !== null ? [String(node.project)] : [])))].sort();
  return ids.map((id) => {
    const found = publicDataProjectById(id);
    if (!found) throw new Error(`Story ${story.id} embeds Data Project ${id}, which is not published in this build`);
    // The standalone page's related coverage is not part of an embed.
    const { relatedStories: _related, ...project } = found;
    const shas = new Set(found.bindings.map((binding) => binding.release));
    return {
      project,
      releases: publicDataSection().releases.filter((release) => shas.has(release.sha256)),
      presentation: publicDataPresentationRegistry()[found.presentation.key]?.descriptor ?? null
    };
  });
}

export type DynamicRouteKind = "article" | "category" | "author" | "page" | "coverage" | "data";
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
    const embeds = story ? dataEmbedInputs(story) : [];
    // Only a story that places Data Projects carries their facts; every other story's key is exactly what it was.
    data = { post, story, media, ...render, ...(embeds.length ? { dataEmbeds: embeds } : {}) };
    dependencies = { ...(embeds.length ? { dataProjects: embeds.map((embed) => ({ project: embed.project.id, releases: embed.releases.map((release) => release.sha256) })) } : {}), post: story?.id ?? post!.id, related: render.presentation.relatedStories.map((entry) => entry.id), moreBy: render.presentation.moreByAuthorStories.map((entry) => entry.id), contributors: render.presentation.contributors.map((entry) => entry.id), series: render.presentation.series?.href ?? null };
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
  } else if (kind === "data") {
    // A Data page changes with its project, the exact releases it uses (by digest), its presentation's
    // descriptor and its related Stories' public facts; never with an unrelated dataset or release.
    const project = publicDataProject(String(id));
    if (!project) throw new Error(`No public Data project ${id} for incremental rendering`);
    const shas = new Set(project.bindings.map((binding) => binding.release));
    data = {
      project,
      releases: publicDataSection().releases.filter((release) => shas.has(release.sha256)),
      presentation: publicDataPresentationRegistry()[project.presentation.key]?.descriptor ?? null,
      related: project.relatedStories.map((storyId) => { const story = nativeStory(storyId); return story ? { id: story.id, title: story.title, href: story.href } : null; })
    };
    dependencies = { project: project.slug, releases: [...shas], related: project.relatedStories };
  } else {
    const coverage = snapshot.sports.coverages.find((entry) => entry.slug === id);
    // The page shows each story's photo, byline and reading time, not just the coverage record.
    data = coverage ? buildCoveragePresentation(coverage, snapshot.posts) : undefined;
    dependencies = { coverage: id, posts: coverage?.stories.map((story) => story.id) ?? [] };
  }
  const environment = {
    publicSite: process.env.NEXT_PUBLIC_SITE_URL || publication.urls.publicSite,
    processTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return { key: stableDigest({ version: 1, kind, global, environment, date, data }), dependencies };
}
export function routeCacheKey(snapshot: WebBuildSnapshot, kind: DynamicRouteKind, id: string | number) {
  return routeCacheDependency(snapshot, kind, id).key;
}
