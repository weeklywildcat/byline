import type { Metadata } from "@/lib/metadata";
import { optionalBuildData } from "@/lib/build-data";
import { buildCoveragePresentation, type CoveragePresentation } from "@/lib/coverage-presentation";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAllPosts,
  getAllPublicCoverages,
  getCoverageHref,
  type ArchiveCoverage
} from "@/lib/public-content";

const publication = getPublicationConfig();

export async function getMetadata(): Promise<Metadata> {
  const coverages = await optionalBuildData(
    "public snapshot: coverage",
    getAllPublicCoverages,
    []
  );

  return buildPageMetadata({
    title: "Coverage",
    description: `Special coverage, explainers, and ongoing reporting from ${publication.identity.shortName}.`,
    path: "/coverage/",
    noIndex: coverages.length === 0
  });
}

function coverageSortValue(coverage: ArchiveCoverage) {
  return coverage.modified || coverage.startDate || "";
}

function CoverageCard({ view }: { view: CoveragePresentation }) {
  const latest = view.format === "series"
    ? view.stories[0]
    : [...view.stories].sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))[0];
  return (
    <article className={view.artwork ? "coverage-card" : "coverage-card coverage-card-no-art"}>
      <a className="coverage-card-art" href={view.href} tabIndex={-1} aria-hidden="true">
        {view.artwork ? (
          <img
            src={view.artwork.url}
            alt=""
            width={view.artwork.width ?? undefined}
            height={view.artwork.height ?? undefined}
            style={view.artwork.objectPosition ? { objectPosition: view.artwork.objectPosition } : undefined}
            loading="lazy"
            decoding="async"
          />
        ) : <span>{view.title}</span>}
      </a>
      <div className="coverage-card-body">
        <p className="coverage-card-kicker">{view.format === "series" ? "Series" : "Coverage"} · {view.countLabel}</p>
        <h2><a href={view.href}>{view.title}</a></h2>
        {view.description ? <p className="coverage-card-description">{view.description}</p> : null}
        {latest ? (
          <p className="coverage-card-latest">
            <span>{view.format === "series" ? "Start with" : "Latest"}</span> <a href={latest.href}>{latest.title}</a>
          </p>
        ) : null}
      </div>
    </article>
  );
}

function getCoverageIndexSchema(coverages: ArchiveCoverage[]) {
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
    "public snapshot: coverage",
    getAllPublicCoverages,
    []
  );
  const sortedCoverages = [...coverages].sort((a, b) =>
    coverageSortValue(b).localeCompare(coverageSortValue(a)) || a.title.localeCompare(b.title)
  );
  const allPosts = await getAllPosts();
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
      <header className="coverage-index-header">
        <h1>Series &amp; Coverage</h1>
        <p>In-depth series and ongoing reporting from the {publication.identity.shortName} newsroom, collected in one place.</p>
      </header>

      {sortedCoverages.length > 0 ? (
        <div className="coverage-card-grid" aria-label="Series and coverage">
          {sortedCoverages.map((coverage) => <CoverageCard key={coverage.id} view={buildCoveragePresentation(coverage, allPosts)} />)}
        </div>
      ) : (
        <p className="empty-state">No special coverage is available yet. Check back as reporting projects develop.</p>
      )}
    </main>
  );
}
