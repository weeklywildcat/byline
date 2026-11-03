import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { tools } from "../src/catalog";
const fixturePath = new URL(
  "../../../wordpress-plugin/tests/.mcp-contracts.json",
  import.meta.url,
);
const exists = existsSync(fixturePath);
describe.skipIf(!exists)("actual wp-env response contracts", () => {
  const fixtures = exists ? JSON.parse(readFileSync(fixturePath, "utf8")) : {};
  for (const [key, tool] of [
    ["workspace", "story.get"],
    ["home", "newsroom.today"],
    ["planning", "stories.search"],
    ["collection", "collection.get"],
    ["schedule", "newsroom.schedule"],
    ["notes", "notes.list"],
    ["presets", "presets.list"],
    ["feedback", "feedback.list"],
    ["health", "content_health.list"],
    ["activity", "activity.story"],
  ]) {
    it(`projects the real ${key} payload without schema drift`, () => {
      const definition = tools.find((t) => t.name === tool)!;
      const parsed = definition.data.safeParse(fixtures[key]);
      expect(
        parsed.success,
        parsed.success ? "" : JSON.stringify(parsed.error.issues),
      ).toBe(true);
    });
  }
});
