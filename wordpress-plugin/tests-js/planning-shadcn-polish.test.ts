import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src/planning");
const read = (name: string) => readFileSync(path.join(src, name), "utf8");

describe("secondary Planning shadcn patterns", () => {
  it("uses InputGroup for Media Desk search instead of a standalone search input", () => {
    const source = read("MediaDesk.tsx");
    expect(source).toContain("InputGroupInput type=\"search\"");
    expect(source).toContain("<InputGroupAddon><Search");
    expect(source).not.toContain("<Input type=\"search\"");
  });

  it("keeps Feedback as an Item queue rather than a grid of Cards", () => {
    const source = read("Feedback.tsx");
    expect(source).toContain("<ItemGroup");
    expect(source).toContain("<FeedbackRow");
    expect(source).not.toContain("<Card");
  });

  it("shows an actual shadcn Spinner while Content Health work is pending", () => {
    const source = read("ContentHealth.tsx");
    expect(source).toContain('from "../admin-ui/ui/spinner"');
    expect(source.match(/<Spinner data-icon="inline-start" \/>/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
