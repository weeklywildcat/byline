import { StoryTeaser } from "@/components/StoryTeaser";
import { getProwlerPosts } from "@/lib/content";
import { THE_PROWLER } from "@/lib/the-prowler";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getAllPosts } from "@/lib/public-content";

async function getPosts() {
  return getProwlerPosts(await getAllPosts());
}

export async function getMetadata() {
  return buildPageMetadata({
    title: THE_PROWLER.name,
    description: THE_PROWLER.description,
    path: THE_PROWLER.path,
    noIndex: (await getPosts()).length === 0
  });
}

export default async function TheProwlerPage() {
  const posts = await getPosts();
  const breadcrumb = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: THE_PROWLER.name, path: THE_PROWLER.path }
  ]);

  return (
    <main className="section-page-shell prowler-page-shell">
      <script id="prowler-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      {posts.length > 0 ? (
        <div className="category-more-grid">
          {posts.map((post) => <StoryTeaser key={post.id} post={post} variant="standard" showCategory={false} />)}
        </div>
      ) : (
        <p className="empty-state">The Prowler is sharpening its claws. Satire will appear here as we publish it.</p>
      )}
    </main>
  );
}
