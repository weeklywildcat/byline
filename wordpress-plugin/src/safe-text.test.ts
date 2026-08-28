import { describe, expect, it } from "vitest";
import { stripMarkupForText } from "./safe-text";

describe("stripMarkupForText", () => {
  it("removes complete tags while preserving their text content", () => {
    expect(stripMarkupForText("Welcome <strong>readers</strong>.")).toBe("Welcome readers.");
  });

  it("does not reintroduce a tag from nested or malformed input", () => {
    expect(stripMarkupForText("<><script>alert(1)</script>")).toBe("alert(1)");
    expect(stripMarkupForText("<><script")).toBe("");
  });
});
