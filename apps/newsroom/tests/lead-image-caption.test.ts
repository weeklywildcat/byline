import { describe, expect, it } from "vitest";
import { leadImageCaptionShouldReset } from "../src/ui/story/LeadImage";

describe("lead image caption reset", () => {
  it("clears the story caption when the lead image changes or is removed", () => {
    expect(leadImageCaptionShouldReset(12, 13)).toBe(true);
    expect(leadImageCaptionShouldReset(12, null)).toBe(true);
    expect(leadImageCaptionShouldReset(null, 13)).toBe(true);
  });

  it("keeps the caption when the same lead image is chosen again", () => {
    expect(leadImageCaptionShouldReset(12, 12)).toBe(false);
    expect(leadImageCaptionShouldReset("12", "12")).toBe(false);
    expect(leadImageCaptionShouldReset(null, null)).toBe(false);
  });
});
