import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "../scripts/materialize-presentation-media.mjs");
let root: string | undefined;

afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });

describe("materialize-presentation-media", () => {
  it("copies aliases whose filenames contain the letter s", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "byline-presentation-"));
    mkdirSync(path.join(root, "_wordpress-media"), { recursive: true });
    const name = "1fd180b60f9f0773-Gibson-Smith-stories.jpg";
    writeFileSync(path.join(root, "_wordpress-media", name), "image");
    writeFileSync(path.join(root, "index.html"), `<img src="/_byline/presentation-media/${name}" alt="">`);

    execFileSync("node", [script], { env: { ...process.env, BYLINE_STATIC_ROOT: root } });

    expect(readFileSync(path.join(root, "_byline", "presentation-media", name), "utf8")).toBe("image");
  });
});
