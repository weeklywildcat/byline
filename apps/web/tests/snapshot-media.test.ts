import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
it("deduplicates a whole snapshot and bounds downloads even in one large HTML string", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "byline-media-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(temporary);
  vi.stubEnv("NEXT_PUBLIC_WP_API_URL", "https://cms.example.test/wp-json/wp/v2");
  vi.stubEnv("BYLINE_MEDIA_CONCURRENCY", "3");
  vi.stubEnv("WORDPRESS_MEDIA_MIRROR", "1");
  let active = 0; let maximum = 0;
  const fetch = vi.fn(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 3)); active--;
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
  });
  vi.stubGlobal("fetch", fetch);
  try {
    vi.resetModules();
    const { materializeSnapshotMedia } = await import("@/lib/media");
    const html = Array.from({ length: 25 }, (_, i) => `<img src="https://cms.example.test/wp-content/uploads/test-${i}.jpg">`).join("");
    const result = await materializeSnapshotMedia({ body: html + html, repeated: [html, html] });
    expect(fetch).toHaveBeenCalledTimes(25);
    expect(maximum).toBe(3);
    expect(result.metrics.uniqueReferences).toBe(25);
    expect(result.value.body).toContain("/_wordpress-media/");
    expect(result.value.body).not.toContain("https://cms.example.test/wp-content/uploads/");
  } finally {
    cwd.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await rm(temporary, { recursive: true, force: true });
  }
});
it("resolves attachment fallback entirely from local metadata without a late CMS request", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "byline-attachment-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(temporary);
  const { writeFile } = await import("node:fs/promises");
  const publication = (await import("./fixtures/weekly-wildcat-publication.json")).default;
  const alternate = "https://cms.example.test/wp-content/uploads/alternate.jpg";
  const datasets = { posts: [], authors: [], guests: [], categories: [], tags: [], pages: [], corrections: [], coverages: [], schoolEvents: [], attachments: [{ id: 99, source_url: alternate, media_details: {}, title: { rendered: "Alternate" }, caption: { rendered: "" }, alt_text: "Alternate" }] };
  const file = path.join(temporary, "snapshot.json");
  await writeFile(file, JSON.stringify({ schemaVersion: 1, revision: publication.revision, generatedAt: new Date().toISOString(), sourceTimezone: publication.timezone, publication, datasets, counts: Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length])) }));
  vi.stubEnv("BYLINE_PREPARED_SNAPSHOT_FILE", file);
  vi.stubEnv("NEXT_PUBLIC_WP_API_URL", "https://cms.example.test/wp-json/wp/v2");
  vi.stubEnv("WORDPRESS_MEDIA_MIRROR", "1");
  const fetch = vi.fn(async (input: string | URL | Request) => String(input) === alternate
    ? new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } })
    : new Response("Missing", { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  try {
    vi.resetModules();
    const { materializeSnapshotMedia } = await import("@/lib/media");
    const result = await materializeSnapshotMedia('<img class="wp-image-99" src="https://cms.example.test/wp-content/uploads/missing.jpg">');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => !String(url).includes("/wp-json/"))).toBe(true);
    expect(result.value).toContain("/_wordpress-media/");
    expect(result.value).toContain("alternate.jpg");
  } finally {
    cwd.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await rm(temporary, { recursive: true, force: true });
  }
});
