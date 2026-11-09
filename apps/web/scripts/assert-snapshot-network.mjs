import { appendFileSync } from "node:fs";
import path from "node:path";
// Public rendering must read the verified local snapshot, never the newsroom.
const originalFetch = globalThis.fetch;
const newsroomOrigins = [process.env.BYLINE_NEWSROOM_BUILD_URL, process.env.BYLINE_NEWSROOM_BUILD_MEDIA_URL]
  .flatMap((value) => {
    try {
      return value ? [new URL(value).origin] : [];
    } catch {
      return [];
    }
  });
function forbidden(url) {
  if (/\/api\/byline(?:\/|\?|$)/i.test(url)) return true;
  try {
    return newsroomOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
globalThis.fetch = (...args) => {
  const url = String(args[0] instanceof Request ? args[0].url : args[0]);
  if (forbidden(url)) {
    // Build credentials only ever travel in the Authorization header, never in a URL.
    appendFileSync(path.join(process.cwd(), ".byline-build/forbidden-cms-requests.ndjson"), JSON.stringify({ url }) + "\n");
    throw new Error(`Snapshot-backed build attempted a forbidden CMS request: ${url}`);
  }
  return originalFetch(...args);
};
