import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { ArticleGameCard } from "@/components/ArticleGameCard";
import { ArticleShareActions } from "@/components/ArticleShareActions";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { NewsroomPollHydrator } from "@/components/NewsroomPollHydrator";
import { ReaderFeedbackForm } from "@/components/ReaderFeedbackForm";
import { ArticleView } from "@byline/ui";
import { getPrimaryVisibleCategory, getPublicTopicTags, isVisibleContentPost } from "@/lib/content";
import { stripHtml, decodeHtml } from "@/lib/format";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { requireBuildData } from "@/lib/build-data";
import { getSportsGameById } from "@/lib/headless";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, getNewsArticleSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import {
  getAllPosts,
  getBylineRestUrl,
  getFeaturedMedia,
  getPostBySlug,
  getPostContributors,
  getPostContributorsWithProfiles,
  getPostGameScoreGameIds,
  getPostHref,
  getPostPrimaryGameId,
  getPostRouteParts,
  getContributorName,
  getPostAuthorWithProfile,
  isGuestContributor,
  type WordPressAuthor
} from "@/lib/wordpress";

const publication = getPublicationConfig();

type ArticleRouteParams = {
  segment: string;
  month: string;
  day: string;
  category: string;
  articleSlug: string;
};

type ArticlePageProps = { params: Promise<ArticleRouteParams> };

export const dynamicParams = false;

// A publication with no published, visible posts must still produce a buildable
// article route. getAllPosts() throws on a CMS failure rather than returning [].
export async function generateStaticParams() {
  const posts = await requireBuildData("/wp-json/wp/v2/posts", getAllPosts);
  const params = posts.filter(isVisibleContentPost).flatMap((post) => {
    const route = getPostRouteParts(post);
    return route ? [{ segment: route.year, month: route.month, day: route.day, category: route.category, articleSlug: route.slug }] : [];
  });
  return withEmptyRouteFallback(params, {
    segment: BYLINE_EMPTY_ROUTE_SLUG,
    month: BYLINE_EMPTY_ROUTE_SLUG,
    day: BYLINE_EMPTY_ROUTE_SLUG,
    category: BYLINE_EMPTY_ROUTE_SLUG,
    articleSlug: BYLINE_EMPTY_ROUTE_SLUG
  });
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { articleSlug } = await params;
  if (isBylineEmptyRouteSlug(articleSlug)) return { title: "Not found", robots: { index: false, follow: false } };
  const post = await getPostBySlug(articleSlug);
  if (!post) return {};
  if (!isVisibleContentPost(post)) return { title: "Not found", robots: { index: false, follow: false } };
  const image = getFeaturedMedia(post);
  const title = stripHtml(post.title.rendered);
  const category = getPrimaryVisibleCategory(post);
  const contributors = getPostContributors(post);
  const tags = getPublicTopicTags(post).map((tag) => stripHtml(tag.name));
  const metadata = buildPageMetadata({ title, description: post.excerpt.rendered || post.content.rendered, path: getPostHref(post), type: "article", image });
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.modified,
      authors: contributors.length > 0 ? contributors.map((contributor) => getContributorName(contributor)) : undefined,
      section: category ? decodeHtml(category.name) : undefined,
      tags
    }
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fbfaf7" };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const routeParams = await params;
  if (isBylineEmptyRouteSlug(routeParams.articleSlug)) notFound();

  const [post, allPosts] = await Promise.all([getPostBySlug(routeParams.articleSlug), getAllPosts()]);
  if (!post || !isVisibleContentPost(post)) notFound();

  const route = getPostRouteParts(post);
  if (!route || route.year !== routeParams.segment || route.month !== routeParams.month || route.day !== routeParams.day || route.category !== routeParams.category) notFound();

  const contributors = await getPostContributorsWithProfiles(post);
  const author = contributors.find((contributor): contributor is WordPressAuthor => !isGuestContributor(contributor)) ?? await getPostAuthorWithProfile(post);
  const primaryGameId = getPostPrimaryGameId(post);
  const primaryGame = primaryGameId ? await getSportsGameById(primaryGameId) : null;
  const showLegacyPrimaryGame = Boolean(primaryGame && !getPostGameScoreGameIds(post).includes(primaryGame.id));
  const title = stripHtml(post.title.rendered);
  const articleUrl = absoluteUrl(getPostHref(post));
  const presentation = buildArticlePresentation({ post, allPosts, contributors, author });
  const category = getPrimaryVisibleCategory(post);
  const metadata = (
    <>
      <script id="newsarticle-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getNewsArticleSchema(post)) }} />
      <script id="article-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getBreadcrumbSchema([
        { name: "Home", path: "/" },
        ...(category ? [{ name: decodeHtml(category.name), path: `/category/${category.slug}/` }] : []),
        { name: title, path: getPostHref(post) }
      ])) }} />
    </>
  );

  return (
    <ArticleView
      presentation={presentation}
      slots={{
        metadata,
        shareActions: <ArticleShareActions title={title} url={articleUrl} />,
        primaryGame: showLegacyPrimaryGame && primaryGame ? <ArticleGameCard game={primaryGame} className="article-primary-game-card" /> : null,
        poll: <NewsroomPollHydrator />,
        feedback: publication.features.readerFeedback !== false ? (
          <ReaderFeedbackForm
            postId={post.id}
            articleTitle={title}
            articleUrl={articleUrl}
            endpointCandidates={[getBylineRestUrl("/feedback"), getBylineRestUrl("/feedback", true)]}
          />
        ) : null,
        newsletter: <NewsletterSignupForm />
      }}
    />
  );
}
