import type { Metadata } from "next";
import { optionalBuildData } from "@/lib/build-data";
import { formatDisplayDate } from "@/lib/format";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAllPublicCoverages,
  getCoverageHref,
  type WordPressCoverage
} from "@/lib/wordpress";

export const dynamic = "force-static";

const publication = getPublicationConfig();

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Coverage",
    description: `Special coverage, explainers, and ongoing reporting from ${publication.identity.shortName}.`,
    path: "/coverage/"
  })
};

function coverageSortValue(coverage: WordPressCoverage) {
  return coverage.modified || coverage.startDate || "";
}

function CoverageCard({ coverage }: { coverage: WordPressCoverage }) {
  const href = getCoverageHref(coverage);
  const dateLabel = coverage.startDate || coverage.endDate
    ? [coverage.startDate, coverage.endDate]
        .filter(Boolean)
        .map((date) => formatDisplayDate(date as string))
        .join(" – ")
    : "";

  return (
    <article className="coverage-story">
      {coverage.artwork ? (
        <img
          className="coverage-artwork"
          src={coverage.artwork.url}
          alt={coverage.artwork.alt}
          width={coverage.artwork.width ?? undefined}
          height={coverage.artwork.height ?? undefined}
          loading="lazy"
        />
      ) : null}
      <p className="coverage-story-kicker">Coverage</p>
      <h2><a href={href}>{coverage.title}</a></h2>
      {coverage.description || coverage.overview ? (
        <p>{coverage.description || coverage.overview}</p>
      ) : null}
      <p className="coverage-story-meta">
        {dateLabel ? <span>{dateLabel}</span> : null}
        <span>{coverage.stories.length === 1 ? "1 published story" : `${coverage.stories.length} published stories`}</span>
      </p>
    </article>
  );
}

function getCoverageIndexSchema(coverages: WordPressCoverage[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": absoluteUrl("/coverage/"),
    name: "Coverage",
    url: absoluteUrl("/coverage/"),
    description: `Special coverage, explainers, and ongoing reporting from ${publication.identity.shortName}.`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: coverages.length,
      itemListElement: coverages.map((coverage, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: coverage.title,
        url: absoluteUrl(getCoverageHref(coverage))
      }))
    }
  };
}

export default async function CoverageIndexPage() {
  const coverages = await optionalBuildData(
    "/wp-json/byline/v1/coverage",
    getAllPublicCoverages,
    []
  );
  const sortedCoverages = [...coverages].sort((a, b) =>
    coverageSortValue(b).localeCompare(coverageSortValue(a)) || a.title.localeCompare(b.title)
  );
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Coverage", path: "/coverage/" }
  ]);

  return (
    <main className="section-page-shell coverage-page-shell">
      <script
        id="coverage-index-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(getCoverageIndexSchema(sortedCoverages)) }}
      />
      <script
        id="coverage-index-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <header className="section-heading">
        <div>
          <h1>Coverage</h1>
          <p>Follow the stories and reporting projects shaping the {publication.identity.shortName} community.</p>
        </div>
      </header>

      {sortedCoverages.length > 0 ? (
        <div className="coverage-story-list" aria-label="Coverage projects">
          {sortedCoverages.map((coverage) => <CoverageCard key={coverage.id} coverage={coverage} />)}
        </div>
      ) : (
        <p className="empty-state">No special coverage is available yet. Check back as reporting projects develop.</p>
      )}
    </main>
  );
}
