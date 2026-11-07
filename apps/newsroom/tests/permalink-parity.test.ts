import { publicStoryPath } from "@byline/content";
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/permalink-parity.json";
import { publicIPv4 } from "../src/newsroom/health/checks";

describe("WordPress-compatible permalinks", () => {
  it.each(fixtures)("preserves the old pathname for $slug", ({ oldUrl, ...identity }) => {
    expect(publicStoryPath({ ...identity, timeZone: "America/New_York" })).toBe(new URL(oldUrl).pathname);
  });
});

describe("Content Health outbound link safety", () => {
  it.each(["127.0.0.1", "10.4.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "198.18.0.1", "0.0.0.0", "224.0.0.1", "::ffff:10.0.0.1"])("rejects %s", (address) => {
    expect(publicIPv4(address)).toBe(false);
  });
});
