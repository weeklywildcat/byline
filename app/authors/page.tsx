import type { Metadata } from "next";
import { AuthorDirectory } from "@/components/AuthorDirectory";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Authors",
    description: "Meet the Weekly Wildcat writers and contributors.",
    path: "/authors/"
  })
};

export default async function AuthorsPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Authors", path: "/authors/" }
  ]);

  return (
    <main className="section-page-shell authors-page-shell">
      <script
        id="authors-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <header className="section-heading">
        <div>
          <h1>Authors</h1>
          <p>Meet the Weekly Wildcat writers and contributors.</p>
        </div>
      </header>

      <AuthorDirectory />
    </main>
  );
}
