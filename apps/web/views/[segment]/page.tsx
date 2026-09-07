import type { Metadata } from "@/lib/metadata";
import { notFound } from "@/lib/static-not-found";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { stripHtml } from "@/lib/format";
import { requireBuildData } from "@/lib/build-data";
import { getPageBySlug } from "@/lib/wordpress";
import { NewsroomPollHydrator } from "@/components/NewsroomPollHydrator";

type StaticPageProps = {
  params: Promise<{
    segment: string;
  }>;
};

export async function getMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { segment } = await params;

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
