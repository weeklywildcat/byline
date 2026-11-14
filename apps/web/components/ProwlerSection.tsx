import { ProwlerLogo } from "@/components/ProwlerLogo";
import { StoryTeaser } from "@/components/StoryTeaser";
import { THE_PROWLER } from "@/lib/the-prowler";
import type { ArchivePost } from "@/lib/public-content";

/** The homepage's satire strip: the wordmark and the latest two pieces. */
export function ProwlerSection({ posts }: { posts: ArchivePost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="home-prowler-section" aria-labelledby="home-prowler-heading">
      <div className="home-prowler-heading">
        <h2 id="home-prowler-heading">
          <a href={THE_PROWLER.path}><ProwlerLogo className="home-prowler-logo" /></a>
        </h2>
        <a className="home-prowler-more" href={THE_PROWLER.path}>See all</a>
      </div>
      <div className="home-bts-grid">
        {posts.slice(0, 2).map((post) => <StoryTeaser key={post.id} post={post} variant="compact" showCategory={false} />)}
      </div>
    </section>
  );
}
