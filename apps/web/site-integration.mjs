// Phase 0 spike: connects the selected site (`@byline/site`) to the public app.
import { cp, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = path.dirname(fileURLToPath(import.meta.url));

/** Engine routes a site may turn off. Everything else stays a file route in src/pages. */
const ENGINE_ROUTES = { about: { pattern: "/about/", entry: "./src/engine-routes/about.astro" } };

/** Paths a site's assets may never occupy. */
const RESERVED = [/^_byline(\/|$)/, /^_astro(\/|$)/, /^_headers$/, /^_redirects$/, /^robots\.txt$/, /^404\.html$/, /^feed\.xml$/, /sitemap.*\.xml$/, /^index\.html$/];

export function siteRoot() {
  return path.dirname(require.resolve("@byline/site/package.json", { paths: [appRoot] }));
}

async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await files(path.join(directory, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

export function bylineSite({ config, assertSiteCompatible }) {
  const root = siteRoot();
  return {
    name: "byline-site",
    hooks: {
      "astro:config:setup": ({ injectRoute, logger }) => {
        assertSiteCompatible(config);
        for (const [name, route] of Object.entries(ENGINE_ROUTES)) {
          if (config.routes[name] === false) continue;
          injectRoute({ pattern: route.pattern, entrypoint: path.resolve(appRoot, route.entry) });
        }
        for (const page of config.pages) injectRoute({ pattern: page.pattern, entrypoint: path.resolve(root, page.entry) });
        logger.info(`site ${config.id}: ${config.pages.length} pages, routes off: ${Object.keys(config.routes).join(", ") || "none"}`);
      },
      "astro:build:done": async ({ dir, logger }) => {
        if (!config.assets) return;
        const source = path.resolve(root, config.assets);
        const out = fileURLToPath(dir);
        const assets = await files(source);
        for (const file of assets) {
          if (RESERVED.some((pattern) => pattern.test(file))) throw new Error(`Site asset "${file}" uses a path Byline reserves.`);
          if (await stat(path.join(out, file)).then(() => true, () => false)) throw new Error(`Site asset "${file}" collides with a file the build already wrote.`);
        }
        for (const file of assets) await cp(path.join(source, file), path.join(out, file));
        logger.info(`copied ${assets.length} site assets`);
      }
    }
  };
}
