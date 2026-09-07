import { describe, expect, it } from "vitest";
import { serializeMetadata, type Metadata, type SerializedMetadataTag } from "@/lib/metadata";

function values(tags: SerializedMetadataTag[], key: string) {
  return tags.filter((tag) => tag.key === key).map((tag) => tag.content);
}

describe("HTML metadata serialization", () => {
  it("serializes complete article and social metadata without duplicate scalar tags", () => {
    const metadata: Metadata = {
      openGraph: {
        title: "Fixture article",
        description: "A representative article",
        url: "https://example.test/2026/08/20/news/fixture-article/",
        siteName: "Example News",
        locale: "en_US",
        type: "article",
        images: [
          {
            url: "https://example.test/uploads/fixture.jpg",
            width: 1200,
            height: 630,
            alt: "Students gather in the newsroom"
          },
          {
            url: "https://example.test/uploads/fixture.jpg",
            width: 1200,
            height: 630,
            alt: "Students gather in the newsroom"
          }
        ],
        section: "News",
        publishedTime: "2026-08-20T09:00:00-04:00",
        modifiedTime: "2026-08-20T09:30:00-04:00",
        authors: ["Morgan Lee", "Jordan Kim", "Morgan Lee", ""],
        tags: ["Campus", "Student life", "Campus", ""]
      },
      twitter: {
        card: "summary_large_image",
        title: "Fixture article",
        description: "A representative article",
        images: [{ url: "https://example.test/uploads/fixture.jpg", alt: "Students gather in the newsroom" }]
      }
    };

    const tags = serializeMetadata(metadata);

    expect(values(tags, "og:image")).toEqual(["https://example.test/uploads/fixture.jpg"]);
    expect(values(tags, "og:image:width")).toEqual(["1200"]);
    expect(values(tags, "og:image:height")).toEqual(["630"]);
    expect(values(tags, "og:image:alt")).toEqual(["Students gather in the newsroom"]);
    expect(values(tags, "article:section")).toEqual(["News"]);
    expect(values(tags, "article:published_time")).toEqual(["2026-08-20T09:00:00-04:00"]);
    expect(values(tags, "article:modified_time")).toEqual(["2026-08-20T09:30:00-04:00"]);
    expect(values(tags, "article:author")).toEqual(["Morgan Lee", "Jordan Kim"]);
    expect(values(tags, "article:tag")).toEqual(["Campus", "Student life"]);
    expect(values(tags, "twitter:image")).toEqual(["https://example.test/uploads/fixture.jpg"]);
    expect(values(tags, "twitter:image:alt")).toEqual(["Students gather in the newsroom"]);
    expect(tags.find((tag) => tag.key === "og:image")?.kind).toBe("property");
    expect(tags.find((tag) => tag.key === "twitter:image")?.kind).toBe("name");
    expect(tags.find((tag) => tag.key === "twitter:image:alt")?.kind).toBe("name");
  });

  it("preserves structured properties for every distinct Open Graph image group", () => {
    const tags = serializeMetadata({
      openGraph: {
        images: [
          {
            url: "https://example.test/uploads/a.jpg",
            width: 1200,
            height: 630,
            alt: "Image A"
          },
          {
            url: "https://example.test/uploads/b.jpg",
            width: 1200,
            height: 630,
            alt: "Image B"
          }
        ]
      }
    });

    expect(tags.filter((tag) => tag.key.startsWith("og:image")).map((tag) => [tag.key, tag.content])).toEqual([
      ["og:image", "https://example.test/uploads/a.jpg"],
      ["og:image:width", "1200"],
      ["og:image:height", "630"],
      ["og:image:alt", "Image A"],
      ["og:image", "https://example.test/uploads/b.jpg"],
      ["og:image:width", "1200"],
      ["og:image:height", "630"],
      ["og:image:alt", "Image B"]
    ]);
  });

  it("keeps Open Graph image groups distinct when the URL is repeated with different alt text", () => {
    const tags = serializeMetadata({
      openGraph: {
        images: [
          { url: "https://example.test/uploads/shared.jpg", alt: "First description" },
          { url: "https://example.test/uploads/shared.jpg", alt: "Second description" }
        ]
      }
    });

    expect(tags.filter((tag) => tag.key.startsWith("og:image")).map((tag) => [tag.key, tag.content])).toEqual([
      ["og:image", "https://example.test/uploads/shared.jpg"],
      ["og:image:alt", "First description"],
      ["og:image", "https://example.test/uploads/shared.jpg"],
      ["og:image:alt", "Second description"]
    ]);
  });

  it("keeps website and profile metadata supported without inventing article fields", () => {
    const websiteTags = serializeMetadata({
      openGraph: {
        type: "website",
        images: ["https://example.test/default-social.png"]
      },
      twitter: { card: "summary" }
    });
    const profileTags = serializeMetadata({ openGraph: { type: "profile" } });

    expect(values(websiteTags, "og:type")).toEqual(["website"]);
    expect(values(websiteTags, "og:image")).toEqual(["https://example.test/default-social.png"]);
    expect(values(websiteTags, "article:section")).toEqual([]);
    expect(values(websiteTags, "article:author")).toEqual([]);
    expect(values(websiteTags, "twitter:card")).toEqual(["summary"]);
    expect(values(profileTags, "og:type")).toEqual(["profile"]);
  });

  it("omits empty metadata values and image dimensions that are not meaningful", () => {
    const tags = serializeMetadata({
      openGraph: {
        title: " ",
        images: [
          { url: "", width: 0, height: -1, alt: " " },
          { url: "https://example.test/social.png", width: 1200, height: 630, alt: "" }
        ],
        tags: ["News", "News"]
      },
      twitter: { images: [{ url: "https://example.test/social.png", alt: " " }] }
    });

    expect(values(tags, "og:title")).toEqual([]);
    expect(values(tags, "og:image")).toEqual(["https://example.test/social.png"]);
    expect(values(tags, "og:image:width")).toEqual(["1200"]);
    expect(values(tags, "og:image:height")).toEqual(["630"]);
    expect(values(tags, "og:image:alt")).toEqual([]);
    expect(values(tags, "article:tag")).toEqual(["News"]);
    expect(values(tags, "twitter:image:alt")).toEqual([]);
  });
});
