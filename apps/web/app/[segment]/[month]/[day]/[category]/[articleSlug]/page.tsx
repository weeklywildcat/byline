import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { ArticleShareActions } from "@/components/ArticleShareActions";
import { ArticleCorrectionNotices } from "@/components/ArticleCorrectionNotices";
import { ArticleGameCard } from "@/components/ArticleGameCard";
import { AuthorBadge } from "@/components/AuthorBadge";
import { FeaturedImage } from "@/components/FeaturedImage";
import { NewsroomPollHydrator } from "@/components/NewsroomPollHydrator";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { ReaderFeedbackForm } from "@/components/ReaderFeedbackForm";
import { StoryTeaser } from "@/components/StoryTeaser";
import {
  getAthleteSportLabel,
  getAthleteSpotlightLabel,
  getPrimaryVisibleCategory,
  getPublicTopicTags,
  isAthleteSpotlightPost,
  isHiddenCategory,
  isVisibleContentPost
} from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, getNewsArticleSchema, serializeJsonLd } from "@/lib/seo";
import { requireBuildData } from "@/lib/build-data";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import { getSportsGameById } from "@/lib/headless";
import {
  getBylineRestUrl,
  getAllPosts,
  getContributorDescription,
  getContributorHref,
  getContributorName,
  getContributorPhoto,
  getContributorRole,
  getContributorSocialLinks,
  getAuthorProfile,
  getFeaturedMedia,
  getPostBySlug,
  getPostCategories,
  getPostAuthorWithProfile,
  getPostContributors,
  getPostContributorsWithProfiles,
  getPostGameScoreGameIds,
  getPostHref,
  getPostPrimaryGameId,
  getPostRouteParts,
  getPostTags,
  getPublicCorrectionsForPost,
  isGuestContributor,
  type WordPressAuthor,
  type WordPressCategory,
  type WordPressContributor,
  type WordPressPost
} from "@/lib/wordpress";

const publication = getPublicationConfig();

type ArticleRouteParams = {
  segment: string;
  month: string;
  day: string;
  category: string;
  articleSlug: string;
};

type ArticlePageProps = {
  params: Promise<ArticleRouteParams>;
};

export const dynamicParams = false;
const WORDS_PER_MINUTE = 225;

