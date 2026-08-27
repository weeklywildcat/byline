#!/usr/bin/env node
/**
 * One-time export of poll data from the retired Cloudflare D1 database.
 *
 * Deployment-only tooling: it lives in the repository rather than in the
 * WordPress plugin so no Cloudflare credential or API dependency ever ships to
 * a WordPress install. It shells out to the operator's already-authenticated
 * `wrangler`, writes a plain JSON artifact, and touches nothing else.
 *
 * Usage:
 *   node scripts/export-d1-polls.mjs --database weekly-wildcat-polls --remote \
 *     --out polls-export.json
 *
 * Then, on the WordPress host:
 *   wp byline polls import polls-export.json
 *   wp byline polls verify polls-export.json
 */

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const ARTIFACT_SCHEMA_VERSION = 1;

const TABLES = {
  polls: "SELECT id, question, status, opens_at, closes_at, created_at FROM polls ORDER BY created_at ASC, id ASC",
  options: "SELECT id, poll_id, label, position FROM poll_options ORDER BY poll_id ASC, position ASC, id ASC",
  votes: "SELECT id, poll_id, option_id, voter_key, created_at FROM poll_votes ORDER BY created_at ASC, id ASC"
};

function parseArguments(argv) {
  const options = { database: "", out: "polls-export.json", location: "--remote", wrangler: "npx" };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--database" || argument === "-d") options.database = argv[++index] ?? "";
    else if (argument === "--out" || argument === "-o") options.out = argv[++index] ?? options.out;
    else if (argument === "--local") options.location = "--local";
    else if (argument === "--remote") options.location = "--remote";
    else if (argument === "--wrangler") options.wrangler = argv[++index] ?? options.wrangler;
    else throw new Error(`Unknown argument ${argument}`);
  }

  if (!options.database) {
    throw new Error("--database <name-or-uuid> is required. It is not read from wrangler.jsonc, which no longer binds D1.");
  }

  return options;
}

/**
 * wrangler prints human-readable lines around its JSON payload, so take the
 * first balanced JSON value rather than assuming the whole of stdout parses.
 */
function extractJson(stdout) {
  const start = stdout.search(/[[{]/);

  if (start < 0) throw new Error("wrangler produced no JSON output.");

  for (let end = stdout.length; end > start; end -= 1) {
    try {
      return JSON.parse(stdout.slice(start, end));
    } catch {
      // Keep trimming trailing noise.
    }
  }

  throw new Error("Could not parse wrangler JSON output.");
}

function query(options, sql) {
  const args =
    options.wrangler === "npx"
      ? ["wrangler", "d1", "execute", options.database, options.location, "--json", "--command", sql]
      : ["d1", "execute", options.database, options.location, "--json", "--command", sql];
  const command = options.wrangler === "npx" ? "npx" : options.wrangler;
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`wrangler failed (${result.status}): ${result.stderr || result.stdout}`);

  const payload = extractJson(result.stdout);
  const rows = Array.isArray(payload) ? payload[0]?.results : payload?.results;

  if (!Array.isArray(rows)) throw new Error("wrangler returned no result rows.");

  return rows;
}

const options = parseArguments(process.argv.slice(2));
const artifact = {
  schemaVersion: ARTIFACT_SCHEMA_VERSION,
  source: `cloudflare-d1:${options.database}`,
  exportedAt: new Date().toISOString(),
  polls: [],
  options: [],
  votes: []
};

for (const [relation, sql] of Object.entries(TABLES)) {
  artifact[relation] = query(options, sql);
  console.log(`Exported ${artifact[relation].length} ${relation} rows.`);
}

const votesByPoll = artifact.votes.reduce((totals, vote) => {
  totals[vote.poll_id] = (totals[vote.poll_id] ?? 0) + 1;
  return totals;
}, {});

await writeFile(options.out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(`\nWrote ${options.out}`);
console.log(`polls    ${artifact.polls.length}`);
console.log(`options  ${artifact.options.length}`);
console.log(`votes    ${artifact.votes.length}`);
for (const [pollId, total] of Object.entries(votesByPoll)) {
  console.log(`  poll ${pollId}: ${total}`);
}
console.log("\nImport it with: wp byline polls import <file>, then verify with: wp byline polls verify <file>");
