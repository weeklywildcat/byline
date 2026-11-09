import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";
import { getBehindTheScenesPosts } from "@/lib/content";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getAllPosts } from "@/lib/public-content";

async function getPosts() {
  return getBehindTheScenesPosts(await getAllPosts());
}

export async function getMetadata() {
  return buildPageMetadata({
    title: BEHIND_THE_SCENES.name,
    description: BEHIND_THE_SCENES.description,
    path: BEHIND_THE_SCENES.path,
    noIndex: (await getPosts()).length === 0
  });
}

export default async function BehindTheScenesPage() {
  const posts = await getPosts();
  const breadcrumb = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: BEHIND_THE_SCENES.name, path: BEHIND_THE_SCENES.path }
  ]);

  return (
    <main className="section-page-shell bts-page-shell">
      <script id="bts-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <SectionHeader title={BEHIND_THE_SCENES.name} description={BEHIND_THE_SCENES.description} level={1} />
      {posts.length > 0 ? (
        <div className="category-more-grid">
          {posts.map((post) => <StoryTeaser key={post.id} post={post} variant="standard" showCategory={false} />)}
        </div>
      ) : (
        <p className="empty-state">Stories behind the stories will appear here as we publish them.</p>
      )}
    </main>
  );
}
