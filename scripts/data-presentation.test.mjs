import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDataPresentation, presentationNames, registerInSource } from "./data-presentation.mjs";

const realRegistry = path.join(path.dirname(fileURLToPath(import.meta.url)), "../packages/data-presentations/src/registry.ts");

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-presentation-"));
  await mkdir(path.join(root, "packages/data-presentations/src"), { recursive: true });
  await writeFile(path.join(root, "packages/data-presentations/src/registry.ts"), await readFile(realRegistry, "utf8"));
  return root;
}

test("names are valid identifiers", () => {
  assert.deepEqual(presentationNames("election-center"), { component: "ElectionCenter", binding: "electionCenter" });
  assert.deepEqual(presentationNames("2026-results"), { component: "Data2026Results", binding: "data2026Results" });
});

test("scaffolds a custom presentation with no data.ts and registers it in production presentations", async () => {
  const root = await workspace();
  try {
    const result = await createDataPresentation({ key: "election-center", client: true, root });
    const base = path.join(root, "packages/data-presentations/src");
    const index = await readFile(path.join(base, "presentations/election-center/index.tsx"), "utf8");
    const registry = await readFile(path.join(base, "registry.ts"), "utf8");
    assert.equal(result.registered, true);
    assert.match(index, /export default defineDataPresentation\(\{\n  key: "election-center"/);
    assert.match(index, /client: true/);
    assert.equal(existsSync(path.join(base, "presentations/election-center/data.ts")), false);
    assert.match(await readFile(path.join(base, "presentations/election-center/styles.css"), "utf8"), /\.data-presentation-election-center /);
    assert.match(await readFile(path.join(base, "presentations/election-center/client.ts"), "utf8"), /const enhance: DataPresentationClient/);
    assert.match(registry, /import electionCenter from "\.\/presentations\/election-center";/);
    assert.match(registry, /dataPresentations: readonly DataPresentationDefinition\[\] = \[electionCenter\];/);
    assert.match(registry, /fixtureDataPresentations: readonly DataPresentationDefinition\[\] = \[fixtureSidewalkProject\];/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scaffolds a template among the built-ins", async () => {
  const root = await workspace();
  try {
    await createDataPresentation({ key: "school-board-votes", template: true, root });
    const registry = await readFile(path.join(root, "packages/data-presentations/src/registry.ts"), "utf8");
    assert.match(registry, /dataTemplates: readonly DataPresentationDefinition\[\] = \[table, ranking, timeline, schoolBoardVotes\];/);
    assert.match(await readFile(path.join(root, "packages/data-presentations/src/templates/school-board-votes/index.tsx"), "utf8"), /defineDataTemplate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses bad keys, fixture keys and duplicates", async () => {
  const root = await workspace();
  try {
    await assert.rejects(createDataPresentation({ key: "Election Center", root }), /kebab-case/);
    await assert.rejects(createDataPresentation({ key: "fixture-thing", root }), /reserved/);
    await assert.rejects(createDataPresentation({ key: "table", template: true, root }), /already registered/);
    await createDataPresentation({ key: "election-center", root });
    await assert.rejects(createDataPresentation({ key: "election-center", template: true, root }), /already exists/);
    assert.equal(registerInSource("export const nothing = 1;", { key: "x", template: false }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
