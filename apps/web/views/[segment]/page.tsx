import type { ReactNode } from "react";
import type { Metadata } from "@/lib/metadata";
import { notFound } from "@/lib/static-not-found";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { stripHtml } from "@/lib/format";
import { requireBuildData } from "@/lib/build-data";
import { getPageBySlug, getPageIndexing } from "@/lib/public-content";

type StaticPageProps = {
  params: Promise<{
    segment: string;
  }>;
};

export async function getMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { segment } = await params;

  const archivePage = await requireBuildData(`public snapshot: pages?slug=${segment}`, () => getPageBySlug(segment));
  const title = archivePage ? stripHtml(archivePage.title.rendered) : "";
  const description = archivePage
    ? stripHtml(archivePage.excerpt.rendered || archivePage.content.rendered)
    : "";

  if (!title || !description) {
    return {};
  }

  return buildPageMetadata({
    title,
    description,
    path: `/${segment}/`,
    noIndex: archivePage ? getPageIndexing(archivePage) === "noindex" : false
  });
}

export default async function StaticPage({ params }: StaticPageProps) {
  const { segment } = await params;

  const archivePage = await requireBuildData(`public snapshot: pages?slug=${segment}`, () => getPageBySlug(segment));

  if (!archivePage) {
    notFound();
  }

  const title = stripHtml(archivePage.title.rendered);
  const description = stripHtml(archivePage.excerpt.rendered || archivePage.content.rendered);
  return (
    <PublicProsePage title={title} description={description} href={`/${segment}/`} bodyHtml={archivePage.content.rendered}
      eyebrow={archivePage.bylinePage?.eyebrow?.trim() || ""} isSportsArchive={Boolean(archivePage.bylinePage?.sportsArchive)}>
    </PublicProsePage>
  );
}

export function PublicProsePage({ title, description, href, bodyHtml, eyebrow, isSportsArchive, children }: {
  title: string; description: string; href: string; bodyHtml: string; eyebrow?: string; isSportsArchive?: boolean; children?: ReactNode;
}) {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl(href)
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: title, path: href }
  ]);

  return (
    <main className="static-page-shell">
      <script
        id="static-page-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }}
      />
      <script
        id="static-page-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <article className="static-page">
        <header className="static-page-header">
          {eyebrow ? <p>{eyebrow}</p> : null}
          <h1>{title}</h1>
          <div className="static-page-deck">{description}</div>
        </header>

        {isSportsArchive ? (
          <aside className="static-page-notice" aria-label="About this archive">
            <p>
              This is our historical sports data aggregation and is no longer maintained. For current sports
              coverage, visit <a href="/category/sports/">Sports</a>.
            </p>
          </aside>
        ) : null}

        <div
          className="static-page-content byline-page-content"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
        {children}
      </article>
    </main>
  );
}
