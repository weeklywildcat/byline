import { describe, expect, it } from "vitest";
import { getResponsiveImageProps, type ResponsiveWordPressMedia } from "@/lib/media";

function image(overrides: Partial<ResponsiveWordPressMedia> = {}): ResponsiveWordPressMedia {
  return {
    source_url: "/_byline/media/hero.jpg",
    alt_text: "Hero image",
    title: { rendered: "Hero image" },
    media_details: {
      width: 1600,
      height: 900,
      sizes: {
        thumbnail: {
          source_url: "/_byline/media/hero-150.jpg",
          width: 150,
          height: 150
        },
        medium: {
          source_url: "/_byline/media/hero-768.jpg",
          width: 768,
          height: 432
        },
        large: {
          source_url: "/_byline/media/hero-1024.jpg",
          width: 1024,
          height: 576
        }
      }
    },
    ...overrides
  };
}

describe("responsive WordPress media", () => {
  it("builds mirrored srcSet candidates and stable intrinsic dimensions", () => {
    expect(getResponsiveImageProps(image(), { sizes: "(max-width: 900px) 100vw, 45vw" })).toEqual({
      src: "/_byline/media/hero.jpg",
      srcSet:
        "/_byline/media/hero-768.jpg 768w, /_byline/media/hero-1024.jpg 1024w, /_byline/media/hero.jpg 1600w",
      sizes: "(max-width: 900px) 100vw, 45vw",
      width: 1600,
      height: 900,
      alt: "Hero image",
      loading: "lazy",
      decoding: "async",
      fetchPriority: "auto"
    });
  });

  it("deduplicates width variants and keeps the original at its intrinsic width", () => {
    const result = getResponsiveImageProps(
      image({
        media_details: {
          width: 1024,
          height: 576,
          sizes: {
            first: { source_url: "/_byline/media/first.jpg", width: 768, height: 432 },
            duplicate: { source_url: "/_byline/media/duplicate.jpg", width: 768, height: 432 },
            second: { source_url: "/_byline/media/second.jpg", width: 1024, height: 576 }
          }
        }
      })
    );

    expect(result?.srcSet).toBe(
      "/_byline/media/first.jpg 768w, /_byline/media/hero.jpg 1024w"
    );
    expect(result?.srcSet?.match(/768w/g)).toHaveLength(1);
  });

  it("keeps a size height when only the intrinsic width is available", () => {
    const result = getResponsiveImageProps({
      source_url: "/_byline/media/hero.jpg",
      media_details: {
        width: 1024,
        sizes: {
          large: { source_url: "/_byline/media/hero-1024.jpg", width: 1024, height: 576 }
        }
      }
    });

    expect(result).toMatchObject({ width: 1024, height: 576 });
  });

  it("falls back to src and dimensions when size metadata is absent", () => {
    const result = getResponsiveImageProps(
      image({
        media_details: {
          width: 1200,
          height: 675,
          sizes: {}
        }
      }),
      { priority: true }
    );

    expect(result).toMatchObject({
      src: "/_byline/media/hero.jpg",
      srcSet: undefined,
      width: 1200,
      height: 675,
      loading: "eager",
      fetchPriority: "high"
    });
  });

  it("derives stable dimensions from the largest valid size when the original lacks them", () => {
    const result = getResponsiveImageProps(
      image({
        media_details: {
          sizes: {
            medium: { source_url: "/_byline/media/hero-768.jpg", width: 768, height: 432 }
          }
        }
      })
    );

    expect(result).toMatchObject({ width: 768, height: 432 });
  });

  it("leaves hard-cropped sizes such as the square thumbnail out of a landscape srcset", () => {
    const result = getResponsiveImageProps(image());
    expect(result?.srcSet).not.toContain("hero-150.jpg");
  });

  it("positions the photo at the editor's focal point when the placement has no crop", () => {
    const art = { focalPoint: { x: 30, y: 20 }, crops: {}, renditions: {} };
    expect(getResponsiveImageProps(image({ bylineImage: { artDirection: art } }), { shape: "square" })?.objectPosition).toBe("30% 20%");
    expect(getResponsiveImageProps(image({ bylineImage: { artDirection: { ...art, focalPoint: { x: 50, y: 50 } } } }))?.objectPosition).toBeUndefined();
  });

  it("uses the editor's cropped files for a shape that has them", () => {
    const artDirection = {
      focalPoint: { x: 30, y: 20 },
      crops: { square: { x: 0.2, y: 0, w: 0.5, h: 0.9 } },
      renditions: {
        square: [
          { url: "/_byline/media/hero-byline-square-640.jpg", width: 640, height: 640 },
          { url: "/_byline/media/hero-byline-square-320.jpg", width: 320, height: 320 }
        ]
      }
    };
    const result = getResponsiveImageProps(image({ bylineImage: { artDirection } }), { shape: "square", imageSearchVisibility: "presentation", sizes: "92px" });
    expect(result).toMatchObject({
      src: "/_byline/media/hero-byline-square-640.jpg",
      srcSet: "/_byline/media/hero-byline-square-320.jpg 320w, /_byline/media/hero-byline-square-640.jpg 640w",
      width: 640,
      height: 640,
      sizes: "92px"
    });
    expect(result?.objectPosition).toBeUndefined();
    // Another shape keeps the normal photo, positioned at the focal point.
    expect(getResponsiveImageProps(image({ bylineImage: { artDirection } }), { shape: "wide" })).toMatchObject({ src: "/_byline/media/hero.jpg", objectPosition: "30% 20%" });
  });
});