// A publication with no published, visible posts must still produce a buildable
// article route. getAllPosts() throws on a CMS failure rather than returning [].
export async function generateStaticParams() {
  const posts = await requireBuildData("/wp-json/wp/v2/posts", getAllPosts);

  const params = posts.filter(isVisibleContentPost).flatMap((post) => {
    const route = getPostRouteParts(post);

    return route
      ? [
          {
            segment: route.year,
            month: route.month,
            day: route.day,
            category: route.category,
            articleSlug: route.slug
          }
        ]
      : [];
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

  if (isBylineEmptyRouteSlug(articleSlug)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const post = await getPostBySlug(articleSlug);

  if (!post) {
    return {};
  }

  if (!isVisibleContentPost(post)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const image = getFeaturedMedia(post);
  const title = stripHtml(post.title.rendered);
  const category = getPrimaryVisibleCategory(post);
  const contributors = getPostContributors(post);
  const tags = getPublicTopicTags(post).map((tag) => stripHtml(tag.name));
  const metadata = buildPageMetadata({
    title,
    description: post.excerpt.rendered || post.content.rendered,
    path: getPostHref(post),
    type: "article",
    image
  });

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

function getReadingTime(post: WordPressPost) {
  const words = stripHtml(post.content.rendered || post.excerpt.rendered).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));

  return `${minutes} min read`;
}

function hasUpdatedDate(post: WordPressPost) {
  const published = new Date(post.date).getTime();
  const modified = new Date(post.modified).getTime();

  if (!Number.isFinite(published) || !Number.isFinite(modified)) {
    return false;
  }

  return modified - published > 60 * 60 * 1000;
}

function getAuthorInitial(name: string) {
  return stripHtml(name).slice(0, 1) || "W";
}

function getCoverageAreas(posts: WordPressPost[]) {
  const counts = new Map<string, { category: WordPressCategory; count: number }>();

  posts.forEach((post) => {
    const category = getPrimaryVisibleCategory(post);

    if (!category) {
      return;
    }

    const existing = counts.get(category.slug);
    counts.set(category.slug, {
      category,
      count: existing ? existing.count + 1 : 1
    });
  });

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.category.name.localeCompare(right.category.name))
    .slice(0, 3)
    .map(({ category }) => category);
}

function getRelatedPosts(post: WordPressPost, posts: WordPressPost[]) {
  const categorySlugs = new Set(getPostCategories(post).map((category) => category.slug));
  const tagSlugs = new Set(getPostTags(post).map((tag) => tag.slug));

  return posts
    .filter((candidate) => candidate.id !== post.id)
    .map((candidate) => {
      const categoryMatches = getPostCategories(candidate).filter((category) => categorySlugs.has(category.slug)).length;
      const tagMatches = getPostTags(candidate).filter((tag) => tagSlugs.has(tag.slug)).length;

      return {
        post: candidate,
        score: tagMatches * 2 + categoryMatches
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.post.date).getTime() - new Date(left.post.date).getTime())
    .slice(0, 3)
    .map(({ post: relatedPost }) => relatedPost);
}

function postHasContributor(post: WordPressPost, contributor: WordPressContributor) {
  return getPostContributors(post).some((candidate) => {
    if (isGuestContributor(candidate) !== isGuestContributor(contributor)) {
      return false;
    }

    return isGuestContributor(candidate)
      ? candidate.id === contributor.id || candidate.slug === contributor.slug
      : candidate.id === contributor.id;
  });
}

function AboutWriter({
  contributors,
  authorPosts
}: {
  contributors: WordPressContributor[];
  authorPosts: WordPressPost[];
}) {
  const entries: Array<WordPressContributor | null> = contributors.length > 0 ? contributors : [null];
  const coverageAreas = getCoverageAreas(authorPosts);
  const heading = contributors.length > 1 ? "About the Writers" : "About the Writer";

  return (
    <section className="article-after-section about-writer" aria-labelledby="about-writer-heading">
      <div className="section-heading">
        <div>
          <h2 id="about-writer-heading">{heading}</h2>
        </div>
      </div>

      <div className={entries.length > 1 ? "about-writer-contributors" : undefined}>
        {entries.map((contributor, index) => {
          const profile = contributor && !isGuestContributor(contributor) ? getAuthorProfile(contributor) : null;
          const photo = contributor ? getContributorPhoto(contributor) : null;
          const socialLinks = contributor ? getContributorSocialLinks(contributor) : [];
          const contactLink = contributor && !isGuestContributor(contributor)
            ? socialLinks.find((link) => link.label === "Email")
            : undefined;
          const name = contributor ? getContributorName(contributor) : `${publication.identity.shortName} Staff`;
          const role = contributor ? getContributorRole(contributor) : "Writer";
          const description = contributor ? stripHtml(getContributorDescription(contributor)) : "";
          const bio = description || `Stories reported by the ${publication.identity.shortName} newsroom.`;
          const profileHref = contributor ? getContributorHref(contributor) : "/authors/";

          return (
            <div className="about-writer-layout" key={contributor ? `${contributor.id}-${contributor.slug}` : `staff-${index}`}>
              {photo ? (
                <img
                  className="author-avatar about-writer-avatar"
                  src={photo.url}
                  alt={photo.alt || ""}
                  width={photo.width ?? 132}
                  height={photo.height ?? 132}
                />
              ) : (
                <div className="author-avatar author-avatar-fallback about-writer-avatar" aria-hidden="true">
                  {getAuthorInitial(name)}
                </div>
              )}

              <div className="about-writer-body">
                <div className="author-profile-meta">
                  <p className="profile-kicker">{role}</p>
                  {profile?.founder ? <AuthorBadge label="Founder" /> : null}
                </div>
                <h3>{name}</h3>
                {coverageAreas.length > 0 ? (
                  <p className="about-writer-coverage">
                    Covers{" "}
                    {coverageAreas.map((area, areaIndex) => (
                      <span key={area.slug}>
                        <a href={`/category/${area.slug}/`}>{decodeHtml(area.name)}</a>
                        {areaIndex < coverageAreas.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                ) : null}
                <p>{bio}</p>
                <div className="about-writer-links">
                  <a href={profileHref}>View full profile</a>
                  <a href={`${profileHref}#author-stories-heading`}>More stories by {contributor ? name : "the staff"}</a>
                  {contactLink ? <a href={contactLink.href}>Contact</a> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const routeParams = await params;

  if (isBylineEmptyRouteSlug(routeParams.articleSlug)) notFound();

  const [post, allPosts] = await Promise.all([getPostBySlug(routeParams.articleSlug), getAllPosts()]);

  if (!post) {
    notFound();
  }

  if (!isVisibleContentPost(post)) {
    notFound();
  }

  const route = getPostRouteParts(post);

  if (
    !route ||
    route.year !== routeParams.segment ||
    route.month !== routeParams.month ||
    route.day !== routeParams.day ||
    route.category !== routeParams.category
  ) {
    notFound();
  }

  const contributors = await getPostContributorsWithProfiles(post);
  const author = contributors.find((contributor): contributor is WordPressAuthor => !isGuestContributor(contributor))
    ?? await getPostAuthorWithProfile(post);
  const primaryGameId = getPostPrimaryGameId(post);
  const primaryGame = primaryGameId ? await getSportsGameById(primaryGameId) : null;
  const gameScoreGameIds = getPostGameScoreGameIds(post);
  const showLegacyPrimaryGame = Boolean(primaryGame && !gameScoreGameIds.includes(primaryGame.id));
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const topicTags = getPublicTopicTags(post);
  const topicTerms = topicTags.length > 0 ? topicTags : getPostCategories(post).filter((postCategory) => !isHiddenCategory(postCategory));
  const excerpt = post.excerpt.rendered.trim();
  const content = post.content.rendered.trim();
  const title = stripHtml(post.title.rendered);
  const articleUrl = absoluteUrl(getPostHref(post));
  const publicCorrections = getPublicCorrectionsForPost(post);
  const hasPublicCorrectionNotice = publicCorrections.length > 0;
  const updated = hasUpdatedDate(post) && !hasPublicCorrectionNotice;
  const athleteSpotlight = isAthleteSpotlightPost(post);
  const athleteSpotlightLabel = athleteSpotlight ? getAthleteSpotlightLabel(post) : null;
  const athleteSport = athleteSpotlight ? getAthleteSportLabel(post) : null;
  const visiblePosts = allPosts.filter(isVisibleContentPost);
  const authorPosts = contributors.length > 0
    ? visiblePosts.filter((candidate) => contributors.some((contributor) => postHasContributor(candidate, contributor)))
    : author
      ? visiblePosts.filter((candidate) => candidate.author === author.id)
      : [];
  const relatedPosts = getRelatedPosts(post, visiblePosts);
  const relatedPostIds = new Set(relatedPosts.map((relatedPost) => relatedPost.id));
  const moreByAuthorPosts = authorPosts
    .filter((candidate) => candidate.id !== post.id && !relatedPostIds.has(candidate.id))
    .slice(0, 3);
  const newsArticleSchema = getNewsArticleSchema(post);
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    ...(category ? [{ name: decodeHtml(category.name), path: `/category/${category.slug}/` }] : []),
    { name: title, path: getPostHref(post) }
  ]);

  return (
    <main className="article-shell">
      <script
        id="newsarticle-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(newsArticleSchema) }}
      />
      <script
        id="article-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <article className="article-story">
        <header className="article-header">
          {category ? (
            <a className="article-section-label" href={`/category/${category.slug}/`}>
              {decodeHtml(category.name)}
            </a>
          ) : null}
          <h1 dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
          {excerpt ? <div className="article-excerpt" dangerouslySetInnerHTML={{ __html: excerpt }} /> : null}
          {athleteSpotlightLabel || athleteSport ? (
            <div className="article-athlete-meta" aria-label="Athlete spotlight details">
              {athleteSpotlightLabel ? <span>{athleteSpotlightLabel}</span> : null}
              {athleteSport ? <span>{athleteSport}</span> : null}
            </div>
          ) : null}

          <div className="article-meta-block">
            <p className="article-author-line">
              By{" "}
              {contributors.length > 0 ? (
                contributors.map((contributor, index) => (
                  <span key={`${contributor.id}-${contributor.slug}`}>
                    {index > 0 ? ", " : null}
                    <a href={getContributorHref(contributor)}>{getContributorName(contributor)}</a>
                  </span>
                ))
              ) : author ? (
                <a href={getContributorHref(author)}>{getContributorName(author)}</a>
              ) : (
                <span>{publication.identity.shortName} Staff</span>
              )}
            </p>
            <div className="article-timing">
              <time dateTime={post.date}>Published {formatDisplayDate(post.date)}</time>
              {updated ? <time dateTime={post.modified}>Updated {formatDisplayDate(post.modified)}</time> : null}
              <span>{getReadingTime(post)}</span>
            </div>
          </div>

          <ArticleShareActions title={title} url={articleUrl} />
          <FeaturedImage image={image} priority />
        </header>

        {showLegacyPrimaryGame && primaryGame ? <ArticleGameCard game={primaryGame} className="article-primary-game-card" /> : null}

        {content ? (
          <div className="article-body" dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          <p className="empty-state">No article body has been published yet.</p>
        )}

        <ArticleCorrectionNotices corrections={publicCorrections} />

        <NewsroomPollHydrator />

        {topicTerms.length > 0 ? (
          <footer className="article-tags" aria-label="Story topics">
            <h2>Topics</h2>
            <div>
              {topicTerms.map((term) => (
                <span key={`${term.taxonomy}-${term.id}`}>{decodeHtml(term.name)}</span>
              ))}
            </div>
          </footer>
        ) : null}

        {updated ? (
          <aside className="article-update-notice" aria-label="Story update notice">
            <h2>Update</h2>
            <p>This story was updated after initial publication on {formatDisplayDate(post.modified)}.</p>
          </aside>
        ) : null}

        {publication.features.readerFeedback !== false ? (
          <ReaderFeedbackForm
            postId={post.id}
            articleTitle={title}
            articleUrl={articleUrl}
            endpointCandidates={[getBylineRestUrl("/feedback"), getBylineRestUrl("/feedback", true)]}
          />
        ) : null}

        <NewsletterSignupForm />
      </article>

      <div className="article-after">
        <AboutWriter contributors={contributors.length > 0 ? contributors : author ? [author] : []} authorPosts={authorPosts} />

        {relatedPosts.length > 0 ? (
          <section className="article-after-section" aria-labelledby="related-stories-heading">
            <div className="section-heading">
              <div>
                <h2 id="related-stories-heading">Related Stories</h2>
                <p>More from the same section or topic.</p>
              </div>
            </div>
            <div className="article-story-grid">
              {relatedPosts.map((relatedPost) => (
                <StoryTeaser key={relatedPost.id} post={relatedPost} variant="compact" />
              ))}
            </div>
          </section>
        ) : null}

        {moreByAuthorPosts.length > 0 ? (
          <section className="article-after-section" aria-labelledby="more-by-author-heading">
            <div className="section-heading">
              <div>
                <h2 id="more-by-author-heading">
                  {contributors.length > 1 ? "More by the writers" : `More by ${author?.name ?? "the newsroom"}`}
                </h2>
              </div>
            </div>
            <div className="article-story-grid">
              {moreByAuthorPosts.map((authorPost) => (
                <StoryTeaser key={authorPost.id} post={authorPost} variant="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <aside className="weekly-wildcat-callout" aria-labelledby="weekly-wildcat-callout-heading">
          <div>
            <h2 id="weekly-wildcat-callout-heading">Have something we should cover?</h2>
            <p>Send a tip, correction, photo opportunity, or story idea to the {publication.identity.shortName} newsroom.</p>
          </div>
          <a href="/contact/">Contact the newsroom</a>
        </aside>
      </div>
    </main>
  );
}
