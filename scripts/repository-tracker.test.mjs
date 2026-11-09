import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRepositoryTracker, registerInSource, registryHasKey, trackerNames } from "./repository-tracker.mjs";

const realRegistry = path.join(path.dirname(fileURLToPath(import.meta.url)), "../packages/story-presentations/src/trackers/registry.ts");

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "repository-tracker-"));
  await mkdir(path.join(root, "packages/story-presentations/src/trackers"), { recursive: true });
  await writeFile(path.join(root, "packages/story-presentations/src/trackers/registry.ts"), await readFile(realRegistry, "utf8"));
  return root;
}

test("names are valid identifiers", () => {
  assert.deepEqual(trackerNames("sidewalk-project"), { component: "SidewalkProject", constant: "SIDEWALK_PROJECT" });
  assert.deepEqual(trackerNames("2026-bond"), { component: "Tracker2026Bond", constant: "TRACKER_2026_BOND" });
});

test("creates the tracker folder and registers it in production trackers only", async () => {
  const root = await workspace();
  try {
    const result = await createRepositoryTracker({ key: "sidewalk-project", root });
    const base = path.join(root, "packages/story-presentations/src/trackers");
    const index = await readFile(path.join(base, "sidewalk-project/index.tsx"), "utf8");
    const styles = await readFile(path.join(base, "sidewalk-project/styles.css"), "utf8");
    const registry = await readFile(path.join(base, "registry.ts"), "utf8");
    assert.equal(result.registered, true);
    assert.match(index, /export function SidewalkProject\(/);
    assert.match(index, /key: "sidewalk-project"/);
    assert.match(index, /client: false/);
    assert.match(styles, /\.tracker-sidewalk-project /);
    assert.equal(existsSync(path.join(base, "sidewalk-project/client.ts")), false);
    assert.match(registry, /import \{ SIDEWALK_PROJECT \} from "\.\/sidewalk-project";/);
    assert.match(registry, /repositoryTrackers: RepositoryTrackerRegistry = \{\n  "sidewalk-project": SIDEWALK_PROJECT,\n\};/);
    assert.match(registry, /fixtureRepositoryTrackers: RepositoryTrackerRegistry = \{ \[FIXTURE_SIDEWALK_PROJECT\.key\]: FIXTURE_SIDEWALK_PROJECT \};/);
    assert.equal(registryHasKey(registry, "sidewalk-project"), true);

    await createRepositoryTracker({ key: "bond-projects", client: true, root });
    const twice = await readFile(path.join(base, "registry.ts"), "utf8");
    assert.match(twice, /\{\n  "sidewalk-project": SIDEWALK_PROJECT,\n  "bond-projects": BOND_PROJECTS,\n\};/);
    assert.match(await readFile(path.join(base, "bond-projects/client.ts"), "utf8"), /const enhance: RepositoryTrackerClient/);
    assert.match(await readFile(path.join(base, "bond-projects/index.tsx"), "utf8"), /client: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses bad keys, fixture keys and duplicates", async () => {
  const root = await workspace();
  try {
    await assert.rejects(createRepositoryTracker({ key: "Sidewalk Project", root }), /kebab-case/);
    await assert.rejects(createRepositoryTracker({ key: "fixture-thing", root }), /reserved/);
    await createRepositoryTracker({ key: "sidewalk-project", root });
    await assert.rejects(createRepositoryTracker({ key: "sidewalk-project", root }), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns null when the registry has an unexpected shape", () => {
  assert.equal(registerInSource("export const somethingElse = {};", { key: "x" }), null);
});
