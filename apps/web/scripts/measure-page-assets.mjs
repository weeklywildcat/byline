import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve(process.argv[2]);
const destination = path.resolve(process.argv[3]);
const routes = process.argv.slice(4);
const outputFile = (route) => route === "/" ? path.join(outputRoot, "index.html") : route === "/404.html" ? path.join(outputRoot, "404.html") : path.join(outputRoot, route.replace(/^\//, ""), "index.html");
const results = {};
for (const route of routes) {
  const file = outputFile(route);
  const source = await readFile(file, "utf8");
  const assets = [...source.matchAll(/(?:src|href|component-url|renderer-url)=(["'])(\/[^"'#?]+)\1/gi)].map((match) => match[2]);
  const local = [...new Set(assets)].map((asset) => path.join(outputRoot, decodeURIComponent(asset).replace(/^\//, "")));
  const sizes = await Promise.all(local.map(async (asset) => ({ asset, bytes: (await stat(asset)).size })));
  results[route] = {
    htmlBytes: Buffer.byteLength(source),
    jsBytes: sizes.filter(({ asset }) => asset.endsWith(".js")).reduce((sum, item) => sum + item.bytes, 0),
    cssBytes: sizes.filter(({ asset }) => asset.endsWith(".css")).reduce((sum, item) => sum + item.bytes, 0),
    inlineScriptBytes: [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].reduce((sum, match) => sum + Buffer.byteLength(match[1]), 0)
  };
}
await writeFile(destination, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
