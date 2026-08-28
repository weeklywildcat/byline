import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { optionalBuildData } from "@/lib/build-data";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd, absoluteUrl } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import {
  getAllPublicCoverages,
  getCoverageHref,
  getPostHref,
  getPublicCoverageBySlug,
  type WordPressCoverage,
  type WordPressPost
} from "@/lib/wordpress";

type CoveragePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;
export const dynamic = "force-static";

const publication = getPublicationConfig();

export async function generateStaticParams() {
  const coverages = await optionalBuildData("/wp-json/byline/v1/coverage", getAllPublicCoverages, []);

  return withEmptyRouteFallback(
    coverages.map((coverage) => ({ slug: coverage.slug })),
    { slug: BYLINE_EMPTY_ROUTE_SLUG }
  );
}

export async function generateMetadata({ params }: CoveragePageProps): Promise<Metadata> {
  const { slug } = await params;

  if (isBylineEmptyRouteSlug(slug)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const coverage = await optionalBuildData(
    `/wp-json/byline/v1/coverage/${slug}`,
    () => getPublicCoverageBySlug(slug),
    null
  );

  if (!coverage) {
    return {};
  }

  return buildPageMetadata({
    title: coverage.title,
    description: coverage.description || coverage.overview || `${coverage.title} coverage from ${publication.identity.shortName}.`,
    path: getCoverageHref(coverage),
    image: coverage.artwork
  });
}

function getCoverageStoryTitle(post: WordPressPost) {
  return stripHtml(post.title.rendered);
}

function CoverageStory({ post }: { post: WordPressPost }) {
  const title = getCoverageStoryTitle(post);
  const excerpt = stripHtml(post.excerpt.rendered);
  const href = getPostHref(post);

  return (
    <article className="coverage-story">
      <p className="coverage-story-kicker">Story</p>
      <h2><a href={href}>{title}</a></h2>
      {excerpt ? <p>{excerpt}</p> : null}
      {post.date ? <time dateTime={post.date}>{formatDisplayDate(post.date)}</time> : null}
    </article>
  );
}

function getCoverageSchema(coverage: WordPressCoverage) {
  const path = getCoverageHref(coverage);
  const stories = coverage.stories.map((story, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: absoluteUrl(getPostHref(story)),
    name: getCoverageStoryTitle(story)
  }));

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": absoluteUrl(path),
    name: coverage.title,
    description: coverage.description || coverage.overview || undefined,
    url: absoluteUrl(path),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: stories.length,
      itemListElement: stories
    }
  };
}

export default async function CoveragePage({ params }: CoveragePageProps) {
  const { slug } = await params;

  if (isBylineEmptyRouteSlug(slug)) {
    notFound();
  }

  const coverage = await optionalBuildData(
    `/wp-json/byline/v1/coverage/${slug}`,
    () => getPublicCoverageBySlug(slug),
    null
  );

  if (!coverage) {
    notFound();
  }

  const path = getCoverageHref(coverage);
  const description = coverage.description || coverage.overview;
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Coverage", path: "/coverage/" },
    { name: coverage.title, path }
  ]);

  return (
    <main className="section-page-shell coverage-page-shell">
      <script id="coverage-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getCoverageSchema(coverage)) }} />
      <script id="coverage-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <header className="coverage-header">
        {coverage.artwork ? (
          <img
            className="coverage-artwork"
            src={coverage.artwork.url}
            alt={coverage.artwork.alt}
            width={coverage.artwork.width ?? undefined}
            height={coverage.artwork.height ?? undefined}
          />
        ) : null}
        <div>
          <p className="profile-kicker">Coverage</p>
          <h1>{coverage.title}</h1>
          {description ? <p className="coverage-description">{description}</p> : null}
          {coverage.startDate || coverage.endDate ? (
            <p className="coverage-dates">
              {coverage.startDate ? formatDisplayDate(coverage.startDate) : ""}
              {coverage.startDate && coverage.endDate ? " – " : ""}
              {coverage.endDate ? formatDisplayDate(coverage.endDate) : ""}
            </p>
          ) : null}
        </div>
      </header>

      <section className="coverage-story-section" aria-labelledby="coverage-stories-heading">
        <div className="section-heading">
          <div>
            <h2 id="coverage-stories-heading">Stories in this coverage</h2>
            <p>{coverage.stories.length === 1 ? "1 published story" : `${coverage.stories.length} published stories`}</p>
          </div>
        </div>
        {coverage.stories.length > 0 ? (
          <div className="coverage-story-list">
            {coverage.stories.map((story) => <CoverageStory key={story.id} post={story} />)}
          </div>
        ) : (
          <p className="empty-state">No published stories are available for this coverage yet.</p>
        )}
      </section>
    </main>
  );
}
