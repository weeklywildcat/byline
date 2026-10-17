// Serve a recorded public REST response set and the exact closed media set from
// a verified export. Usage: node ... /recorded-responses /verified-out [port]
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
const [responsesDirectory, outputDirectory, port = "8894"] = process.argv.slice(2);
if (!responsesDirectory || !outputDirectory) throw new Error("Expected public response directory and verified export directory");
const recorded = (await readFile(path.resolve(responsesDirectory, "requests.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
const responseMap = new Map();
for (const row of recorded) {
  const url = new URL(row.url); const key = `${url.pathname}:${url.searchParams.get("page") || "1"}`;
  responseMap.set(key, { status: row.status, totalPages: row.totalPages || 1, body: await readFile(path.resolve(responsesDirectory, path.basename(row.name))) });
}
const manifest = JSON.parse(await readFile(path.resolve(outputDirectory, "_byline/media-manifest.json"), "utf8"));
const media = new Map(Object.values(manifest.items).map((entry) => [new URL(entry.sourceUrl).pathname, entry]));
const server = createServer((request, response) => {
  const input = new URL(request.url, "http://localhost").searchParams.get("url");
  if (!input) { response.statusCode = 400; response.end(); return; }
  const url = new URL(input);
  if (url.pathname.includes("/wp-json/")) {
    const entry = responseMap.get(`${url.pathname}:${url.searchParams.get("page") || "1"}`);
    response.statusCode = entry?.status ?? 500;
    response.setHeader("Content-Type", "application/json"); response.setHeader("X-WP-TotalPages", String(entry?.totalPages || 1)); response.end(entry?.body ?? "Unrecorded CMS request"); return;
  }
  const entry = media.get(url.pathname);
  if (!entry || entry.status !== "materialized") { response.statusCode = 404; response.end("Recorded missing media"); return; }
  const file = path.resolve(outputDirectory, entry.localPath.replace(/^\//, ""));
  const mime = { ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml" };
  response.setHeader("Content-Type", mime[path.extname(file).toLowerCase()] || "image/jpeg");
  createReadStream(file).pipe(response);
});
server.listen(Number(port), "127.0.0.1", () => console.log(`Public benchmark replay listening on http://127.0.0.1:${port}`));
