import { describe, expect, it } from "vitest";
import { assertPublicSafe } from "../../src/public/snapshot/privacy";

describe("public snapshot privacy sentinel", () => {
  it("allows the configured newsroom URL in public metadata", () => {
    const newsroomUrl = "https://byline.weeklywildcat.com";
    const snapshot = { publication: { urls: { cms: newsroomUrl } } };

    expect(() =>
      assertPublicSafe(snapshot, JSON.stringify(snapshot), {
        BYLINE_NEWSROOM_URL: newsroomUrl
      })
    ).not.toThrow();
  });

  it("still rejects build credentials", () => {
    const token = "public-snapshot-secret-token-0123456789";
    const snapshot = { accidental: token };

    expect(() =>
      assertPublicSafe(snapshot, JSON.stringify(snapshot), {
        BYLINE_BUILD_TOKEN: token
      })
    ).toThrow(/build credential/);
  });
});
