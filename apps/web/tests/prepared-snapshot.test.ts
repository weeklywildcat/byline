import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseBuildSnapshot, validateBuildSnapshot, type PublicBuildSnapshot } from "@/lib/prepared-snapshot";
import publication from "./fixtures/weekly-wildcat-publication.json";
import fixture from "./fixtures/weekly-wildcat-content.json";
function snapshot(): PublicBuildSnapshot {
  const datasets = { posts: fixture.posts, authors: fixture.authors, categories: fixture.categories, tags: fixture.tags, pages: fixture.pages, guests: [], corrections: [], coverages: [], schoolEvents: [], attachments: [] };
  return { schemaVersion: 1, revision: publication.revision, generatedAt: new Date().toISOString(), sourceTimezone: publication.timezone, publication, datasets, counts: Object.fromEntries(Object.entries(datasets).map(([key, values]) => [key, values.length])) } as unknown as PublicBuildSnapshot;
}
describe("prepared snapshot fails closed", () => {
  it("accepts a complete artifact only after verifying exact bytes, SHA-256 and revision", () => {
    const s = snapshot(); const bytes = Buffer.from(JSON.stringify(s));
    const pointer = { schemaVersion: 1 as const, revision: s.revision, generatedAt: s.generatedAt, digest: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, url: "https://cms.test/snapshot.json" };
    expect(parseBuildSnapshot(bytes, pointer)).toEqual(s);
    expect(() => parseBuildSnapshot(Buffer.from(bytes.toString().replace("Student", "student")), pointer)).toThrow(/digest mismatch/);
    expect(() => parseBuildSnapshot(bytes, { ...pointer, bytes: 1 })).toThrow(/byte length/);
    expect(() => parseBuildSnapshot(bytes, { ...pointer, revision: s.revision + 1 })).toThrow(/revision mismatch/);
    expect(() => parseBuildSnapshot(bytes, pointer, s.revision + 1)).toThrow(/stale/);
  });
  it("rejects unsupported schema, malformed JSON, missing datasets and incomplete rows", () => {
    expect(() => validateBuildSnapshot({ ...snapshot(), schemaVersion: 2 })).toThrow(/schemaVersion/);
    expect(() => parseBuildSnapshot(Buffer.from("{"))).toThrow();
    const incomplete = snapshot(); delete (incomplete.datasets as any).schoolEvents;
    expect(() => validateBuildSnapshot(incomplete)).toThrow(/schoolEvents/);
    const wrong = snapshot(); wrong.counts.posts++;
    expect(() => validateBuildSnapshot(wrong)).toThrow(/count mismatch/);
    const broken = structuredClone(snapshot()); delete (broken.datasets.posts[0] as any).content;
    expect(() => validateBuildSnapshot(broken)).toThrow(/incomplete rendered/);
    const privatePost = structuredClone(snapshot()); privatePost.datasets.posts[0].status = "draft";
    expect(() => validateBuildSnapshot(privatePost)).toThrow(/non-public/);
  });
});
