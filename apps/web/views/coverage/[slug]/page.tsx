import { StoryVideoBadge } from "@byline/ui";
import type { Metadata } from "@/lib/metadata";
import { notFound } from "@/lib/static-not-found";
import { optionalBuildData } from "@/lib/build-data";
import { stripHtml } from "@/lib/format";
import { buildCoveragePresentation, type CoverageStoryView } from "@/lib/coverage-presentation";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd, absoluteUrl } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAllPosts,
  getCoverageHref,
  getPostHref,
  getPublicCoverageBySlug,
  type WordPressCoverage
} from "@/lib/wordpress";

type CoveragePageProps = {
  params: Promise<{ slug: string }>;
};

const publication = getPublicationConfig();

export async function getMetadata({ params }: CoveragePageProps): Promise<Metadata> {
  const { slug } = await params;

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
    description: coverage.description || coverage.overview || (coverage.format === "series"
      ? `${coverage.title}, a ${publication.identity.shortName} series.`
      : `${coverage.title} coverage from ${publication.identity.shortName}.`),
    path: getCoverageHref(coverage),
    image: coverage.artwork
  });
}

function CoverageStoryImage({ story }: { story: CoverageStoryView }) {
  if (!story.image) return null;
  return (
    <img
      className="coverage-part-image"
      src={story.image.src}
      srcSet={story.image.srcSet}
      sizes={story.image.sizes}
      alt=""
      width={story.image.width ?? undefined}
      height={story.image.height ?? undefined}
      loading={story.number <= 2 ? "eager" : "lazy"}
      decoding="async"
      style={story.image.objectPosition ? { objectPosition: story.image.objectPosition } : undefined}
    />
  );
}

function CoverageStoryMeta({ story }: { story: CoverageStoryView }) {
  return (
    <p className="coverage-part-meta">
      {story.video ? <StoryVideoBadge /> : null}
      {story.byline ? <span>By {story.byline}</span> : null}
      {story.dateLabel ? <time dateTime={story.date ?? undefined}>{story.dateLabel}</time> : null}
      <span>{story.readingTime}</span>
    </p>
  );
}

/** One story: a numbered part of a series, or a story in ongoing coverage. */
function CoveragePart({ story, series, lead = false }: { story: CoverageStoryView; series: boolean; lead?: boolean }) {
  return (
    <li className={lead ? "coverage-part coverage-part-lead" : "coverage-part"}>
      {series ? <p className="coverage-part-number" aria-hidden="true">{story.number}</p> : null}
      <div className="coverage-part-body">
        {series ? <p className="coverage-part-kicker">Part {story.number}</p> : story.category ? <p className="coverage-part-kicker">{story.category}</p> : null}
        <h3><a href={story.href}>{story.title}</a></h3>
        {story.excerptHtml ? <div className="coverage-part-excerpt" dangerouslySetInnerHTML={{ __html: story.excerptHtml }} /> : null}
        <CoverageStoryMeta story={story} />
      </div>
      <CoverageStoryImage story={story} />
    </li>
  );
}

function getCoverageSchema(coverage: WordPressCoverage) {
  const path = getCoverageHref(coverage);
  const pageUrl = absoluteUrl(path);
  const imageId = coverage.artwork?.url ? `${pageUrl}#primaryimage` : undefined;
  const stories = coverage.stories.map((story, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: absoluteUrl(getPostHref(story)),
    name: stripHtml(story.title.rendered)
  }));

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": pageUrl,
    name: coverage.title,
    description: coverage.description || coverage.overview || undefined,
    url: pageUrl,
    image: coverage.artwork?.url
      ? {
          "@type": "ImageObject",
          "@id": imageId,
          url: absoluteUrl(coverage.artwork.url),
          contentUrl: absoluteUrl(coverage.artwork.url),
          width: coverage.artwork.width ?? undefined,
          height: coverage.artwork.height ?? undefined
        }
      : undefined,
    primaryImageOfPage: imageId ? { "@id": imageId } : undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: stories.length,
      itemListElement: stories
    }
  };
}

export default async function CoveragePage({ params }: CoveragePageProps) {
  const { slug } = await params;

  const coverage = await optionalBuildData(
    `/wp-json/byline/v1/coverage/${slug}`,
    () => getPublicCoverageBySlug(slug),
    null
  );

  if (!coverage) {
    notFound();
  }

  const allPosts = await getAllPosts();
  const view = buildCoveragePresentation(coverage, allPosts);
  const series = view.format === "series";
  const [lead, ...rest] = view.stories;
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Coverage", path: "/coverage/" },
    { name: view.title, path: view.href }
  ]);

  return (
    <main className={`section-page-shell coverage-page-shell coverage-page-${view.format}`}>
      <script id="coverage-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getCoverageSchema(coverage)) }} />
      <script id="coverage-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <header className={view.artwork ? "coverage-hero coverage-hero-with-art" : "coverage-hero"}>
        <div className="coverage-hero-text">
          <p className="coverage-kicker">
            <a href="/coverage/">{series ? `A ${publication.identity.shortName} series` : "Ongoing coverage"}</a>
          </p>
          <h1>{view.title}</h1>
          {view.description ? <p className="coverage-description">{view.description}</p> : null}
          <p className="coverage-meta">
            <span>{view.countLabel}</span>
            {view.dateLabel ? <span>{view.dateLabel}</span> : null}
            {!view.complete && !series && view.stories.length > 0 ? <span className="coverage-meta-live">Updated as reporting develops</span> : null}
          </p>
          {series && view.startHref ? (
            <a className="coverage-start" href={view.startHref}>Start with Part 1 <span aria-hidden="true">→</span></a>
          ) : null}
        </div>
        {view.artwork ? (
          <figure className="coverage-hero-art">
            <img
              src={view.artwork.url}
              alt={view.artwork.alt}
              width={view.artwork.width ?? undefined}
              height={view.artwork.height ?? undefined}
              fetchPriority="high"
              decoding="async"
              style={view.artwork.objectPosition ? { objectPosition: view.artwork.objectPosition } : undefined}
            />
          </figure>
        ) : null}
      </header>

      {view.overviewParagraphs.length > 0 ? (
        <section className="coverage-overview" aria-label={series ? "About this series" : "About this coverage"}>
          {view.overviewParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
      ) : null}

      <section className="coverage-parts" aria-labelledby="coverage-stories-heading">
        <h2 id="coverage-stories-heading" className="coverage-parts-heading">{series ? "Read the series" : "The latest"}</h2>
        {view.stories.length === 0 ? (
          <p className="empty-state">{series ? "The first part of this series will be published soon." : "No published stories are available for this coverage yet."}</p>
        ) : series ? (
          <ol className="coverage-part-list">
            {view.stories.map((story) => <CoveragePart key={story.id} story={story} series />)}
          </ol>
        ) : (
          <ul className="coverage-part-list">
            {lead ? <CoveragePart story={lead} series={false} lead /> : null}
            {rest.map((story) => <CoveragePart key={story.id} story={story} series={false} />)}
          </ul>
        )}
        {series && !view.complete && view.stories.length > 0 ? (
          <p className="coverage-parts-note">More parts are on the way. Check back, or follow {publication.identity.shortName} for the next one.</p>
        ) : null}
      </section>
    </main>
  );
}
