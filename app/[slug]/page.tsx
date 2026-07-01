import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl, serializeJsonLd } from "@/lib/seo";
import { getStaticPage, STATIC_PAGES } from "@/lib/static-pages";

type StaticPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return STATIC_PAGES.map((page) => ({
    slug: page.slug
  }));
}

function getSectionBody(body: string | string[]) {
  return Array.isArray(body) ? body : [body];
}

export async function generateMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getStaticPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `/${page.slug}/`
    }
  };
}

export default async function StaticPage({ params }: StaticPageProps) {
  const { slug } = await params;
  const page = getStaticPage(slug);

  if (!page) {
    notFound();
  }

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    description: page.description,
    url: absoluteUrl(`/${page.slug}/`)
  };

  return (
    <main className="static-page-shell">
      <script
        id="static-page-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }}
      />
      <article className="static-page">
        <header className="static-page-header">
          <p>{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <div className="static-page-deck">{page.description}</div>
        </header>

        <div className="static-page-content">
          {page.sections.map((section) => (
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

        {page.actions?.length ? (
          <div className="static-page-actions">
            {page.actions.map((action) => (
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
