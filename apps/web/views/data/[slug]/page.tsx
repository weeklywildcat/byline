import { DataProjectView } from "@byline/data-presentations";
import type { PublicDataProject } from "@byline/data";
import type { Metadata } from "@/lib/metadata";
import { nativeStory } from "@/lib/native-snapshot";
import { publicDataPresentationHost } from "@/lib/data-presentation-host";
import { publicDataPresentationRegistry } from "@/lib/native-snapshot";
import { publicDataProject, resolvePublicDataProject } from "@/lib/public-data";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";

type DataProjectPageProps = { params: Promise<{ slug: string }> };

function project(slug: string): PublicDataProject {
  const found = publicDataProject(slug);
  if (!found) throw new Error(`Missing public Data project ${slug}`);
  return found;
}

export async function getMetadata({ params }: DataProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = project(slug);
  const publication = getPublicationConfig();
  return buildPageMetadata({
    title: entry.title,
    description: entry.deck || `${entry.title}: data from ${publication.identity.shortName}.`,
    path: entry.href,
    noIndex: entry.indexing === "noindex"
  });
}

/** schema.org Dataset for the facts readers see: their name, update time and publisher, never row data. */
function datasetJsonLd(entry: PublicDataProject) {
  const publication = getPublicationConfig();
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: entry.title,
    ...(entry.deck ? { description: entry.deck } : {}),
    url: absoluteUrl(entry.href),
    dateModified: entry.dataUpdatedAt,
    datePublished: entry.publishedAt,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: publication.identity.organizationName },
    publisher: { "@type": "Organization", name: publication.identity.name },
    ...(entry.source ? { citation: entry.source } : {})
  };
}

/**
 * A published Data Project (`/data/<slug>/`): server-rendered from its
 * immutable releases through the same `DataProjectView` the newsroom
 * previews, complete without JavaScript. Its presentation's CSS is printed
 * here alone; its optional client code loads from the route.
 */
export default async function DataProjectPage({ params }: DataProjectPageProps) {
  const { slug } = await params;
  const entry = project(slug);
  const resolved = resolvePublicDataProject(entry);
  const related = entry.relatedStories.map(nativeStory).filter((story): story is NonNullable<typeof story> => Boolean(story));
  return (
    <main className="section-page-shell data-project-shell" data-data-client={resolved.definition.descriptor.client ? "" : undefined}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(datasetJsonLd(entry)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Data", path: "/data/" }, { name: entry.title, path: entry.href }])) }} />
      <DataProjectView
        resolved={resolved}
        host={publicDataPresentationHost(publicDataPresentationRegistry())}
        notes={{ source: entry.source, methodology: entry.methodology }}
        kicker={<a href="/data/">Data</a>}
        related={related.length ? (
          <section className="data-project-related" aria-labelledby="data-related">
            <h2 id="data-related">Related coverage</h2>
            <ul>{related.map((story) => <li key={story.id}><a href={story.href}>{story.title}</a></li>)}</ul>
          </section>
        ) : undefined}
      />
    </main>
  );
}
