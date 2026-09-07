import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(process.env.BYLINE_STATIC_ROOT || path.join(projectRoot, "out"));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"]
]);

async function fileStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function safePathname(pathname) {
  let decoded;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, "");
  if (relative.split("/").includes("..")) {
    return null;
  }

  const filePath = path.resolve(outputRoot, relative);
  const rootPrefix = outputRoot.endsWith(path.sep) ? outputRoot : outputRoot + path.sep;

  return filePath === outputRoot || filePath.startsWith(rootPrefix) ? filePath : null;
}

async function resolveRequest(pathname) {
  const filePath = safePathname(pathname);

  if (!filePath) {
    return { status: 400, filePath: null };
  }

  const candidate = await fileStat(filePath);

  if (candidate?.isDirectory()) {
    const indexPath = path.join(filePath, "index.html");
    if (await fileStat(indexPath)) {
      return pathname.endsWith("/")
        ? { status: 200, filePath: indexPath }
        : { status: 308, location: pathname + "/", filePath: null };
    }
  }

  if (candidate?.isFile()) {
    return { status: 200, filePath };
  }

  const notFoundPath = path.join(outputRoot, "404.html");
  return { status: 404, filePath: (await fileStat(notFoundPath))?.isFile() ? notFoundPath : null };
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://" + (request.headers.host || host + ":" + port));
  const resolved = await resolveRequest(requestUrl.pathname);

  if (resolved.status === 308) {
    response.writeHead(308, { Location: resolved.location + requestUrl.search });
    response.end();
    return;
  }

  if (!resolved.filePath) {
    response.writeHead(resolved.status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(resolved.status === 400 ? "Bad request" : "Not found");
    return;
  }

  response.writeHead(resolved.status, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes.get(path.extname(resolved.filePath).toLowerCase()) || "application/octet-stream"
  });
  createReadStream(resolved.filePath).pipe(response);
});

await mkdir(outputRoot, { recursive: true });
server.listen(port, host, () => {
  console.log("Serving " + outputRoot + " at http://" + host + ":" + port);
});
