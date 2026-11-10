import { Resolver } from "node:dns/promises";
import { request as http } from "node:http";
import { request as https } from "node:https";
import { mediaCredit } from "@byline/article-body";
import { normalizePublicRoute, stableDigest, type PublicBuildSnapshot, type PublicStorySnapshot } from "@byline/content";
import type { ContentHealthIssue } from "@byline/newsroom-screens/planning/planning-model";

const definitions = {
  "broken-link": { title: "Broken link", category: "links", severity: "error", explanation: "The destination no longer exists.", why: "Readers can't follow the reporting.", action: "Update or remove the link." },
  "image-alt": { title: "Missing alternative text", category: "images-accessibility", severity: "warning", explanation: "An image has no alternative text.", why: "Readers using assistive technology miss this information.", action: "Add useful alternative text in Media." },
  "image-credit": { title: "Missing image credit", category: "images-accessibility", severity: "warning", explanation: "An image has no credit.", why: "Readers should know the source of the image.", action: "Add the creator or credit in Media." }
} as const;
export const healthDefinitions = definitions;
export type CheckId = keyof typeof definitions;
export type Finding = Pick<ContentHealthIssue, "id" | "type" | "severity" | "problem" | "category" | "data" | "state"> & { checkId: CheckId; mediaId?: number };

const LINK_LIMIT = 15;
const BYTE_BUDGET = 100_000;
function links(body: PublicStorySnapshot["body"], base: string): URL[] {
  const results = new Map<string, URL>();
  function add(value: unknown) {
    if (typeof value !== "string" || value.length > 2000 || value.startsWith("#")) return;
    try {
      const url = new URL(value.replace(/&amp;/g, "&"), base);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return;
      url.hash = "";
      results.set(url.href, url);
    } catch { /* An invalid link is not a network destination. */ }
  }
  if (body.format === "legacy-html") {
    for (const match of body.html.slice(0, BYTE_BUDGET).matchAll(/<a\s[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) {
      add(match[1]); if (results.size >= LINK_LIMIT) break;
    }
  } else {
    let remaining = 3000;
    const visit = (value: unknown, depth: number) => {
      if (--remaining <= 0 || depth > 25 || results.size >= LINK_LIMIT || !value || typeof value !== "object") return;
      if (Array.isArray(value)) for (const item of value) { if (remaining <= 0) break; visit(item, depth + 1); }
      else {
        if ("href" in value) add(value.href);
        for (const item of Object.values(value)) visit(item, depth + 1);
      }
    };
    visit(body.nodes, 0);
  }
  return [...results.values()].slice(0, LINK_LIMIT);
}

/** IPv4 only. The resolved address is pinned to the socket; redirects are not followed. */
export function publicIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) || octets.some((n) => n > 255)) return false;
  const [a, b, c] = octets;
  return a > 0 && a < 224 && a !== 10 && a !== 127
    && !(a === 100 && b >= 64 && b <= 127)
    && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31)
    && !(a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    && !(a === 203 && b === 0 && c === 113);
}

async function externallyBroken(url: URL): Promise<boolean> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || url.hostname.endsWith(".local")) return false;
  try {
    const resolver = new Resolver({ timeout: 700, tries: 1 });
    const addresses = publicIPv4(url.hostname) ? [url.hostname] : await resolver.resolve4(url.hostname);
    if (!addresses.length || !addresses.every(publicIPv4)) return false;
    const address = addresses[0];
    return await new Promise<boolean>((resolve) => {
      const request = url.protocol === "https:" ? https : http;
      const outgoing = request(url, {
        method: "HEAD", agent: false, family: 4, maxHeaderSize: 8192, signal: AbortSignal.timeout(1000),
        lookup: (_hostname, _options, callback) => callback(null, address, 4)
      }, (response) => { resolve(response.statusCode === 404 || response.statusCode === 410); response.destroy(); });
      outgoing.on("error", () => resolve(false));
      outgoing.end();
    });
  } catch {
    return false; // An unreachable host or transient DNS failure is not proof of a broken link.
  }
}

export async function scanPublishedStory(snapshot: PublicBuildSnapshot, story: PublicStorySnapshot, checkLink = externallyBroken): Promise<Finding[]> {
  const issues: Finding[] = [];
  const add = (checkId: CheckId, identity: string, problem: string, detail: Partial<Finding> = {}) => {
    const definition = definitions[checkId];
    issues.push({ id: `${story.id}:${checkId}:${stableDigest(identity).slice(0, 16)}`, type: checkId, checkId, category: definition.category, severity: definition.severity, problem, ...detail });
  };
  const ids = new Set<number>(story.image === null ? [] : [story.image]);
  if (story.body.format !== "legacy-html") for (const item of Object.values(story.body.media)) ids.add(Number(item.id));
  for (const media of snapshot.datasets.media.filter((item) => item.kind === "image" && ids.has(item.id))) {
    if (!media.alt.trim()) add("image-alt", String(media.id), `${media.filename} has no alternative text.`, { mediaId: media.id });
    if (!mediaCredit(media)) add("image-credit", String(media.id), `${media.filename} has no credit.`, { mediaId: media.id });
  }
  const own = new URL(snapshot.publication.urls.publicSite).origin;
  const publicRoutes = new Set([...snapshot.datasets.stories.map((row) => row.href), ...snapshot.datasets.redirects.map((row) => row.from)]);
  const targets = links(story.body, story.url);
  for (let index = 0; index < targets.length; index += 5) {
    const found = await Promise.all(targets.slice(index, index + 5).map(async (url) => ({
      url, broken: url.origin === own
        ? /^\/\d{4}\/\d{2}\/\d{2}\//.test(url.pathname) && !publicRoutes.has(normalizePublicRoute(url.pathname))
        : await checkLink(url)
    })));
    for (const { url, broken } of found) if (broken) add("broken-link", url.href, "A link in the story no longer works.", { data: { url: url.href } });
  }
  return issues;
}
