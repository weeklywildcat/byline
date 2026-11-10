import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataEmbedSnapshot } from "../tests/fixtures/data-embed";

/**
 * Regenerates the offline Snapshot v3 for the Story-embed browser fixture:
 *
 *   node --import tsx apps/web/scripts/generate-data-embed-fixture.mts
 *
 * Build with it (the Data section and releases are the committed Data fixture):
 *
 *   BYLINE_CONTENT_MODE=weekly-wildcat-fixture \
 *   BYLINE_BUILD_SNAPSHOT_FILE=tests/fixtures/data-embed/snapshot.json \
 *   BYLINE_BUILD_DATA_DIR=tests/fixtures/data/releases npm run build:frontend
 */
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/data-embed");
mkdirSync(directory, { recursive: true });
writeFileSync(path.join(directory, "snapshot.json"), `${JSON.stringify(dataEmbedSnapshot({ plainStory: true }), null, 2)}\n`);
console.log("Wrote tests/fixtures/data-embed/snapshot.json");
