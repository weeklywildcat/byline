// Benchmark-only transport: preserve canonical input URLs and media bytes while
// routing requests to a local fixture server. Never loaded by production code.
import { appendFileSync } from "node:fs";
const origin = process.env.BYLINE_BENCHMARK_REPLAY_ORIGIN;
if (origin && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Benchmark replay requires a loopback server");
const original = globalThis.fetch;
if (origin) globalThis.fetch = async (...args) => {
  const input = String(args[0] instanceof Request ? args[0].url : args[0]);
  const url = new URL(input);
  if (["127.0.0.1", "localhost"].includes(url.hostname) || !/\/wp-json\/|\/wp-content\/uploads\//.test(url.pathname)) return original(...args);
  const startedAt = Date.now();
  const response = await original(`${origin}/replay?url=${encodeURIComponent(input)}`, args[1]);
  const bytes = await response.arrayBuffer();
  if (process.env.BYLINE_BENCHMARK_TRACE_FILE) appendFileSync(process.env.BYLINE_BENCHMARK_TRACE_FILE, JSON.stringify({ url: input, phase: url.pathname.includes("/wp-json/") ? "cms" : "media", startedAt, completedAt: Date.now(), bytes: bytes.byteLength, status: response.status }) + "\n");
  return new Response(bytes, { status: response.status, headers: response.headers });
};
