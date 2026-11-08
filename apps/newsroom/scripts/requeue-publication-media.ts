/**
 * Queues `prepare-publication-media` for every Media asset whose prepared
 * generation is not current: never prepared (including everything the
 * Phase 5 migration invalidated), failed, damaged, or made by an older recipe
 * after `PUBLICATION_MEDIA_RECIPE_VERSION` was bumped. Assets already
 * preparing are left alone (their job is queued); `--include-preparing` queues
 * them again (a stuck worker), which supersedes any pending job.
 *
 *   npm run publication-media:requeue --workspace @byline/newsroom [-- --dry-run] [-- --include-preparing]
 *
 * Runs as the system; the media worker (`npm run jobs:media`) does the work.
 */
import { publicationMediaReadiness } from "@byline/content";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { queueOrRecordFailure } from "../src/publication-media/queue";
import { markPreparationQueued } from "../src/publication-media/state";

const dryRun = process.argv.includes("--dry-run");
const includePreparing = process.argv.includes("--include-preparing");
const payload = await getPayload({ config });
let page = 1;
let queued = 0;
let seen = 0;
for (;;) {
  const found = await payload.find({ collection: "media", depth: 0, page, limit: 200, sort: "id", overrideAccess: true, select: { publicationRevision: true, publicationAssets: true, filename: true } });
  for (const media of found.docs) {
    seen++;
    const revision = typeof media.publicationRevision === "number" ? media.publicationRevision : null;
    if (revision === null) continue;
    const readiness = publicationMediaReadiness(media.publicationAssets, revision);
    if (readiness.ready || (readiness.reason === "preparing" && !includePreparing)) continue;
    console.log(`${dryRun ? "Would queue" : "Queuing"} Media ${media.id} (${media.filename ?? "no file"}): ${readiness.reason}`);
    if (!dryRun) {
      await markPreparationQueued(payload, media.id, revision);
      if (await queueOrRecordFailure(payload, { mediaId: media.id, revision })) queued++;
    }
  }
  if (!found.hasNextPage) break;
  page++;
}
console.log(`${seen} Media checked; ${dryRun ? "dry run, nothing queued" : `${queued} queued`}.`);
process.exit(0);
