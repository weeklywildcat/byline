import type { Metadata } from "next";
import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import { getPublicCorrectionLog } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAllPosts,
  getAllPublicCorrections,
  getCorrectionTypeLabel,
  getPostHref
} from "@/lib/wordpress";

export const dynamic = "force-static";

const publication = getPublicationConfig();

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Corrections and updates",
    description: `Corrections, clarifications, editor's notes, and substantive updates from the ${publication.identity.shortName} newsroom.`,
    path: "/corrections/"
  })
};

export default async function CorrectionsPage() {
  const [posts, remoteCorrections] = await Promise.all([
    requireBuildData("/wp-json/wp/v2/posts", getAllPosts),
    optionalBuildData("/wp-json/byline/v1/corrections", getAllPublicCorrections, [])
  ]);
  const entries = getPublicCorrectionLog(posts, remoteCorrections);
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Corrections", path: "/corrections/" }
  ]);

  const correctionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Corrections and updates",
    url: absoluteUrl("/corrections/"),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: getCorrectionTypeLabel(entry.type),
        url: absoluteUrl(getPostHref(entry.post))
      }))
    }
  };

  return (
    <main className="section-page-shell corrections-page-shell">
      <script id="corrections-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(correctionSchema) }} />
      <script id="corrections-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <header className="section-heading">
        <div>
          <h1>Corrections and updates</h1>
          <p>How the {publication.identity.shortName} newsroom keeps the record accurate.</p>
        </div>
      </header>

      {entries.length > 0 ? (
        <div className="correction-log" aria-label="Correction log">
          {entries.map((entry) => (
            <article className="correction-log-entry" key={`${entry.id}-${entry.post.id}`}>
              <div className="correction-log-meta">
                <span>{getCorrectionTypeLabel(entry.type)}</span>
                {entry.date ? <time dateTime={entry.date}>{formatDisplayDate(entry.date)}</time> : null}
              </div>
              <p>{entry.text}</p>
              <a href={getPostHref(entry.post)}>
                {stripHtml(entry.post.title.rendered)}
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">No corrections or updates have been published yet.</p>
      )}
    </main>
  );
}
