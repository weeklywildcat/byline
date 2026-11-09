import { SectionHeader } from "@/components/SectionHeader";
import { StoryTeaser } from "@/components/StoryTeaser";
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";
import type { ArchivePost } from "@/lib/public-content";

export function BehindTheScenesSection({ posts }: { posts: ArchivePost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="home-bts-section" aria-labelledby="home-bts-heading">
      <SectionHeader id="home-bts-heading" title={BEHIND_THE_SCENES.name}
        description={BEHIND_THE_SCENES.description}
        href={BEHIND_THE_SCENES.path} actionLabel="See all" />
      <div className="home-bts-grid">
        {posts.slice(0, 2).map((post) => <StoryTeaser key={post.id} post={post} variant="compact" showCategory={false} />)}
      </div>
    </section>
  );
}
