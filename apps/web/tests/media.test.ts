import { describe, expect, it } from "vitest";
import { getResponsiveImageProps, type ResponsiveWordPressMedia } from "@/lib/media";

function image(overrides: Partial<ResponsiveWordPressMedia> = {}): ResponsiveWordPressMedia {
  return {
    source_url: "/_wordpress-media/hero.jpg",
    alt_text: "Hero image",
    title: { rendered: "Hero image" },
    media_details: {
      width: 1600,
      height: 900,
      sizes: {
        thumbnail: {
          source_url: "/_wordpress-media/hero-150.jpg",
          width: 150,
          height: 150
        },
        medium: {
          source_url: "/_wordpress-media/hero-768.jpg",
          width: 768,
          height: 432
        },
        large: {
          source_url: "/_wordpress-media/hero-1024.jpg",
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
      src: "/_wordpress-media/hero.jpg",
      srcSet:
        "/_wordpress-media/hero-150.jpg 150w, /_wordpress-media/hero-768.jpg 768w, /_wordpress-media/hero-1024.jpg 1024w, /_wordpress-media/hero.jpg 1600w",
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
            first: { source_url: "/_wordpress-media/first.jpg", width: 768, height: 432 },
            duplicate: { source_url: "/_wordpress-media/duplicate.jpg", width: 768, height: 432 },
            second: { source_url: "/_wordpress-media/second.jpg", width: 1024, height: 576 }
          }
        }
      })
    );

    expect(result?.srcSet).toBe(
      "/_wordpress-media/first.jpg 768w, /_wordpress-media/hero.jpg 1024w"
    );
    expect(result?.srcSet?.match(/768w/g)).toHaveLength(1);
  });

  it("keeps a size height when only the intrinsic width is available", () => {
    const result = getResponsiveImageProps({
      source_url: "/_wordpress-media/hero.jpg",
      media_details: {
        width: 1024,
        sizes: {
          large: { source_url: "/_wordpress-media/hero-1024.jpg", width: 1024, height: 576 }
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
      src: "/_wordpress-media/hero.jpg",
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
            medium: { source_url: "/_wordpress-media/hero-768.jpg", width: 768, height: 432 }
          }
        }
      })
    );

    expect(result).toMatchObject({ width: 768, height: 432 });
  });
});
