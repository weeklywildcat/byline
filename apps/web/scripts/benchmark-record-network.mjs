// Optional preload for a baseline public build. Writes no auth headers/secrets.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const directory = process.env.BYLINE_BENCHMARK_RECORD_DIRECTORY;
const original = globalThis.fetch;
if (directory) globalThis.fetch = async (...args) => {
  const url = new URL(String(args[0] instanceof Request ? args[0].url : args[0]));
  const cms = url.pathname.includes("/wp-json/");
  if (cms) {
    const headers = new Headers(args[1]?.headers || (args[0] instanceof Request ? args[0].headers : undefined));
    if (headers.has("authorization") || headers.has("cookie") || /\/admin(?:\/|$)|\/users\/me/.test(url.pathname) || url.searchParams.get("context") === "edit") throw new Error("Benchmark recorder only accepts anonymous public build requests");
  }
  const startedAt = Date.now();
  const response = await original(...args);
  if (cms) {
    const body = await response.clone().text();
    const name = `${createHash("sha256").update(url.href).digest("hex")}.json`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, name), body);
    appendFileSync(path.join(directory, "requests.ndjson"), JSON.stringify({ url: url.href, name, status: response.status, startedAt, completedAt: Date.now(), totalPages: Number(response.headers.get("x-wp-totalpages") || 1), bytes: Buffer.byteLength(body) }) + "\n");
  }
  return response;
};
