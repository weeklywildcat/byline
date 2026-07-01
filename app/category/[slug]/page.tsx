import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts, isHiddenCategory } from "@/lib/content";
import { decodeHtml, stripHtml } from "@/lib/format";
import { getAllCategories, getCategoryBySlug, getPostsByCategory } from "@/lib/wordpress";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const categories = await getAllCategories();

  return categories.filter((category) => !isHiddenCategory(category)).map((category) => ({
    slug: category.slug
  }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return {};
  }

  const categoryName = decodeHtml(category.name);

  return {
    title: categoryName,
    description: category.description ? stripHtml(category.description) : `Latest ${categoryName} stories.`
  };
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

  return (
    <main className="section-page-shell">
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
