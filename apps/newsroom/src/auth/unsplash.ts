export type LoginPhoto = { image: string; name: string; photographer: string; photo: string };

const retry = 15 * 60_000;
const ttl = 12 * 60 * 60_000;
let pool: LoginPhoto[] = [];
let refreshAt = 0;
let pending: Promise<void> | undefined;

function trustedUrl(value: unknown, hostname: string) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.origin === `https://${hostname}` && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function referral(url: URL) {
  url.search = "";
  url.hash = "";
  url.searchParams.set("utm_source", "weekly_wildcat_cms");
  url.searchParams.set("utm_medium", "referral");
  return url.href;
}

function parsePhoto(value: unknown, key: string): LoginPhoto | null {
  if (!value || typeof value !== "object") return null;
  const photo = value as {
    width?: number; height?: number; urls?: { regular?: unknown };
    user?: { name?: unknown; links?: { html?: unknown } }; links?: { html?: unknown };
  };
  if (!Number.isFinite(photo.width) || !Number.isFinite(photo.height) ||
      photo.width! <= photo.height! || photo.height! <= 0) return null;
  const image = trustedUrl(photo.urls?.regular, "images.unsplash.com");
  const name = photo.user?.name;
  const photographer = trustedUrl(photo.user?.links?.html, "unsplash.com");
  const credit = trustedUrl(photo.links?.html, "unsplash.com");
  if (!image || !photographer || !credit || !photographer.pathname.startsWith("/@") ||
      !credit.pathname.startsWith("/photos/") || typeof name !== "string" || !name.trim() || name.length > 160) return null;
  const result = { image: image.href, name: name.trim(), photographer: referral(photographer), photo: referral(credit) };
  return Object.values(result).some(part => part.includes(key) || part.includes(encodeURIComponent(key))) ? null : result;
}

/** This returns immediately from the pool; Next schedules refresh after the response. */
export function loginPhoto(schedule: (refresh: () => Promise<void>) => void): LoginPhoto | undefined {
  const key = process.env.BYLINE_UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return;
  if (Date.now() >= refreshAt && !pending) {
    // Reserve the refresh before scheduling so simultaneous renders share it.
    refreshAt = Date.now() + retry;
    schedule(async () => {
      pending = refreshPool(key);
      try { await pending; } finally { pending = undefined; }
    });
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

async function refreshPool(key: string) {
  try {
    const response = await fetch("https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high&count=12", {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error();
    const data: unknown = await response.json();
    pool = Array.isArray(data)
      ? data.slice(0, 12).map(value => parsePhoto(value, key)).filter(photo => photo !== null)
      : [];
    refreshAt = Date.now() + (pool.length ? ttl : retry);
  } catch {
    pool = [];
    refreshAt = Date.now() + retry;
  }
}
