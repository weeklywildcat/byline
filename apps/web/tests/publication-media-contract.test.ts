import { describe, expect, it } from "vitest";
import {
  effectivePublicationStatus,
  isPublicationMediaPath,
  largestNaturalImage,
  legacyRenditionsFromManifest,
  publicationManifestBlobs,
  publicationMediaPath,
  publicationMediaReadiness,
  publicationMediaStem,
  validatePublicationMediaManifest,
  PUBLICATION_MEDIA_RECIPE_VERSION,
  type PublicationImageManifest,
  type PublicationMimeType
} from "@byline/content";

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const file = (seed: string, label: string, width: number, height: number, mimeType: PublicationMimeType = "image/webp") => ({
  sha256: sha(seed),
  bytes: 1000 + width,
  mimeType,
  publicPath: publicationMediaPath({ kind: "image", filename: "Marching Band.JPG", label, sha256: sha(seed), mimeType }),
  width,
  height
});

function manifest(): PublicationImageManifest {
  const square = file("d", "square-1080", 1080, 1080);
  return {
    schemaVersion: 1,
    recipeVersion: PUBLICATION_MEDIA_RECIPE_VERSION,
    kind: "image",
    source: { width: 4000, height: 3000, animated: false, hasAlpha: false },
    focalPoint: { x: 40, y: 30 },
    natural: [file("a", "w320", 320, 240), file("b", "w640", 640, 480), file("c", "w2560", 2560, 1920)],
    crops: { square: { rect: { x: 0, y: 0, w: 0.75, h: 1 }, renditions: [file("e", "square-320", 320, 320), square] } },
    seo: { "16x9": { ...file("f", "seo-16x9", 2560, 1440), origin: "auto" }, "4x3": { ...file("1", "seo-4x3", 2560, 1920), origin: "auto" }, "1x1": { ...square, origin: "custom" } },
    social: { ...file("2", "social", 1200, 630, "image/jpeg"), origin: "auto" },
    animation: null,
    warnings: []
  };
}

describe("publication media paths", () => {
  it("are deterministic, readable and fingerprinted by content", () => {
    const path = publicationMediaPath({ kind: "image", filename: "Marching Band (2).JPG", label: "wide-1920", sha256: sha("ab"), mimeType: "image/webp" });
    expect(path).toBe("/_byline/media/images/ab/marching-band-2--wide-1920--abababababababab.webp");
    expect(publicationMediaPath({ kind: "image", filename: "Marching Band (2).JPG", label: "wide-1920", sha256: sha("ab"), mimeType: "image/webp" })).toBe(path);
    expect(isPublicationMediaPath(path, sha("ab"), "image/webp")).toBe(true);
    expect(publicationMediaPath({ kind: "document", filename: "minutes.pdf", label: "file", sha256: sha("0"), mimeType: "application/pdf" })).toMatch(/^\/_byline\/media\/documents\/00\/minutes--file--0{16}\.pdf$/);
  });

  it("make safe stems from any filename", () => {
    expect(publicationMediaStem("../../etc/passwd")).toBe("etc-passwd");
    expect(publicationMediaStem("Ünïcode Fïlé.png")).toBe("unicode-file");
    expect(publicationMediaStem("....")).toBe("media");
  });

  it("refuse traversal, other prefixes, a mismatched hash and a mismatched type", () => {
    const good = publicationMediaPath({ kind: "image", filename: "a.jpg", label: "w320", sha256: sha("c"), mimeType: "image/webp" });
    expect(isPublicationMediaPath(good.replace("/images/", "/images/../"))).toBe(false);
    expect(isPublicationMediaPath("/api/media/file/a.jpg")).toBe(false);
    expect(isPublicationMediaPath(good, sha("d"))).toBe(false);
    expect(isPublicationMediaPath(good, sha("c"), "image/jpeg")).toBe(false);
    expect(() => publicationMediaPath({ kind: "image", filename: "a", label: "Bad Label", sha256: sha("c"), mimeType: "image/webp" })).toThrow();
    expect(() => publicationMediaPath({ kind: "image", filename: "a", label: "w1", sha256: "abc", mimeType: "image/webp" })).toThrow();
  });
});

