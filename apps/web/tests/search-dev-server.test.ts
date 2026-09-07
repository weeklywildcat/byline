import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseSearchIndexDocument } from "@/lib/search-index";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let devServer: ChildProcess | undefined;

async function getAvailablePort() {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine a free port for the Astro dev server.");
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForDevServer(url: string) {
  const deadline = Date.now() + 30_000;
  let lastError = "unknown error";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.status === 200) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Astro dev server did not become ready: ${lastError}`);
}

function stopDevServer() {
  if (!devServer || devServer.exitCode !== null) {
    devServer = undefined;
    return;
  }

  if (devServer.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      devServer.kill("SIGTERM");
    }
  }
  devServer = undefined;
}

afterEach(() => {
  stopDevServer();
});

describe("Astro dev search index endpoint", () => {
  it("serves the deterministic search document without a production build", async () => {
    const port = await getAvailablePort();
    const devEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST"))
    );
    devServer = spawn(
      process.execPath,
      ["scripts/astro-with-publication.mjs", "dev", "--host", "127.0.0.1", "--port", String(port)],
      {
        cwd: webRoot,
        env: {
          ...devEnvironment,
          BYLINE_PUBLICATION_FILE: "tests/fixtures/weekly-wildcat-publication.json",
          BYLINE_CONTENT_MODE: "weekly-wildcat-fixture",
          HOST: "127.0.0.1",
          PORT: String(port),
          NODE_ENV: "development",
          ASTRO_DEV_BACKGROUND: "foreground"
        },
        detached: true,
        stdio: "ignore"
      }
    );

    const response = await waitForDevServer(`http://127.0.0.1:${port}/_byline/search-index.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");

    const document = parseSearchIndexDocument(await response.json());
    expect(document.schemaVersion).toBe(1);
    expect(document.items.length).toBeGreaterThan(0);
  }, 40_000);
});
