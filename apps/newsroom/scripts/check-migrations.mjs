// Fails when the Payload config has schema changes that no committed migration
// covers. Run against an EMPTY database: it applies every committed migration,
// then asks Payload for a new one and fails if Payload had anything to write.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";

const dir = new URL("../src/migrations/", import.meta.url);
const before = new Set(readdirSync(dir));
const env = { ...process.env, BYLINE_DB_PUSH: "0" };

function payload(args) {
  const result = spawnSync("npx", ["payload", ...args], { stdio: "inherit", env, cwd: new URL("..", import.meta.url) });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

payload(["migrate"]);
payload(["migrate:create", "uncommitted-schema-change", "--skip-empty"]);
const added = readdirSync(dir).filter((name) => !before.has(name));
if (added.length > 0) {
  console.error("The Payload schema changed without a migration. Generated drift:");
  for (const name of added) {
    const file = new URL(name, dir);
    if (name.endsWith(".ts")) console.error(`\n--- ${name} ---\n${readFileSync(file, "utf8")}`);
    rmSync(file);
  }
  console.error("Run `npm run migrate:create --workspace @byline/newsroom -- <name>` and commit the generated migration.");
  process.exit(1);
}
console.log("Committed migrations match the Payload config.");
