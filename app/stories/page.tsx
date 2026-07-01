import type { Metadata } from "next";
import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts } from "@/lib/content";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getAllPosts } from "@/lib/wordpress";

export const dynamic = "force-static";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "All Stories",
    description: "Latest reporting, features, opinion, sports and culture from Weekly Wildcat.",
    path: "/stories/"
  })
};

export default async function StoriesPage() {
  const posts = filterVisibleContentPosts(await getAllPosts());
  const [leadPost, ...remainingPosts] = posts;
  const hasStoryList = remainingPosts.length > 0;
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "All Stories", path: "/stories/" }
  ]);

  return (
    <main className="section-page-shell">
      <script
        id="stories-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <SectionHeader
        title="All Stories"
        description="Latest reporting, features, opinion, sports and culture from Weekly Wildcat."
        level={1}
      />

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
        <p className="empty-state">No published stories are available yet.</p>
      )}
    </main>
  );
}
