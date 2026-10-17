import { stripHtml } from "@/lib/format";
import { getResponsiveImageProps, type ImageSearchVisibility } from "@/lib/media";
import { getMediaCredit, type WordPressMedia } from "@/lib/wordpress";

type FeaturedImageProps = {
  image: WordPressMedia | null;
  priority?: boolean;
  showCaption?: boolean;
  // Shows just the photo credit under the image when the full caption is hidden.
  showCredit?: boolean;
  sizes?: string;
  imageSearchVisibility?: ImageSearchVisibility;
};

export function FeaturedImage({ image, priority = false, showCaption = true, showCredit = false, sizes, imageSearchVisibility = "canonical" }: FeaturedImageProps) {
  if (!image?.source_url) {
    return null;
  }

  const caption = image.caption?.rendered?.trim();
  const fallbackCaption = stripHtml(image.media_details?.image_meta?.caption ?? "");
  const credit = getMediaCredit(image);
  const hasCaptionDetails = Boolean(caption || fallbackCaption || credit);
  const imageProps = getResponsiveImageProps(image, { priority, sizes, imageSearchVisibility });

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
            {credit ? <p className="photo-credit">Photo: {credit}</p> : null}
          </div>
        </figcaption>
      ) : showCredit && credit ? (
        <figcaption>
          <p className="photo-credit photo-credit-solo">Photo: {credit}</p>
        </figcaption>
      ) : null}
    </figure>
  );
}
