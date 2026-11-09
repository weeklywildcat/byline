import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION, validatePublicBuildSnapshotV2, type PublicBuildSnapshotV2 } from "@byline/content";
import { repositoryInteractiveRegistry } from "@byline/story-presentations/interactives";
import { repositoryTrackerRegistry } from "@byline/story-presentations/trackers";

export type NativeSnapshotPointer = {
  schemaVersion: typeof PUBLIC_SNAPSHOT_SCHEMA_VERSION; revision: number; generatedAt: string; digest: string; bytes: number; url: string;
};

const fixtureMode = () => process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture";

export function publicTrackerRegistry() {
  return repositoryTrackerRegistry({ fixtures: fixtureMode() });
}

export function publicInteractiveRegistry() {
  return repositoryInteractiveRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture" });
}

export function parseNativeSnapshot(bytes: Uint8Array, pointer?: NativeSnapshotPointer, minimumRevision = 0): PublicBuildSnapshotV2 {
  if (pointer) {
    if (pointer.schemaVersion !== PUBLIC_SNAPSHOT_SCHEMA_VERSION) throw new Error("Unsupported pointer schemaVersion.");
    if (bytes.byteLength !== pointer.bytes) throw new Error("Snapshot artifact byte length mismatch.");
    if (createHash("sha256").update(bytes).digest("hex") !== pointer.digest) throw new Error("Snapshot artifact SHA-256 digest mismatch.");
  }
  const registry = publicInteractiveRegistry();
  const trackers = publicTrackerRegistry();
  const snapshot = validatePublicBuildSnapshotV2(JSON.parse(Buffer.from(bytes).toString("utf8")), { interactive: (key) => Object.hasOwn(registry, key), tracker: (key) => Object.hasOwn(trackers, key) });
  if (pointer && (snapshot.revision !== pointer.revision || Date.parse(snapshot.generatedAt) !== Date.parse(pointer.generatedAt))) throw new Error("Snapshot artifact does not match its pointer revision or generation time.");
  if (snapshot.revision < minimumRevision) throw new Error("Snapshot is stale for the expected revision.");
  return snapshot;
}

let local: PublicBuildSnapshotV2 | undefined;
export function getNativeSnapshot(): PublicBuildSnapshotV2 | undefined {
  const file = process.env.BYLINE_PREPARED_SNAPSHOT_FILE;
  if (!file || process.env.BYLINE_PREPARED_SNAPSHOT_PROVIDER !== "payload") return undefined;
  return local ??= parseNativeSnapshot(readFileSync(file));
}

type Story = PublicBuildSnapshotV2["datasets"]["stories"][number];
type Collection = PublicBuildSnapshotV2["datasets"]["collections"][number];
let storyIndex: ReturnType<typeof indexStories> | undefined;
let media: Map<number, PublicBuildSnapshotV2["datasets"]["media"][number]> | undefined;

function indexStories({ datasets }: PublicBuildSnapshotV2) {
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

export function nativeStoryRoute(story: PublicBuildSnapshotV2["datasets"]["stories"][number]) {
  const [, year, month, day, category, slug] = story.href.split("/");
  return { year, month, day, category, slug };
}
