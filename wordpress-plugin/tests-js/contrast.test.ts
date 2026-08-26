import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "../src/contrast";

describe("Byline brand contrast checks", () => {
  it("calculates WCAG contrast ratios for valid six-digit colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 3);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.478, 2);
  });

  it("refuses malformed CSS values", () => {
    expect(relativeLuminance("red")).toBeNull();
    expect(contrastRatio("url(example)", "#ffffff")).toBeNull();
  });
});
