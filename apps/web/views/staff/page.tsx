import type { Metadata } from "@/lib/metadata";
import { AuthorDirectory } from "@/components/AuthorDirectory";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Staff",
    description: `Meet the ${publication.identity.shortName} writers and contributors.`,
    path: "/staff/"
  })
};

export default async function StaffPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Staff", path: "/staff/" }
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
          <h1>Staff</h1>
          <p>Meet the {publication.identity.shortName} writers and contributors.</p>
        </div>
      </header>

      <AuthorDirectory showDescriptions={false} />
    </main>
  );
}