describe("publication media manifest validation", () => {
  it("accepts a well-formed image manifest", () => {
    expect(validatePublicationMediaManifest(manifest()).ok).toBe(true);
  });

  it("rejects malformed hashes, unsafe paths and invalid descriptors", () => {
    const badHash = manifest();
    badHash.natural[0] = { ...badHash.natural[0], sha256: "ABC" };
    expect(validatePublicationMediaManifest(badHash).ok).toBe(false);

    const unsafe = manifest();
    unsafe.natural[0] = { ...unsafe.natural[0], publicPath: "/api/media/file/IMG_4932.jpg" };
    expect(validatePublicationMediaManifest(unsafe)).toMatchObject({ ok: false, errors: [expect.stringContaining("unsafe")] });

    const leak = manifest() as unknown as { natural: Array<Record<string, unknown>> };
    leak.natural[0] = { ...leak.natural[0], path: "/var/lib/byline/media/IMG_4932.jpg" };
    expect(validatePublicationMediaManifest(leak).ok).toBe(false);

    const unordered = manifest();
    unordered.natural.reverse();
    expect(validatePublicationMediaManifest(unordered).ok).toBe(false);

    const tooBig = manifest();
    tooBig.social = { ...tooBig.social, bytes: 26 * 1024 * 1024 };
    expect(validatePublicationMediaManifest(tooBig).ok).toBe(false);

    const animatedWithout = manifest();
    animatedWithout.source.animated = true;
    expect(validatePublicationMediaManifest(animatedWithout).ok).toBe(false);

    expect(validatePublicationMediaManifest({ ...manifest(), schemaVersion: 2 }).ok).toBe(false);
    expect(validatePublicationMediaManifest(null).ok).toBe(false);
  });

  it("validates document and audio manifests", () => {
    const pdf = { sha256: sha("9"), bytes: 2048, mimeType: "application/pdf" as const, publicPath: publicationMediaPath({ kind: "document", filename: "minutes.pdf", label: "file", sha256: sha("9"), mimeType: "application/pdf" }) };
    expect(validatePublicationMediaManifest({ schemaVersion: 1, recipeVersion: 1, kind: "document", file: pdf }).ok).toBe(true);
    expect(validatePublicationMediaManifest({ schemaVersion: 1, recipeVersion: 1, kind: "audio", file: pdf }).ok).toBe(false);
  });

  it("lists every distinct file once", () => {
    const blobs = publicationManifestBlobs(manifest());
    expect(blobs.map((blob) => blob.publicPath)).toHaveLength(new Set(blobs.map((blob) => blob.publicPath)).size);
    // natural 3 + square 2 + seo 16x9 + seo 4x3 (+ seo 1x1 reuses the square crop) + social
    expect(blobs).toHaveLength(8);
    expect(blobs.every((blob) => !("origin" in blob))).toBe(true);
  });
});

describe("effective readiness", () => {
  const ready = () => ({ status: "ready", preparedRevision: 3, recipeVersion: PUBLICATION_MEDIA_RECIPE_VERSION, manifest: manifest() });

  it("is ready only when status, revision, recipe and manifest agree", () => {
    expect(publicationMediaReadiness(ready(), 3).ready).toBe(true);
    expect(publicationMediaReadiness(ready(), 4)).toEqual({ ready: false, reason: "stale-revision" });
    expect(publicationMediaReadiness({ ...ready(), recipeVersion: PUBLICATION_MEDIA_RECIPE_VERSION - 1 }, 3)).toEqual({ ready: false, reason: "stale-recipe" });
    expect(publicationMediaReadiness(ready(), 3, PUBLICATION_MEDIA_RECIPE_VERSION + 1)).toEqual({ ready: false, reason: "stale-recipe" });
    expect(publicationMediaReadiness({ ...ready(), manifest: { schemaVersion: 1 } }, 3)).toEqual({ ready: false, reason: "invalid-manifest" });
    expect(publicationMediaReadiness({ ...ready(), status: "preparing" }, 3)).toEqual({ ready: false, reason: "preparing" });
    expect(publicationMediaReadiness({ ...ready(), status: "failed" }, 3)).toEqual({ ready: false, reason: "failed" });
    expect(publicationMediaReadiness(null, 1)).toEqual({ ready: false, reason: "not-prepared" });
  });

  it("shows a stale generation as not prepared, never ready", () => {
    expect(effectivePublicationStatus(ready(), 4)).toBe("not-prepared");
    expect(effectivePublicationStatus(ready(), 3)).toBe("ready");
  });
});

describe("Phase 7 compatibility", () => {
  it("maps the largest natural file to the source and crop families to legacy renditions", () => {
    const value = manifest();
    expect(largestNaturalImage(value).width).toBe(2560);
    const renditions = legacyRenditionsFromManifest(value);
    expect(Object.keys(renditions).sort()).toEqual(["social", "square"]);
    expect(renditions.square?.map((item) => item.width)).toEqual([320, 1080]);
    expect(renditions.social?.[0]).toMatchObject({ width: 1200, height: 630 });
    expect(renditions.square?.[0].url.startsWith("/_byline/media/images/")).toBe(true);
  });
});
