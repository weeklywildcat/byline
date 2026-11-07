import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publicationStore } from "../src/publication-media/blob-store";
import { buildTokenMatches } from "../src/publication-media/build-endpoint";
import { newsroomAppRoot, privateMediaDir, publicationMediaDir } from "../src/publication-media/paths";
import { widthsWithin } from "../src/publication-media/prepare";
import { blockingLines, preparingLabel, storyMediaReadinessQuery } from "../src/ui/story/publication-readiness-model";

const dirs: string[] = [];
const temp = (prefix: string) => { const dir = mkdtempSync(path.join(tmpdir(), prefix)); dirs.push(dir); return dir; };
const env = { ...process.env };
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  process.env.BYLINE_MEDIA_LOCAL_DIR = env.BYLINE_MEDIA_LOCAL_DIR;
  process.env.BYLINE_PUBLICATION_MEDIA_DIR = env.BYLINE_PUBLICATION_MEDIA_DIR;
});

describe("storage paths", () => {
  it("resolve relative directories from the newsroom app, whichever directory the process started in", () => {
    const app = newsroomAppRoot();
    const repo = path.resolve(app, "../..");
    const settings = { BYLINE_MEDIA_LOCAL_DIR: "media", BYLINE_PUBLICATION_MEDIA_DIR: "publication-media" };
    expect(privateMediaDir(settings, app)).toBe(path.join(app, "media"));
    expect(privateMediaDir(settings, repo)).toBe(path.join(app, "media"));
    expect(publicationMediaDir(settings, path.join(app, "src", "collections"))).toBe(path.join(app, "publication-media"));
    expect(publicationMediaDir({ BYLINE_PUBLICATION_MEDIA_DIR: "/var/lib/byline/publication" }, repo)).toBe("/var/lib/byline/publication");
    expect(publicationMediaDir({}, repo)).toBe(path.join(app, "publication-media"));
  });
});

describe("the publication store", () => {
  const store = () => {
    process.env.BYLINE_MEDIA_LOCAL_DIR = temp("byline-private-");
    return publicationStore(temp("byline-publication-"));
  };

  it("keys objects by the SHA-256 of their bytes and reuses identical bytes", async () => {
    const s = store();
    const data = Buffer.from("prepared bytes");
    const sha = createHash("sha256").update(data).digest("hex");
    expect(await s.put(data)).toEqual({ sha256: sha, bytes: data.length, reused: false });
    expect(s.objectPath(sha)).toBe(path.join(s.root, "objects", sha.slice(0, 2), sha));
    expect(await s.put(Buffer.from("prepared bytes"))).toMatchObject({ reused: true });
    expect(await s.has(sha, data.length)).toBe(true);
    expect(await s.has(sha, data.length + 1)).toBe(false);
    expect(await s.verify(sha)).toBe(true);
  });

  it("never overwrites an object with different bytes, and never resolves anything but a hash", async () => {
    const s = store();
    const data = Buffer.from("original");
    const { sha256 } = await s.put(data);
    writeFileSync(s.objectPath(sha256)!, "tampered");
    await expect(s.put(data)).rejects.toMatchObject({ code: "store-corrupt" });
    expect(readFileSync(s.objectPath(sha256)!, "utf8")).toBe("tampered");
    expect(s.objectPath("../../media/IMG_4932.jpg")).toBeNull();
    expect(s.objectPath(sha256.toUpperCase())).toBeNull();
  });

  it("must not share or nest inside the private upload directory", () => {
    const privateDir = temp("byline-private-");
    process.env.BYLINE_MEDIA_LOCAL_DIR = privateDir;
    expect(() => publicationStore(path.join(privateDir, "publication"))).toThrow(/separate/);
    expect(() => publicationStore(privateDir)).toThrow(/separate/);
    mkdirSync(path.join(privateDir, "x"));
  });
});

describe("the build credential", () => {
  it("matches only the configured token, and nothing when none (or a short one) is configured", () => {
    const token = "a".repeat(40);
    expect(buildTokenMatches(token, token)).toBe(true);
    expect(buildTokenMatches(`${token}b`, token)).toBe(false);
    expect(buildTokenMatches(null, token)).toBe(false);
    expect(buildTokenMatches(token, undefined)).toBe(false);
    expect(buildTokenMatches("short", "short")).toBe(false);
  });
});

describe("the recipe never upscales", () => {
  it("keeps widths at or below the source, adds the source width when larger targets were dropped, never more", () => {
    expect(widthsWithin([320, 640, 960, 1440], 1000)).toEqual([320, 640, 960, 1000]);
    expect(widthsWithin([320, 640, 960, 1440], 960)).toEqual([320, 640, 960]);
    expect(widthsWithin([320, 640, 960, 1440], 3000)).toEqual([320, 640, 960, 1440]);
    expect(widthsWithin([480, 960, 1440], 300)).toEqual([300]);
  });
});

describe("Story header media readiness", () => {
  const block = (fields: Record<string, unknown>) => ({ type: "block", fields });
  const body = (...children: unknown[]) => ({ root: { children } });

  it("is one stable, sorted query that text edits never change", () => {
    const a = storyMediaReadinessQuery({ featuredMedia: 9, body: body(block({ blockType: "photo", media: 12 }), { type: "paragraph", children: [{ text: "one" }] }, block({ blockType: "gallery", items: [{ media: 4 }, { media: 12 }] })), contentFormat: "byline-v1" });
    const b = storyMediaReadinessQuery({ featuredMedia: { id: 9 }, body: body(block({ blockType: "gallery", items: [{ media: 12 }, { media: 4 }] }), { type: "paragraph", children: [{ text: "one, two" }] }, block({ blockType: "photo", media: 12 })), contentFormat: "byline-v1" });
    expect(a).toBe("lead=9&ids=4%2C12");
    expect(b).toBe(a);
    expect(storyMediaReadinessQuery({ featuredMedia: null, body: body(block({ blockType: "document", media: 9 })), contentFormat: "legacy-html" })).toBe("");
  });

  it("says what is preparing and what blocks publication", () => {
    const report = { ready: false, preparing: 2, blocked: 1, items: [
      { mediaId: 1, filename: "a.jpg", state: "preparing" as const, issues: [], retryable: false },
      { mediaId: 3, filename: "marching-band.jpg", state: "blocked" as const, issues: [{ code: "failed", message: "Publication file preparation failed" }], retryable: true }
    ] };
    expect(preparingLabel(report)).toBe("Preparing 2 files for publication…");
    expect(blockingLines(report).map((line) => line.text)).toEqual(["marching-band.jpg · Publication file preparation failed"]);
    expect(preparingLabel({ ...report, preparing: 0 })).toBeNull();
  });
});
