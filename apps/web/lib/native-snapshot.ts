import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SUPPORTED_PUBLIC_SNAPSHOT_SCHEMA_VERSIONS, validatePublicBuildSnapshot, type PublicBuildSnapshot, type SupportedSnapshotSchemaVersion } from "@byline/content";
import { dataPresentationRegistry } from "@byline/data-presentations/registry";
import { repositoryInteractiveRegistry } from "@byline/story-presentations/interactives";
import { repositoryTrackerRegistry } from "@byline/story-presentations/trackers";

export type NativeSnapshotPointer = {
  schemaVersion: SupportedSnapshotSchemaVersion; revision: number; generatedAt: string; digest: string; bytes: number; url: string;
};

const fixtureMode = () => process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture";

export function publicTrackerRegistry() {
  return repositoryTrackerRegistry({ fixtures: fixtureMode() });
}

/** Data presentations the public build renders: fixtures only in the fixture builds, never in production. */
export function publicDataPresentationRegistry() {
  const mode = process.env.BYLINE_CONTENT_MODE;
  return dataPresentationRegistry({ fixtures: mode === "weekly-wildcat-fixture" || mode === "weekly-wildcat-browser-fixture" });
}

export function publicInteractiveRegistry() {
  return repositoryInteractiveRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture" });
}

export function parseNativeSnapshot(bytes: Uint8Array, pointer?: NativeSnapshotPointer, minimumRevision = 0): PublicBuildSnapshot {
  if (pointer) {
    if (!(SUPPORTED_PUBLIC_SNAPSHOT_SCHEMA_VERSIONS as readonly number[]).includes(pointer.schemaVersion)) throw new Error("Unsupported pointer schemaVersion.");
    if (bytes.byteLength !== pointer.bytes) throw new Error("Snapshot artifact byte length mismatch.");
    if (createHash("sha256").update(bytes).digest("hex") !== pointer.digest) throw new Error("Snapshot artifact SHA-256 digest mismatch.");
  }
  const registry = publicInteractiveRegistry();
  const trackers = publicTrackerRegistry();
  const presentations = publicDataPresentationRegistry();
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as { schemaVersion?: unknown };
  if (pointer && parsed?.schemaVersion !== pointer.schemaVersion) throw new Error("Snapshot artifact schemaVersion does not match its pointer.");
  const snapshot = validatePublicBuildSnapshot(parsed, {
    interactive: (key) => Object.hasOwn(registry, key),
    tracker: (key) => Object.hasOwn(trackers, key),
    dataPresentation: (key) => (Object.hasOwn(presentations, key) ? presentations[key].descriptor : undefined)
  });
  if (pointer && (snapshot.revision !== pointer.revision || Date.parse(snapshot.generatedAt) !== Date.parse(pointer.generatedAt))) throw new Error("Snapshot artifact does not match its pointer revision or generation time.");
  if (snapshot.revision < minimumRevision) throw new Error("Snapshot is stale for the expected revision.");
  return snapshot;
}

let local: PublicBuildSnapshot | undefined;
export function getNativeSnapshot(): PublicBuildSnapshot | undefined {
  const file = process.env.BYLINE_PREPARED_SNAPSHOT_FILE;
  if (!file) return undefined;
  return local ??= parseNativeSnapshot(readFileSync(file));
}

type Story = PublicBuildSnapshot["datasets"]["stories"][number];
type Collection = PublicBuildSnapshot["datasets"]["collections"][number];
let storyIndex: ReturnType<typeof indexStories> | undefined;
let media: Map<number, PublicBuildSnapshot["datasets"]["media"][number]> | undefined;

function indexStories({ datasets }: PublicBuildSnapshot) {
  const byId = new Map<number, Story>();
  const byTerm = new Map<string, Story[]>();
  const byContributor = new Map<string, Story[]>();
  const collections = new Map<number, Collection[]>();
  function add<K, V>(map: Map<K, V[]>, key: K, value: V) {
    const entries = map.get(key) ?? [];
    entries.push(value);
    map.set(key, entries);
  }
  for (const story of datasets.stories) {
    byId.set(story.id, story);
    for (const term of [...story.sectionKeys, ...story.topicKeys]) add(byTerm, term, story);
    for (const key of story.contributorKeys) add(byContributor, key, story);
  }
  for (const collection of datasets.collections) for (const id of collection.stories) add(collections, id, collection);
  return { byId, byTerm, byContributor, collections };
}

export function nativeStoryIndex() {
  const snapshot = getNativeSnapshot();
  if (snapshot) return storyIndex ??= indexStories(snapshot);
}

export function nativeStory(id: number) {
  return nativeStoryIndex()?.byId.get(id);
}

export function nativeMedia(id: number) {
  const snapshot = getNativeSnapshot();
  if (!snapshot) return undefined;
  return (media ??= new Map(snapshot.datasets.media.map((asset) => [asset.id, asset]))).get(id);
}

export function nativeStoryRoute(story: PublicBuildSnapshot["datasets"]["stories"][number]) {
  const [, year, month, day, category, slug] = story.href.split("/");
  return { year, month, day, category, slug };
}
