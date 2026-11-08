import { describe, expect, it } from "vitest";
import {
  formatVideoDuration,
  isoDurationSeconds,
  normalizePrimaryVideo,
  normalizeStoryFormat,
  parseYouTubeVideoId,
  youTubeEmbedUrl
} from "@byline/core";

const ID = "dQw4w9WgXcQ";

describe("YouTube URL normalization", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123&t=10`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/embed/${ID}?start=30`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `
  ])("reads %s as the video ID", (url) => {
    expect(parseYouTubeVideoId(url)).toBe(ID);
  });

  it.each([
    "",
    "   ",
    ID,
    "not a url",
    "https://vimeo.com/123456789",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=short",
    `https://www.youtube.com/watch?v=${ID}x`,
    "https://www.youtube.com/@weeklywildcat",
    "https://www.youtube.com/playlist?list=PL1234567890",
    `https://www.youtube.com/channel/${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://evil.example/youtu.be/${ID}`,
    `https://user:pass@www.youtube.com/watch?v=${ID}`,
    `javascript:alert(1)//www.youtube.com/watch?v=${ID}`,
    `ftp://www.youtube.com/watch?v=${ID}`,
    `<iframe src="https://www.youtube.com/embed/${ID}"></iframe>`,
    `https://youtu.be/${ID}/extra`
  ])("rejects %s", (url) => {
    expect(parseYouTubeVideoId(url)).toBeNull();
  });

  it("rejects non-strings", () => {
    for (const value of [null, undefined, 42, {}, [ID]]) expect(parseYouTubeVideoId(value)).toBeNull();
  });

  it("uses one player URL form", () => {
    expect(youTubeEmbedUrl(ID)).toBe(`https://www.youtube.com/embed/${ID}`);
  });
});

describe("story format", () => {
  it("is standard unless WordPress says video", () => {
    expect(normalizeStoryFormat("video")).toBe("video");
    for (const value of ["standard", "", "Video", "photo", null, undefined, 1]) expect(normalizeStoryFormat(value)).toBe("standard");
  });
});

describe("published primary video", () => {
  it("keeps the canonical ID and the valid enrichment", () => {
    expect(normalizePrimaryVideo({
      provider: "youtube",
      videoId: ID,
      url: "https://anything.example/",
      title: "  Homecoming in 90 seconds ",
      description: "From the pep rally to the parade.",
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
      uploadDate: "2026-10-14T18:30:00Z",
      duration: "PT1M32S"
    })).toEqual({
      provider: "youtube",
      videoId: ID,
      url: `https://www.youtube.com/watch?v=${ID}`,
      title: "Homecoming in 90 seconds",
      description: "From the pep rally to the parade.",
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
      uploadDate: "2026-10-14T18:30:00.000Z",
      duration: "PT1M32S"
    });
  });

  it("drops invalid enrichment rather than inventing values", () => {
    expect(normalizePrimaryVideo({ videoId: ID, thumbnailUrl: "http://insecure.example/a.jpg", uploadDate: "October 14", duration: "P0D", title: 7 }))
      .toEqual({ provider: "youtube", videoId: ID, url: `https://www.youtube.com/watch?v=${ID}` });
  });

  it("recovers the ID from a stored URL and refuses anything that is not YouTube", () => {
    expect(normalizePrimaryVideo({ url: `https://youtu.be/${ID}` })?.videoId).toBe(ID);
    expect(normalizePrimaryVideo({ videoId: "bad" })).toBeNull();
    expect(normalizePrimaryVideo({ provider: "vimeo", videoId: ID })).toBeNull();
    expect(normalizePrimaryVideo(null)).toBeNull();
    expect(normalizePrimaryVideo({ html: `<iframe src="https://www.youtube.com/embed/${ID}"></iframe>` })).toBeNull();
  });
});

describe("video durations", () => {
  it("reads ISO 8601 durations and labels them", () => {
    expect(isoDurationSeconds("PT4M13S")).toBe(253);
    expect(isoDurationSeconds("PT1H2M5S")).toBe(3725);
    expect(formatVideoDuration("PT4M13S")).toBe("4:13");
    expect(formatVideoDuration("PT45S")).toBe("0:45");
    expect(formatVideoDuration("PT1H2M5S")).toBe("1:02:05");
  });

  it("treats unknown, zero and malformed durations as unknown", () => {
    for (const value of [undefined, "", "P0D", "PT0S", "PT", "P", "4:13", "PT4.5S"]) {
      expect(formatVideoDuration(value)).toBeNull();
    }
  });
});
