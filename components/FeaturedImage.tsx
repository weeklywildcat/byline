import { stripHtml } from "@/lib/format";
import type { WordPressMedia } from "@/lib/wordpress";

type FeaturedImageProps = {
  image: WordPressMedia | null;
  priority?: boolean;
  showCaption?: boolean;
};

export function FeaturedImage({ image, priority = false, showCaption = true }: FeaturedImageProps) {
  if (!image?.source_url) {
    return null;
  }

  const caption = image.caption?.rendered?.trim();
  const fallbackCaption = stripHtml(image.media_details?.image_meta?.caption ?? "");
  const credit = stripHtml(image.media_details?.image_meta?.credit || image.media_details?.image_meta?.copyright || "");
  const hasCaptionDetails = Boolean(caption || fallbackCaption || credit);
  const width = image.media_details?.width;
  const height = image.media_details?.height;
  const alt = image.alt_text || stripHtml(image.title?.rendered ?? "");

  return (
    <figure className="featured-image">
      <img
        src={image.source_url}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
      />
      {showCaption && hasCaptionDetails ? (
        <figcaption>
          {caption ? (
            <div className="featured-image-caption" dangerouslySetInnerHTML={{ __html: caption }} />
          ) : fallbackCaption ? (
            <div className="featured-image-caption">{fallbackCaption}</div>
          ) : null}
          {credit ? <div className="photo-credit">Photo credit: {credit}</div> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
