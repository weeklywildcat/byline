import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { assertPreparedBuildMode } from "@/lib/prepared-data";
it("fails direct production loaders closed unless a deliberate fixture/fallback is selected", () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("BYLINE_PREPARED_SNAPSHOT_FILE", ""); vi.stubEnv("BYLINE_CONTENT_MODE", ""); vi.stubEnv("BYLINE_LEGACY_REST_BUILD", "");
  try {
    expect(assertPreparedBuildMode).toThrow(/prepared snapshot/);
    vi.stubEnv("BYLINE_LEGACY_REST_BUILD", "1"); expect(assertPreparedBuildMode).not.toThrow();
  } finally { vi.unstubAllEnvs(); }
});
it("records a forbidden renderer request even when the caller swallows its failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "byline-network-"));
  await mkdir(path.join(directory, ".byline-build"));
  const guard = fileURLToPath(new URL("../scripts/assert-snapshot-network.mjs", import.meta.url));
  try {
    const child = spawnSync(process.execPath, ["--import", guard, "--input-type=module", "-e", 'try { await fetch("https://cms.example.test/wp-json/wp/v2/posts?page=2"); } catch {}'], { cwd: directory, encoding: "utf8" });
    expect(child.status).toBe(0);
    expect(await readFile(path.join(directory, ".byline-build/forbidden-cms-requests.ndjson"), "utf8")).toContain("posts?page=2");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
