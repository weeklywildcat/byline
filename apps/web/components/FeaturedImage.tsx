import { stripHtml } from "@/lib/format";
import { getResponsiveImageProps } from "@/lib/media";
import type { WordPressMedia } from "@/lib/wordpress";

type FeaturedImageProps = {
  image: WordPressMedia | null;
  priority?: boolean;
  showCaption?: boolean;
  sizes?: string;
};

export function FeaturedImage({ image, priority = false, showCaption = true, sizes }: FeaturedImageProps) {
  if (!image?.source_url) {
    return null;
  }

  const caption = image.caption?.rendered?.trim();
  const fallbackCaption = stripHtml(image.media_details?.image_meta?.caption ?? "");
  const credit = stripHtml(
    (image.bylineImage ?? image.weeklyWildcatImage)?.creditText ||
      image.media_details?.image_meta?.credit ||
      image.media_details?.image_meta?.copyright ||
      ""
  );
  const hasCaptionDetails = Boolean(caption || fallbackCaption || credit);
  const imageProps = getResponsiveImageProps(image, { priority, sizes });

  if (!imageProps) {
    return null;
  }

  return (
    <figure className="featured-image">
      <div className="featured-image-frame">
        <img
          {...imageProps}
        />
      </div>
      {showCaption && hasCaptionDetails ? (
        <figcaption>
          <div className="featured-image-caption-row">
            {caption ? (
              <div className="featured-image-caption" dangerouslySetInnerHTML={{ __html: caption }} />
            ) : fallbackCaption ? (
              <div className="featured-image-caption">{fallbackCaption}</div>
            ) : null}
            {credit ? <p className="photo-credit">Credit: {credit}</p> : null}
          </div>
        </figcaption>
      ) : null}
    </figure>
  );
}
