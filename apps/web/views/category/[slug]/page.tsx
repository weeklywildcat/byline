import type { Metadata } from "@/lib/metadata";
import { notFound } from "@/lib/static-not-found";
import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts, isHiddenCategory } from "@/lib/content";
import { decodeHtml, stripHtml } from "@/lib/format";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { getCategoryBySlug, getPostsByCategory } from "@/lib/wordpress";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const publication = getPublicationConfig();

export async function getMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;

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
