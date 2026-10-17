import { appendFileSync } from "node:fs";
import path from "node:path";
// Installed in the renderer process only. The parent acquired and verified the
// pointer + artifact. Any hidden CMS REST dependency is a build failure.
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => {
  const url = String(args[0] instanceof Request ? args[0].url : args[0]);
  if (/\/wp-json(?:\/|\?|$)/i.test(url)) {
    appendFileSync(path.join(process.cwd(), ".byline-build/forbidden-cms-requests.ndjson"), JSON.stringify({ url }) + "\n");
    throw new Error(`Snapshot-backed build attempted a forbidden CMS REST request: ${url}`);
  }
  return originalFetch(...args);
};
