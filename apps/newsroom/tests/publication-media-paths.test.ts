import path from "node:path";
import { describe, expect, it } from "vitest";
import { newsroomAppRoot, privateMediaDir, publicationMediaDir } from "../src/publication-media/paths";

const root = path.join(path.parse(process.cwd()).root, "srv", "byline");
const app = path.join(root, "apps", "newsroom");

describe("publication media paths", () => {
  it("finds the newsroom root lexically from the repo, app, or a child directory", () => {
    expect(newsroomAppRoot(root)).toBe(app);
    expect(newsroomAppRoot(app)).toBe(app);
    expect(newsroomAppRoot(path.join(app, "scripts"))).toBe(app);
  });

  it("resolves relative storage paths from apps/newsroom", () => {
    expect(privateMediaDir({}, root)).toBe(path.join(app, "media"));
    expect(privateMediaDir({ BYLINE_MEDIA_LOCAL_DIR: "private/uploads" }, root)).toBe(path.join(app, "private", "uploads"));
    expect(publicationMediaDir({}, root)).toBe(path.join(app, "publication-media"));
    expect(publicationMediaDir({ BYLINE_PUBLICATION_MEDIA_DIR: "prepared/public" }, app)).toBe(path.join(app, "prepared", "public"));
  });

  it("keeps absolute storage paths absolute", () => {
    const privateRoot = path.join(path.parse(process.cwd()).root, "mnt", "byline-private");
    const publicationRoot = path.join(path.parse(process.cwd()).root, "mnt", "byline-public");

    expect(privateMediaDir({ BYLINE_MEDIA_LOCAL_DIR: privateRoot }, root)).toBe(privateRoot);
    expect(publicationMediaDir({ BYLINE_PUBLICATION_MEDIA_DIR: publicationRoot }, root)).toBe(publicationRoot);
  });
});
