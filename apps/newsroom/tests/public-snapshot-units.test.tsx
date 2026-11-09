import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { publicationLocalDate, publicationLocalMinute, publicStoryPath, publicationUtcDateTime, publicationLocalDateTime } from "@byline/content";
import { afterEach, describe, expect, it } from "vitest";
import { payloadPublicStory } from "../src/preview/payload-story";
import { DEFAULT_PREVIEW_PUBLICATION } from "../src/preview/publication";
import { PublicSnapshotError } from "../src/public/snapshot/errors";
import { pageBodyHtml } from "../src/public/snapshot/page-html";
import { assertPublicSafe } from "../src/public/snapshot/privacy";
import { SNAPSHOT_RETENTION, SnapshotStore } from "../src/public/snapshot/store";
import { snapshotFilename } from "../src/public/snapshot/version";

const NY = "America/New_York";

describe("publication-local dates and the article path", () => {
  it("dates an ordinary Eastern daytime publication by its local day", () => {
    const instant = "2026-10-14T14:05:09.000Z"; // 10:05:09 a.m. EDT
    expect(publicationLocalDate(instant, NY)).toBe("2026-10-14");
    expect(publicationLocalDateTime(instant, NY)).toBe("2026-10-14T10:05:09");
    expect(publicationUtcDateTime(instant)).toBe("2026-10-14T14:05:09");
    expect(publicStoryPath({ slug: "budget", sectionSlug: "news", publishedAt: instant, timeZone: NY })).toBe("/2026/10/14/news/budget/");
  });

  it("uses the Eastern date for an 11:30 p.m. publication that is already the next day in UTC", () => {
    const instant = "2026-11-08T04:30:00.000Z"; // 11:30 p.m. EST on Nov 7
    expect(instant.slice(0, 10)).toBe("2026-11-08");
    expect(publicationLocalDate(instant, NY)).toBe("2026-11-07");
    expect(publicationLocalDateTime(instant, NY)).toBe("2026-11-07T23:30:00");
    expect(publicationUtcDateTime(instant)).toBe("2026-11-08T04:30:00");
    expect(publicStoryPath({ slug: "late-game", sectionSlug: "sports", publishedAt: instant, timeZone: NY })).toBe("/2026/11/07/sports/late-game/");
  });

  it("follows daylight-saving transitions", () => {
    // Spring forward: 2026-03-08 02:00 EST → 03:00 EDT.
    expect(publicationLocalDateTime("2026-03-08T06:59:00.000Z", NY)).toBe("2026-03-08T01:59:00");
    expect(publicationLocalDateTime("2026-03-08T07:00:00.000Z", NY)).toBe("2026-03-08T03:00:00");
    // Fall back: 2026-11-01 02:00 EDT → 01:00 EST; both 1:30s are Nov 1.
    expect(publicationLocalDateTime("2026-11-01T05:30:00.000Z", NY)).toBe("2026-11-01T01:30:00");
    expect(publicationLocalDateTime("2026-11-01T06:30:00.000Z", NY)).toBe("2026-11-01T01:30:00");
    // 11:45 p.m. on the evening before the change, already Nov 1 in UTC.
    expect(publicStoryPath({ slug: "s", sectionSlug: "news", publishedAt: "2026-11-01T03:45:00.000Z", timeZone: NY })).toBe("/2026/10/31/news/s/");
    expect(publicationLocalMinute("2026-03-08T07:30:00.000Z", NY)).toBe("2026-03-08T03:30");
  });

  it("knows no path until slug, section and publication time exist", () => {
    expect(publicStoryPath({ slug: "", sectionSlug: "news", publishedAt: "2026-01-01T12:00:00Z", timeZone: NY })).toBe("");
    expect(publicStoryPath({ slug: "a", sectionSlug: "", publishedAt: "2026-01-01T12:00:00Z", timeZone: NY })).toBe("");
    expect(publicStoryPath({ slug: "a", sectionSlug: "news", publishedAt: null, timeZone: NY })).toBe("");
  });

  it("Live Preview dates the article URL in the publication's timezone, like the snapshot", () => {
    const doc = { id: 7, headline: "Late game", slug: "late-game", section: { id: 1, name: "Sports", slug: "sports" }, publishedAt: "2026-11-08T04:30:00.000Z", contentFormat: "byline-v1", body: null };
    const { story } = payloadPublicStory(doc, { publication: DEFAULT_PREVIEW_PUBLICATION });
    expect(DEFAULT_PREVIEW_PUBLICATION.timeZone).toBe(NY);
    expect(story.href).toBe("/2026/11/07/sports/late-game/");
    expect(story.href).toBe(publicStoryPath({ slug: "late-game", sectionSlug: "sports", publishedAt: doc.publishedAt, timeZone: NY }));
  });
});

