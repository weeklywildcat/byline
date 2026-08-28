import { ArticleByline } from "@/components/ArticleByline";
import { FeaturedImage } from "@/components/FeaturedImage";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import {
  getFeaturedMedia,
  getPostContributors,
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

function getStoryTeaserImageSizes(variant: StoryTeaserVariant) {
  if (variant === "secondary" || variant === "compact" || variant === "list") {
    return "92px";
  }

  if (variant === "lead") {
    return "(max-width: 900px) 100vw, 66vw";
  }

  return "(max-width: 900px) 100vw, 45vw";
}

export function StoryTeaser({ post, variant = "standard", showImage = true, priority = false }: StoryTeaserProps) {
  const href = getPostHref(post);
  const image = getFeaturedMedia(post);
  const contributors = getPostContributors(post);
  const category = getPrimaryVisibleCategory(post);
  const excerpt = post.excerpt.rendered.trim();
  const title = stripHtml(post.title.rendered);
  const shouldShowImage = Boolean(showImage && image);
  const shouldShowExcerpt = excerpt && variant !== "compact" && variant !== "list";
  const className = `story-teaser story-teaser-${variant}${shouldShowImage ? "" : " story-teaser-no-image"}`;

  return (
    <article className={className}>
      {shouldShowImage ? (
        <FeaturedImage
          image={image}
          priority={priority}
          showCaption={false}
          sizes={getStoryTeaserImageSizes(variant)}
        />
      ) : null}
      <div className="story-teaser-body">
        <ArticleByline contributors={contributors} category={category} date={post.date} />
        <h2>
          <a href={href}>{title}</a>
        </h2>
        {shouldShowExcerpt ? <div className="story-excerpt" dangerouslySetInnerHTML={{ __html: excerpt }} /> : null}
      </div>
    </article>
  );
}
