import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { stripHtml } from "@/lib/format";
import { requireBuildData } from "@/lib/build-data";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import { getStaticPage, STATIC_PAGES } from "@/lib/static-pages";
import { getAllPages, getPageBySlug, type WordPressPage } from "@/lib/wordpress";

type StaticPageProps = {
  params: Promise<{
    segment: string;
  }>;
};

export const dynamicParams = false;
const publication = getPublicationConfig();

// Pages are a required build input: a CMS outage must not quietly drop every
// WordPress page from the export and leave only the legacy slugs behind.
export async function generateStaticParams() {
  const wordpressPages = await requireBuildData("/wp-json/wp/v2/pages", getAllPages);
  const legacySlugs = publication.appearance.theme === "weekly-wildcat" ? STATIC_PAGES.map((page) => page.slug) : [];

  return withEmptyRouteFallback(
    [...new Set([...legacySlugs, ...wordpressPages.map((page) => page.slug)])].map((segment) => ({ segment })),
    { segment: BYLINE_EMPTY_ROUTE_SLUG }
  );
}

function getSectionBody(body: string | string[]) {
  return Array.isArray(body) ? body : [body];
}

export async function generateMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { segment } = await params;

  if (isBylineEmptyRouteSlug(segment)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const wordpressPage = await requireBuildData(`/wp-json/wp/v2/pages?slug=${segment}`, () => getPageBySlug(segment));
  const staticPage = publication.appearance.theme === "weekly-wildcat" ? getStaticPage(segment) : null;
  const useWordPress = Boolean(wordpressPage && (publication.appearance.theme !== "weekly-wildcat" || wordpressPage.bylinePage?.eyebrow));
  const title = useWordPress ? stripHtml(wordpressPage!.title.rendered) : staticPage?.title;
  const description = useWordPress
    ? stripHtml(wordpressPage!.excerpt.rendered || wordpressPage!.content.rendered)
    : staticPage?.description;

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
  const staticPage = publication.appearance.theme === "weekly-wildcat" ? getStaticPage(segment) : null;
  const useWordPress = Boolean(wordpressPage && (publication.appearance.theme !== "weekly-wildcat" || wordpressPage.bylinePage?.eyebrow));

  if (!useWordPress && !staticPage) {
    notFound();
  }

  const title = useWordPress ? stripHtml(wordpressPage!.title.rendered) : staticPage!.title;
  const description = useWordPress
    ? stripHtml(wordpressPage!.excerpt.rendered || wordpressPage!.content.rendered)
    : staticPage!.description;
  const eyebrow = useWordPress
    ? wordpressPage!.bylinePage?.eyebrow || publication.identity.shortName
    : staticPage!.eyebrow;

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
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <div className="static-page-deck">{description}</div>
        </header>

        <div className="static-page-content">
          {useWordPress ? (
            <div
              className="static-page-wordpress-content"
              dangerouslySetInnerHTML={{ __html: wordpressPage!.content.rendered }}
            />
          ) : staticPage!.sections.map((section) => (
            <section
              className={
                section.tone ? `static-page-section static-page-section-${section.tone}` : "static-page-section"
              }
              key={section.title}
            >
              <h2>{section.title}</h2>
              <div>
                {getSectionBody(section.body).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.actions?.length ? (
                  <div className="static-page-section-actions">
                    {section.actions.map((action) => (
                      <a key={action.href} href={action.href}>
                        {action.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        {!useWordPress && staticPage!.actions?.length ? (
          <div className="static-page-actions">
            {staticPage!.actions!.map((action) => (
              <a key={action.href} href={action.href}>
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
      </article>
    </main>
  );
}