describe("Page bodies", () => {
  const text = (value: string, format = 0) => ({ type: "text", text: value, format, version: 1 });
  const node = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({ type, children, version: 1, ...extra });

  it("converts only the bounded prose", () => {
    const body = { root: node("root", [
      node("heading", [text("About us")], { tag: "h2" }),
      node("paragraph", [text("We are "), text("student", 1), text(" journalists", 2), node("link", [text("read")], { fields: { url: "https://example.org/a?b=1", linkType: "custom" } })]),
      node("list", [node("listitem", [text("one")]), node("listitem", [text("<two>")])], { listType: "bullet" })
    ]) };
    expect(pageBodyHtml(body, { id: 1, title: "About" })).toBe('<h2>About us</h2><p>We are <strong>student</strong><em> journalists</em><a href="https://example.org/a?b=1" rel="noopener">read</a></p><ul><li>one</li><li>&lt;two&gt;</li></ul>');
  });

  it("refuses anything outside it instead of dropping or emitting it", () => {
    const fail = (child: unknown) => () => pageBodyHtml({ root: node("root", [child]) }, { id: 9, title: "Odd" });
    expect(fail(node("quote", [text("x")]))).toThrow(PublicSnapshotError);
    expect(fail(node("heading", [text("x")], { tag: "h4" }))).toThrow(/Page 9/);
    expect(fail(node("paragraph", [node("link", [text("x")], { fields: { url: "javascript:alert(1)" } })]))).toThrow(/unsupported|unsafe/);
    expect(fail(node("paragraph", [text("code", 16)]))).toThrow();
  });
});

describe("immutable snapshot artifacts and retention", () => {
  const dirs: string[] = [];
  const store = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "byline-snapshots-"));
    dirs.push(dir);
    return new SnapshotStore(dir);
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("names an artifact by the digest of its exact bytes and never overwrites one", async () => {
    const snapshots = store();
    const bytes = Buffer.from('{"schemaVersion":1}', "utf8");
    const first = await snapshots.write(bytes, 4);
    expect(first.filename).toMatch(/^snapshot-v2-r4-[0-9a-f]{64}\.json$/);
    expect(await snapshots.verify(first.filename, first.sha256, first.bytes)).toBe(true);
    // Identical bytes are reused.
    expect(await snapshots.write(bytes, 4)).toEqual(first);
    expect(readdirSync(snapshots.directory).filter((name) => name.startsWith(".tmp-"))).toEqual([]);
    // Different bytes under an existing name are a storage failure, never an overwrite.
    const other = Buffer.from('{"schemaVersion":1,"x":1}', "utf8");
    const taken = snapshotFilename(5, (await import("node:crypto")).createHash("sha256").update(other).digest("hex"));
    writeFileSync(path.join(snapshots.directory, taken), "tampered");
    await expect(snapshots.write(other, 5)).rejects.toMatchObject({ code: "storage-failure" });
    expect(await snapshots.findByDigest(first.sha256)).toBe(first.filename);
    expect(snapshots.pathFor("../etc/passwd")).toBeNull();
  });

  it("keeps the current artifact, the newest four, a one-day grace and at most twenty", async () => {
    const snapshots = store();
    const now = Date.now();
    const written = [];
    for (let revision = 1; revision <= 30; revision++) {
      const result = await snapshots.write(Buffer.from(JSON.stringify({ revision })), revision);
      // Revision 1 is the oldest; revisions 1–10 are two days old, the rest are recent.
      const age = revision <= 10 ? 2 * 24 * 3600 * 1000 + (30 - revision) * 1000 : (30 - revision) * 1000;
      const when = new Date(now - age);
      utimesSync(path.join(snapshots.directory, result.filename), when, when);
      written.push(result);
    }
    writeFileSync(path.join(snapshots.directory, ".tmp-abandoned.json"), "x");
    const old = new Date(now - SNAPSHOT_RETENTION.tempMaxAgeMs - 1000);
    utimesSync(path.join(snapshots.directory, ".tmp-abandoned.json"), old, old);
    const current = written[0].filename; // an old revision still advertised as current
    await snapshots.prune(current, now);
    const left = (await snapshots.list()).map((entry) => entry.revision).sort((a, b) => a - b);
    expect(left).toContain(1);
    // Newest 19 recent ones plus the current one: twenty in all, none of the expired old ones.
    expect(left.length).toBe(SNAPSHOT_RETENTION.maxRetained);
    expect(left.filter((revision) => revision > 1 && revision <= 10)).toEqual([]);
    expect(readdirSync(snapshots.directory).some((name) => name.startsWith(".tmp-"))).toBe(false);
  });
});

describe("privacy sentinel", () => {
  it("refuses private fields and newsroom infrastructure references", () => {
    expect(() => assertPublicSafe({ a: { brief: "x" } }, "{}")).toThrow(/brief/);
    expect(() => assertPublicSafe({ a: 1 }, '{"u":"https://n.example/api/media/file/a.jpg"}')).toThrow(/private/);
    expect(() => assertPublicSafe({ a: 1 }, '{"t":"secret-build-token-0123456789-abcdef"}', { BYLINE_BUILD_TOKEN: "secret-build-token-0123456789-abcdef", BYLINE_MEDIA_LOCAL_DIR: "/srv/media", BYLINE_PUBLICATION_MEDIA_DIR: "/srv/pub" })).toThrow(/credential/);
    const deployHook = "https://api.example.test/deploy/credential-token";
    expect(() => assertPublicSafe({ a: 1 }, JSON.stringify({ hook: deployHook }), { BYLINE_DEPLOY_HOOK_URL: deployHook, BYLINE_MEDIA_LOCAL_DIR: "/srv/media", BYLINE_PUBLICATION_MEDIA_DIR: "/srv/pub" })).toThrow(/deploy-hook credential/);
    expect(() => assertPublicSafe({ socials: { email: "editor@weeklywildcat.com" }, urls: { contact: "/contact/" } }, "{}", { BYLINE_MEDIA_LOCAL_DIR: "/srv/media", BYLINE_PUBLICATION_MEDIA_DIR: "/srv/pub" })).not.toThrow();
  });
});
