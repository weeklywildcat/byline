import type { ReactNode } from "react";
import type { StoryImageView, storyImageAttributes } from "./story-view";

// A card photo with the editor's crop or focal point applied. Attribute order
// matches the pre-extraction markup that the parity tests pin.
export function StoryImage({
  image,
  attributes,
  loading
}: {
  image: StoryImageView;
  attributes: ReturnType<typeof storyImageAttributes>;
  loading: "eager" | "lazy";
}): ReactNode {
  return (
    <img
      src={attributes.src}
      srcSet={attributes.srcSet}
      sizes={attributes.sizes}
      alt={image.alt}
      width={attributes.width}
      height={attributes.height}
      loading={loading}
      style={attributes.style}
    />
  );
}
