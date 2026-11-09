import type { Metadata } from "@/lib/metadata";
import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterGeneralEditorialPosts } from "@/lib/content";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { getVideoStories } from "@/lib/story-video";
import { getAllPosts } from "@/lib/public-content";

const publication = getPublicationConfig();
const TITLE = "Watch";
const DESCRIPTION = `Video reporting from ${publication.identity.shortName}.`;

/**
 * Every published video story, newest first. This is a list of watch pages,
 * not one: each story's own URL is the page search engines index as a video.
 */
async function getWatchStories() {
  return getVideoStories(filterGeneralEditorialPosts(await getAllPosts()));
}

export async function getMetadata(): Promise<Metadata> {
  return buildPageMetadata({ title: TITLE, description: DESCRIPTION, path: "/watch/", noIndex: (await getWatchStories()).length === 0 });
}

export default async function WatchPage() {
  const posts = await getWatchStories();
  const [leadPost, ...remainingPosts] = posts;
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: TITLE, path: "/watch/" }
  ]);

  return (
    <main className="section-page-shell watch-page-shell">
      <script id="watch-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <SectionHeader title={TITLE} description={DESCRIPTION} level={1} />
      {leadPost ? (
        <>
          <StoryTeaser post={leadPost} variant="lead" priority />
          {remainingPosts.length > 0 ? (
            <section className="category-more" aria-labelledby="watch-more-heading">
              <h2 id="watch-more-heading">More videos</h2>
              <div className="category-more-grid">
                {remainingPosts.map((post) => <StoryTeaser key={post.id} post={post} variant="standard" />)}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="empty-state">No videos have been published yet.</p>
      )}
    </main>
  );
}
