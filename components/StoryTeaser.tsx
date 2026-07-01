import { ArticleByline } from "@/components/ArticleByline";
import { FeaturedImage } from "@/components/FeaturedImage";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import {
  getFeaturedMedia,
  getPostAuthor,
  getPostHref,
  type WordPressPost
} from "@/lib/wordpress";

type StoryTeaserVariant = "lead" | "secondary" | "standard" | "compact" | "list";

type StoryTeaserProps = {
  post: WordPressPost;
  variant?: StoryTeaserVariant;
  showImage?: boolean;
  priority?: boolean;
};

export function StoryTeaser({ post, variant = "standard", showImage = true, priority = false }: StoryTeaserProps) {
  const href = getPostHref(post);
  const image = getFeaturedMedia(post);
  const author = getPostAuthor(post);
  const category = getPrimaryVisibleCategory(post);
  const excerpt = post.excerpt.rendered.trim();
  const title = stripHtml(post.title.rendered);
  const shouldShowImage = Boolean(showImage && image);
  const shouldShowExcerpt = excerpt && variant !== "compact" && variant !== "list";
  const className = `story-teaser story-teaser-${variant}${shouldShowImage ? "" : " story-teaser-no-image"}`;

  return (
    <article className={className}>
      {shouldShowImage ? <FeaturedImage image={image} priority={priority} showCaption={false} /> : null}
      <div className="story-teaser-body">
        <ArticleByline author={author} category={category} date={post.date} />
        <h2>
          <a href={href}>{title}</a>
        </h2>
        {shouldShowExcerpt ? <div className="story-excerpt" dangerouslySetInnerHTML={{ __html: excerpt }} /> : null}
      </div>
    </article>
  );
}
