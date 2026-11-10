import { ArticleByline } from "@/components/ArticleByline";
import { FeaturedImage } from "@/components/FeaturedImage";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { getVideoStoryMetadata } from "@/lib/story-video";
import {
  getFeaturedMedia,
  getPostContributors,
  getPostHref,
  getPostLiveCoverage,
  type ArchivePost
} from "@/lib/public-content";

type StoryTeaserVariant = "lead" | "secondary" | "standard" | "compact" | "list";

type StoryTeaserProps = {
  post: ArchivePost;
  variant?: StoryTeaserVariant;
  showImage?: boolean;
  // Off on a section's own page, where every story shares the section label.
  showCategory?: boolean;
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

// Matches the aspect ratios in globals.css (.story-teaser-* .featured-image img).
function getStoryTeaserImageShape(variant: StoryTeaserVariant) {
  if (variant === "lead") return "wide";
  if (variant === "standard") return "standard";
  return "square";
}

export function StoryTeaser({ post, variant = "standard", showImage = true, showCategory = true, priority = false }: StoryTeaserProps) {
  const href = getPostHref(post);
  const image = getFeaturedMedia(post);
  const contributors = getPostContributors(post);
  const category = getPrimaryVisibleCategory(post);
  const excerpt = post.excerpt.rendered.trim();
  const title = stripHtml(post.title.rendered);
  const video = getVideoStoryMetadata(post);
  const shouldShowImage = Boolean(showImage && image);
  // A video story without a featured image shows its YouTube thumbnail instead of nothing.
  const showVideoThumbnail = Boolean(showImage && !image && video);
  const shouldShowExcerpt = excerpt && variant !== "compact" && variant !== "list";
  const className = `story-teaser story-teaser-${variant}${shouldShowImage || showVideoThumbnail ? "" : " story-teaser-no-image"}${video ? " story-teaser-video" : ""}`;

  return (
    <article className={className}>
      {shouldShowImage ? (
        <FeaturedImage
          image={image}
          priority={priority}
          showCaption={false}
          showCredit={variant === "lead" || variant === "standard"}
          sizes={getStoryTeaserImageSizes(variant)}
          shape={getStoryTeaserImageShape(variant)}
          imageSearchVisibility="presentation"
        />
      ) : showVideoThumbnail && video ? (
        <figure className="featured-image">
          <div className="featured-image-frame">
            <img src={video.thumbnailUrl} alt="" width={480} height={360} loading={priority ? "eager" : "lazy"} decoding="async" />
          </div>
        </figure>
      ) : null}
      <div className="story-teaser-body">
        <ArticleByline contributors={contributors} category={showCategory ? category : null} date={post.date} video={Boolean(video)} />
        <h2>
          {getPostLiveCoverage(post)?.status === "live" ? <span className="story-teaser-live">Live</span> : null}
          <a href={href}>{title}</a>
        </h2>
        {shouldShowExcerpt ? <div className="story-excerpt" dangerouslySetInnerHTML={{ __html: excerpt }} /> : null}
      </div>
    </article>
  );
}
