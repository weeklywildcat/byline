import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts, isHiddenCategory } from "@/lib/content";
import { decodeHtml, stripHtml } from "@/lib/format";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { requireBuildData } from "@/lib/build-data";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import { getAllCategories, getCategoryBySlug, getPostsByCategory } from "@/lib/wordpress";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamicParams = false;
const publication = getPublicationConfig();

// A publication whose categories are all hidden (or which has none yet) still
// needs one buildable route under `output: export`.
export async function generateStaticParams() {
  const categories = await requireBuildData("/wp-json/wp/v2/categories", getAllCategories);

  return withEmptyRouteFallback(
    categories.filter((category) => !isHiddenCategory(category)).map((category) => ({
      slug: category.slug
    })),
    { slug: BYLINE_EMPTY_ROUTE_SLUG }
  );
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;

  if (isBylineEmptyRouteSlug(slug)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const category = await getCategoryBySlug(slug);

  if (!category) {
    return {};
  }

  const categoryName = decodeHtml(category.name);

  return buildPageMetadata({
    title: categoryName,
    description: category.description ? stripHtml(category.description) : `Latest ${categoryName} stories from ${publication.identity.shortName}.`,
    path: `/category/${category.slug}/`
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;

  if (isBylineEmptyRouteSlug(slug)) notFound();

  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  if (isHiddenCategory(category)) {
    notFound();
  }

  const posts = filterVisibleContentPosts(await getPostsByCategory(category.id));
  const [leadPost, ...remainingPosts] = posts;
  const categoryName = decodeHtml(category.name);
  const categoryDescription = category.description ? stripHtml(category.description) : `${posts.length} published stories`;
  const hasStoryList = remainingPosts.length > 0;
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: categoryName, path: `/category/${category.slug}/` }
  ]);

  return (
    <main className="section-page-shell">
      <script
        id="category-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <SectionHeader title={categoryName} description={categoryDescription} level={1} />

      {leadPost ? (
        <div className={hasStoryList ? "category-story-layout" : "category-story-layout category-story-layout-single"}>
          <StoryTeaser post={leadPost} variant="lead" priority />
          {hasStoryList ? (
            <div className="category-story-list">
              {remainingPosts.map((post) => (
                <StoryTeaser key={post.id} post={post} variant="compact" />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="empty-state">No published posts are available in {categoryName} yet.</p>
      )}
    </main>
  );
}
