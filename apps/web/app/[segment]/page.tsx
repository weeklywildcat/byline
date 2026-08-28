import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { stripHtml } from "@/lib/format";
import { requireBuildData } from "@/lib/build-data";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import { getAllPages, getPageBySlug } from "@/lib/wordpress";
import { NewsroomPollHydrator } from "@/components/NewsroomPollHydrator";

type StaticPageProps = {
  params: Promise<{
    segment: string;
  }>;
};

export const dynamicParams = false;

// Pages are a required build input: a CMS outage must not quietly drop every
// WordPress page from the export and leave only the legacy slugs behind.
export async function generateStaticParams() {
  const wordpressPages = await requireBuildData("/wp-json/wp/v2/pages", getAllPages);

  return withEmptyRouteFallback(
    wordpressPages.map((page) => ({ segment: page.slug })),
    { segment: BYLINE_EMPTY_ROUTE_SLUG }
  );
}

export async function generateMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { segment } = await params;

  if (isBylineEmptyRouteSlug(segment)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const wordpressPage = await requireBuildData(`/wp-json/wp/v2/pages?slug=${segment}`, () => getPageBySlug(segment));
  const title = wordpressPage ? stripHtml(wordpressPage.title.rendered) : "";
  const description = wordpressPage
    ? stripHtml(wordpressPage.excerpt.rendered || wordpressPage.content.rendered)
    : "";

  if (!title || !description) {
    return {};
  }

  return buildPageMetadata({
    title,
    description,
    path: `/${segment}/`
  });
}

export default async function StaticPage({ params }: StaticPageProps) {
  const { segment } = await params;

  if (isBylineEmptyRouteSlug(segment)) notFound();

  const wordpressPage = await requireBuildData(`/wp-json/wp/v2/pages?slug=${segment}`, () => getPageBySlug(segment));

  if (!wordpressPage) {
    notFound();
  }

  const title = stripHtml(wordpressPage.title.rendered);
  const description = stripHtml(wordpressPage.excerpt.rendered || wordpressPage.content.rendered);
  const eyebrow = wordpressPage.bylinePage?.eyebrow?.trim() || "";

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl(`/${segment}/`)
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: title, path: `/${segment}/` }
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

        <div
          className="static-page-content byline-page-content"
          dangerouslySetInnerHTML={{ __html: wordpressPage.content.rendered }}
        />
        <NewsroomPollHydrator />
      </article>
    </main>
  );
}
