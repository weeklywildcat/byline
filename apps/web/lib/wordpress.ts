import { mirrorWordPressMediaInValue } from "@/lib/media";
import { getBylineRestUrl, getNamespaceApiUrl, getWordPressApiUrl } from "@/lib/byline-rest";
import { stripHtml } from "@/lib/format";
import { getPublicationConfig } from "@/lib/publication";
import northStarContent from "@/tests/fixtures/north-star-content.json";
import weeklyWildcatContent from "@/tests/fixtures/weekly-wildcat-content.json";

const DEFAULT_SITE_URL = "https://weeklywildcat.com";
const WORDPRESS_FETCH_CACHE_KEY =
  process.env.WORDPRESS_FETCH_CACHE_KEY ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.NETLIFY_COMMIT_REF ||
  (process.env.NODE_ENV === "production" ? `local-build-${Date.now()}` : "") ||
  "";
const WORDPRESS_FETCH_USER_AGENT = "Byline Static Site Builder";
const WORDPRESS_PAGE_CONCURRENCY = Math.min(
  16,
  Math.max(1, Number.parseInt(process.env.BYLINE_WORDPRESS_FETCH_CONCURRENCY || "4", 10) || 4)
);
const BYLINE_API_NAMESPACE = "byline/v1";
const LEGACY_API_NAMESPACE = "weekly-wildcat/v1";

type QueryValue = string | number | boolean | undefined | null;

function fixtureData<T>(path: string, query: Record<string, QueryValue>): T {
  const fixture = process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture"
    ? weeklyWildcatContent
    : northStarContent;
  const fixtureRecord = fixture as unknown as Record<string, unknown>;
  if (path === "/posts") {
    let posts = [...fixture.posts];
    if (query.slug) posts = posts.filter((post) => post.slug === String(query.slug));
    if (query.author) posts = posts.filter((post) => post.author === Number(query.author));
    if (query.categories) posts = posts.filter((post) => post.categories.includes(Number(query.categories)));
    return posts as T;
  }
  if (path === "/pages") {
    const pages = query.slug ? fixture.pages.filter((page) => page.slug === String(query.slug)) : fixture.pages;
    return pages as T;
  }
  if (path === "/users") return fixture.authors as T;
  if (path.startsWith("/users/")) return (fixture.authors.find((author) => author.id === Number(path.slice(7))) ?? null) as T;
  if (path === "/categories") {
    const categories = query.slug ? fixture.categories.filter((category) => category.slug === String(query.slug)) : fixture.categories;
    return categories as T;
  }
  if (path === "/tags") return fixture.tags as T;
  if (path === "/coverage" || path === "/coverages") return (fixtureRecord.coverage ?? fixtureRecord.coverages ?? []) as T;
  if (path === "/corrections") return (fixtureRecord.corrections ?? []) as T;
  if (path === "/contributors" || path === "/guests") return (fixtureRecord.guests ?? []) as T;
  return [] as T;
}

export type RenderedText = {
  rendered: string;
  protected?: boolean;
};

export type WordPressAuthor = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  url?: string;
  link?: string;
  avatar_urls?: Record<string, string>;
  bylineProfile?: WordPressAuthorProfile;
  weeklyWildcatProfile?: WordPressAuthorProfile;
};

export type WordPressGuestContributor = {
  type: "guest";
  id: number | string;
  name: string;
  slug: string;
  description?: string;
  role?: string;
  profilePhoto?: {
    id?: number;
    url: string;
    alt?: string;
    width?: number | null;
    height?: number | null;
  };
  socials?: Record<string, string>;
};

export type WordPressContributor = WordPressAuthor | WordPressGuestContributor;

export type WordPressAuthorProfile = {
  pronouns: string;
  role: string;
  founder: boolean;
  showInDirectory?: boolean;
  profilePhoto?: {
    id: number;
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
  };
  socials: {
    website: string;
    email: string;
    instagram: string;
    tiktok: string;
    linkedin: string;
    x: string;
  };
};

export type WordPressCategory = {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: "category";
  parent: number;
};

export type WordPressTag = {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: "post_tag";
};

export type WordPressPage = {
  id: number;
  slug: string;
  date: string;
  date_gmt?: string;
  modified: string;
  modified_gmt?: string;
  title: RenderedText;
  excerpt: RenderedText;
  content: RenderedText;
  bylinePage?: {
    eyebrow?: string;
  };
};

export type WordPressMediaSize = {
  file: string;
  width: number;
  height: number;
  mime_type?: string;
  source_url: string;
};

export type WordPressMedia = {
  id: number;
  date: string;
  slug: string;
  type: "attachment";
  link: string;
  title: RenderedText;
  author: number;
  caption: RenderedText;
  alt_text: string;
  media_type: string;
  mime_type: string;
  media_details?: {
    width?: number;
    height?: number;
    sizes?: Record<string, WordPressMediaSize>;
    image_meta?: {
      caption?: string;
      copyright?: string;
      credit?: string;
    };
  };
  bylineImage?: WordPressImageCredit;
  weeklyWildcatImage?: WordPressImageCredit;
  source_url: string;
};

export type WordPressImageCredit = {
    creator: string;
    creditText: string;
    copyrightNotice: string;
    licenseUrl: string;
    acquireLicensePage: string;
};

export type WordPressPost = {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: "post";
  link: string;
  title: RenderedText;
  content: RenderedText;
  excerpt: RenderedText;
  author: number;
  featured_media: number;
  categories: number[];
  tags: number[];
  sticky: boolean;
  byline?: WordPressPostSettings;
  weeklyWildcat?: WordPressPostSettings;
  contributors?: unknown;
  bylines?: unknown;
  corrections?: unknown;
  _embedded?: {
    author?: WordPressAuthor[];
    "wp:featuredmedia"?: WordPressMedia[];
    "wp:term"?: Array<Array<WordPressCategory | WordPressTag | { taxonomy: string }>>;
  };
};

export type WordPressPostSettings = {
  primaryGameId?: number;
  gameScoreGameIds?: number[];
  contributors?: unknown;
  authors?: unknown;
  corrections?: unknown;
};

export type WordPressCorrectionType = "correction" | "clarification" | "editor-note" | "substantive-update";

export type WordPressCorrection = {
  id: string;
  type: WordPressCorrectionType;
  date: string;
  text: string;
  postId?: number;
  legacy?: boolean;
};

export type WordPressCoverageArtwork = {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
};

export type WordPressCoverage = {
  id: number | string;
  slug: string;
  title: string;
  description: string;
  overview: string;
  artwork: WordPressCoverageArtwork | null;
  startDate?: string;
  endDate?: string;
  modified?: string;
  stories: WordPressPost[];
};

export type PostRouteParts = {
  year: string;
  month: string;
  day: string;
  category: string;
  slug: string;
};

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || getPublicationConfig().urls.publicSite || DEFAULT_SITE_URL).replace(/\/$/, "");
}

function getHeadlessApiUrl() {
  return getWordPressApiUrl().replace(/\/wp\/v2$/, "/weekly-wildcat/v1");
}

export { getBylineRestUrl, getWordPressApiUrl } from "@/lib/byline-rest";

class PublicWordPressFetchError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string, url: URL) {
    super(`Public WordPress request failed: ${status} ${statusText} (${url})`);
    this.name = "PublicWordPressFetchError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown) {
  if (typeof value === "string") {
    return stripHtml(value).trim();
  }

  if (isRecord(value) && typeof value.rendered === "string") {
    return stripHtml(value.rendered).trim();
  }

  return "";
}

function renderedValue(value: unknown): RenderedText {
  if (typeof value === "string") {
    return { rendered: value };
  }

  if (isRecord(value) && typeof value.rendered === "string") {
    return { rendered: value.rendered };
  }

  return { rendered: "" };
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function publicUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function publicPhoto(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const url = publicUrl(value.url ?? value.source_url);

  if (!url) {
    return undefined;
  }

  return {
    ...(positiveInteger(value.id) ? { id: positiveInteger(value.id)! } : {}),
    url,
    alt: textValue(value.alt ?? value.alt_text),
    width: typeof value.width === "number" ? value.width : null,
    height: typeof value.height === "number" ? value.height : null
  };
}

function publicSocialLinks(value: unknown) {
  const entries = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const label = typeof entry.label === "string"
          ? entry.label.trim().toLowerCase()
          : typeof entry.service === "string"
            ? entry.service.trim().toLowerCase()
            : "";
        const href = publicUrl(entry.url ?? entry.href);
        return label && href ? [[label, href] as const] : [];
      })
    : isRecord(value)
      ? Object.entries(value).flatMap(([key, href]) => {
          const publicHref = publicUrl(href);
          return publicHref ? [[key, publicHref] as const] : [];
        })
      : [];

  if (entries.length === 0) {
    return undefined;
  }

  const links: Record<string, string> = {};

  for (const [rawKey, href] of entries.slice(0, 8)) {
    const key = rawKey === "twitter" ? "x" : rawKey;

    if (key !== "email" && key !== "mail" && !links[key]) {
      links[key] = href;
    }
  }

  return Object.keys(links).length > 0 ? links : undefined;
}

export function normalizeGuestContributor(value: unknown): WordPressGuestContributor | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = isRecord(value.guest) ? value.guest : value;
  const name = textValue(source.name ?? source.displayName);
  const slug = typeof source.slug === "string" ? source.slug.trim().toLowerCase() : "";

  if (!name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return null;
  }

  const idValue = source.id ?? source.guestId ?? slug;
  const id = positiveInteger(idValue) ?? String(idValue);
  const profilePhoto = publicPhoto(source.profilePhoto ?? source.profileImage ?? source.image);
  const socials = publicSocialLinks(source.publicSocials ?? source.socials ?? source.links);
  const description = textValue(source.bio ?? source.description);
  const role = textValue(source.role ?? source.title);

  return {
    type: "guest",
    id,
    name,
    slug,
    ...(description ? { description } : {}),
    ...(role ? { role } : {}),
    ...(profilePhoto ? { profilePhoto } : {}),
    ...(socials ? { socials } : {})
  };
}

function publicAuthor(value: unknown): WordPressAuthor | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = positiveInteger(value.id);
  const name = textValue(value.name ?? value.display_name);
  const slug = typeof value.slug === "string" ? value.slug.trim().toLowerCase() : "";

  if (!id || !name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return null;
  }

  const avatarUrls = isRecord(value.avatar_urls)
    ? Object.fromEntries(Object.entries(value.avatar_urls).flatMap(([size, url]) => {
        const href = publicUrl(url);
        return href ? [[size, href]] : [];
      }))
    : undefined;

  return {
    id,
    name,
    slug,
    ...(textValue(value.description) ? { description: textValue(value.description) } : {}),
    ...(publicUrl(value.url) ? { url: publicUrl(value.url) } : {}),
    ...(publicUrl(value.link) ? { link: publicUrl(value.link) } : {}),
    ...(avatarUrls && Object.keys(avatarUrls).length > 0 ? { avatar_urls: avatarUrls } : {})
  };
}

function publicMedia(value: unknown): WordPressMedia | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceUrl = publicUrl(value.source_url ?? value.url);

  if (!sourceUrl) {
    return null;
  }

  const details = isRecord(value.media_details) ? value.media_details : {};
  const sizes = isRecord(details.sizes)
    ? Object.fromEntries(Object.entries(details.sizes).flatMap(([key, size]) => {
        if (!isRecord(size) || !publicUrl(size.source_url)) return [];
        return [[key, {
          file: typeof size.file === "string" ? size.file : "",
          width: typeof size.width === "number" ? size.width : 0,
          height: typeof size.height === "number" ? size.height : 0,
          ...(typeof size.mime_type === "string" ? { mime_type: size.mime_type } : {}),
          source_url: publicUrl(size.source_url)
        }]];
      }))
    : undefined;

  return {
    id: positiveInteger(value.id) ?? 0,
    date: typeof value.date === "string" ? value.date : "",
    slug: typeof value.slug === "string" ? value.slug : "",
    type: "attachment",
    link: publicUrl(value.link),
    title: renderedValue(value.title),
    author: positiveInteger(value.author) ?? 0,
    caption: renderedValue(value.caption),
    alt_text: textValue(value.alt_text),
    media_type: typeof value.media_type === "string" ? value.media_type : "image",
    mime_type: typeof value.mime_type === "string" ? value.mime_type : "",
    media_details: {
      ...(typeof details.width === "number" ? { width: details.width } : {}),
      ...(typeof details.height === "number" ? { height: details.height } : {}),
      ...(sizes ? { sizes } : {})
    },
    source_url: sourceUrl
  };
}

function publicPost(value: unknown): WordPressPost | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.status === "string" && value.status !== "publish") {
    return null;
  }

  if (typeof value.type === "string" && value.type !== "post") {
    return null;
  }

  const id = positiveInteger(value.id);
  const slug = typeof value.slug === "string" ? value.slug.trim() : "";
  const title = renderedValue(value.title);

  if (!id || !slug || !textValue(title)) {
    return null;
  }

  const embedded = isRecord(value._embedded) ? value._embedded : {};
  const authors = Array.isArray(embedded.author) ? embedded.author.flatMap((author) => {
    const normalized = publicAuthor(author);
    return normalized ? [normalized] : [];
  }) : [];
  const media = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"].flatMap((entry) => {
    const normalized = publicMedia(entry);
    return normalized ? [normalized] : [];
  }) : [];
  const terms = Array.isArray(embedded["wp:term"])
    ? embedded["wp:term"].map((group) => Array.isArray(group) ? group.flatMap((term) => {
        if (!isRecord(term) || (term.taxonomy !== "category" && term.taxonomy !== "post_tag")) return [];
        const id = positiveInteger(term.id);
        const name = textValue(term.name);
        const termSlug = typeof term.slug === "string" ? term.slug : "";
        if (!id || !name || !termSlug) return [];
        return [term.taxonomy === "category"
          ? { id, count: positiveInteger(term.count) ?? 0, description: textValue(term.description), link: publicUrl(term.link), name, slug: termSlug, taxonomy: "category" as const, parent: 0 }
          : { id, count: positiveInteger(term.count) ?? 0, description: textValue(term.description), link: publicUrl(term.link), name, slug: termSlug, taxonomy: "post_tag" as const }];
      }) : [])
    : [];
  const excerpt = renderedValue(value.excerpt);
  const content = renderedValue(value.content);
  const contributorValues = [value.contributors, value.bylines, value.authorBylines].find(Array.isArray);
  const contributors = contributorValues?.flatMap((entry) => {
    const contributor = normalizePostContributor(entry, authors);
    return contributor ? [contributor] : [];
  }) ?? [];
  const byline = isRecord(value.byline) ? value.byline : {};
  const weeklyWildcat = isRecord(value.weeklyWildcat) ? value.weeklyWildcat : {};
  const correctionValues = [
    value.corrections,
    value.updates,
    byline.corrections,
    byline.updates,
    weeklyWildcat.corrections,
    embedded["byline:corrections"],
    embedded["byline:updates"]
  ].find(Array.isArray);
  const date = typeof value.date === "string"
    ? value.date
    : typeof value.publishedAt === "string"
      ? value.publishedAt
      : typeof value.published_at === "string"
        ? value.published_at
        : "";
  const modified = typeof value.modified === "string"
    ? value.modified
    : typeof value.modifiedAt === "string"
      ? value.modifiedAt
      : typeof value.modified_at === "string"
        ? value.modified_at
        : date;

  return {
    id,
    date,
    date_gmt: typeof value.date_gmt === "string" ? value.date_gmt : date,
    modified,
    modified_gmt: typeof value.modified_gmt === "string" ? value.modified_gmt : modified,
    slug,
    status: "publish",
    type: "post",
    link: publicUrl(value.link ?? value.url),
    title,
    content,
    excerpt,
    author: positiveInteger(value.author) ?? authors[0]?.id ?? 0,
    featured_media: positiveInteger(value.featured_media) ?? media[0]?.id ?? 0,
    categories: Array.isArray(value.categories) ? value.categories.map(positiveInteger).filter((entry): entry is number => entry !== null) : [],
    tags: Array.isArray(value.tags) ? value.tags.map(positiveInteger).filter((entry): entry is number => entry !== null) : [],
    sticky: value.sticky === true,
    _embedded: {
      ...(authors.length ? { author: authors } : {}),
      ...(media.length ? { "wp:featuredmedia": media } : {}),
      ...(terms.length ? { "wp:term": terms } : {})
    },
    ...(contributors.length ? { contributors } : {}),
    ...(correctionValues ? { corrections: correctionValues } : {})
  };
}

async function fetchPublicNamespace<T>(namespace: string, path: string, query: Record<string, QueryValue> = {}) {
  const url = new URL(`${getNamespaceApiUrl(namespace)}/${path.replace(/^\//, "")}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  if (WORDPRESS_FETCH_CACHE_KEY) {
    url.searchParams.set("_ww_static_build", WORDPRESS_FETCH_CACHE_KEY);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": WORDPRESS_FETCH_USER_AGENT
    },
    cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache"
  });

  if (!response.ok) {
    throw new PublicWordPressFetchError(response.status, response.statusText, url);
  }

  return mirrorWordPressMediaInValue((await response.json()) as T);
}

async function publicWpFetch<T>(path: string, query: Record<string, QueryValue> = {}) {
  if (process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) {
    return fixtureData<T>(path, query);
  }

  try {
    return await fetchPublicNamespace<T>(BYLINE_API_NAMESPACE, path, query);
  } catch (cause) {
    if (!(cause instanceof PublicWordPressFetchError) || cause.status !== 404) {
      throw cause;
    }

    return fetchPublicNamespace<T>(LEGACY_API_NAMESPACE, path, query);
  }
}

function collectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["items", "data", "coverage", "coverages", "corrections", "contributors", "guests"]) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return value.id || value.slug ? [value] : [];
}

async function publicCollection(paths: string[], query: Record<string, QueryValue> = {}) {
  let lastError: unknown;

  for (const path of paths) {
    try {
      return collectionItems(await publicWpFetch<unknown>(path, query));
    } catch (cause) {
      lastError = cause;
      if (!(cause instanceof PublicWordPressFetchError) || cause.status !== 404) {
        throw cause;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No public Byline collection endpoint was available.");
}

async function wpFetch<T>(path: string, query: Record<string, QueryValue> = {}) {
  if (process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) {
    return { data: fixtureData<T>(path, query), totalPages: 1 };
  }
  if (process.env.BYLINE_CONTENT_MODE === "empty" || process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) {
    return { data: [] as T, totalPages: 1 };
  }
  const url = new URL(`${getWordPressApiUrl()}/${path.replace(/^\//, "")}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  if (WORDPRESS_FETCH_CACHE_KEY) {
    url.searchParams.set("_ww_static_build", WORDPRESS_FETCH_CACHE_KEY);
  }

  const fetchOptions: RequestInit = {
    headers: {
      Accept: "application/json",
      "User-Agent": WORDPRESS_FETCH_USER_AGENT
    },
    cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache"
  };
  let response = await fetch(url, fetchOptions);

  if (response.status === 403 && url.searchParams.has("_ww_static_build")) {
    url.searchParams.delete("_ww_static_build");
    response = await fetch(url, fetchOptions);
  }

  if (!response.ok) {
    throw new Error(`WordPress request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return {
    data: await mirrorWordPressMediaInValue((await response.json()) as T),
    totalPages: Number(response.headers.get("x-wp-totalpages") || "1")
  };
}

async function wpFetchCollection<T>(path: string, query: Record<string, QueryValue> = {}) {
  const firstPage = await wpFetch<T[]>(path, {
    per_page: 100,
    page: 1,
    ...query
  });

  if (firstPage.totalPages <= 1) {
    return firstPage.data;
  }

  const data = [...firstPage.data];
  for (let firstPageNumber = 2; firstPageNumber <= firstPage.totalPages; firstPageNumber += WORDPRESS_PAGE_CONCURRENCY) {
    const lastPageNumber = Math.min(
      firstPage.totalPages,
      firstPageNumber + WORDPRESS_PAGE_CONCURRENCY - 1
    );
    const batch = await Promise.all(
      Array.from({ length: lastPageNumber - firstPageNumber + 1 }, (_, index) =>
        wpFetch<T[]>(path, {
          per_page: 100,
          page: firstPageNumber + index,
          ...query
        })
      )
    );
    data.push(...batch.flatMap((page) => page.data));
  }

  return data;
}

async function headlessWpFetch<T>(path: string, query: Record<string, QueryValue> = {}) {
  if (process.env.BYLINE_CONTENT_MODE === "empty") {
    return [] as T;
  }
  const url = new URL(`${getHeadlessApiUrl()}/${path.replace(/^\//, "")}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  if (WORDPRESS_FETCH_CACHE_KEY) {
    url.searchParams.set("_ww_static_build", WORDPRESS_FETCH_CACHE_KEY);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": WORDPRESS_FETCH_USER_AGENT
    },
    cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache"
  });

  if (!response.ok) {
    throw new Error(`Byline headless request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return mirrorWordPressMediaInValue((await response.json()) as T);
}

export async function getLatestPosts(count = 12) {
  const { data } = await wpFetch<WordPressPost[]>("/posts", {
    _embed: 1,
    status: "publish",
    per_page: count,
    page: 1,
    orderby: "date",
    order: "desc"
  });

  return data;
}

export async function getAllPosts() {
  return wpFetchCollection<WordPressPost>("/posts", {
    _embed: 1,
    status: "publish",
    orderby: "date",
    order: "desc"
  });
}

export async function getPostBySlug(slug: string) {
  const { data } = await wpFetch<WordPressPost[]>("/posts", {
    _embed: 1,
    status: "publish",
    slug,
    per_page: 100
  });

  return data[0] ?? null;
}

export async function getAllPages() {
  return wpFetchCollection<WordPressPage>("/pages", {
    status: "publish",
    orderby: "menu_order",
    order: "asc"
  });
}

export async function getPageBySlug(slug: string) {
  const { data } = await wpFetch<WordPressPage[]>("/pages", {
    status: "publish",
    slug,
    per_page: 100
  });
  return data[0] ?? null;
}

export async function getAllCategories() {
  return wpFetchCollection<WordPressCategory>("/categories", {
    orderby: "name",
    order: "asc"
  });
}

export async function getAllAuthors() {
  try {
    return await headlessWpFetch<WordPressAuthor[]>("/authors");
  } catch {
    return wpFetchCollection<WordPressAuthor>("/users", {
      orderby: "name",
      order: "asc"
    });
  }
}

function normalizePublicContributor(value: unknown): WordPressContributor | null {
  if (isRecord(value)) {
    const type = String(value.type ?? value.kind ?? "").toLowerCase();

    if (type === "guest" || type === "contributor" || isRecord(value.guest)) {
      return normalizeGuestContributor(value);
    }
  }

  return publicAuthor(value);
}

function uniqueContributorSlugs(authors: WordPressAuthor[], guests: WordPressGuestContributor[]) {
  const usedSlugs = new Set(authors.map((author) => author.slug));

  return guests.map((guest) => {
    if (!usedSlugs.has(guest.slug)) {
      usedSlugs.add(guest.slug);
      return guest;
    }

    let suffix = 2;
    let slug = `guest-${guest.slug}`;

    while (usedSlugs.has(slug)) {
      slug = `guest-${guest.slug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(slug);
    return { ...guest, slug };
  });
}

export async function getAllGuestContributors() {
  try {
    const records = await publicCollection(["/contributors/guests", "/contributors", "/guests"], {
      public: 1,
      status: "publish"
    });

    return records.flatMap((record) => {
      const contributor = normalizeGuestContributor(record);
      return contributor ? [contributor] : [];
    });
  } catch {
    // Guest contributors are optional. A missing endpoint must not prevent the
    // normal WordPress author directory from building.
    return [];
  }
}

export async function getAllPublicContributors(): Promise<WordPressContributor[]> {
  const [authors, guests] = await Promise.all([getAllAuthors(), getAllGuestContributors()]);

  return [...authors, ...uniqueContributorSlugs(authors, guests)];
}

export async function getAuthorById(authorId: number) {
  const { data } = await wpFetch<WordPressAuthor>(`/users/${authorId}`);

  return data ?? null;
}

export async function getAuthorBySlug(slug: string) {
  const authors = await getAllAuthors();
  const publicAuthor = authors.find((author) => author.slug === slug);

  if (publicAuthor) {
    return publicAuthor;
  }

  const { data } = await wpFetch<WordPressAuthor[]>("/users", {
    slug,
    per_page: 100
  });

  return data[0] ?? null;
}

export async function getContributorBySlug(slug: string): Promise<WordPressContributor | null> {
  const contributors = await getAllPublicContributors();

  return contributors.find((contributor) => contributor.slug === slug) ?? null;
}

export async function getCategoryBySlug(slug: string) {
  const { data } = await wpFetch<WordPressCategory[]>("/categories", {
    slug,
    per_page: 100
  });

  return data[0] ?? null;
}

export async function getPostsByCategory(categoryId: number) {
  return wpFetchCollection<WordPressPost>("/posts", {
    _embed: 1,
    status: "publish",
    categories: categoryId,
    orderby: "date",
    order: "desc"
  });
}

export async function getPostsByAuthor(authorId: number) {
  const primaryPosts = await wpFetchCollection<WordPressPost>("/posts", {
    _embed: 1,
    status: "publish",
    author: authorId,
    orderby: "date",
    order: "desc"
  });

  try {
    const allPosts = await getAllPosts();
    const matchingPosts = allPosts.filter((post) =>
      post.author === authorId || getPostContributors(post).some((contributor) =>
        !isGuestContributor(contributor) && contributor.id === authorId
      )
    );

    return matchingPosts.length > 0 || allPosts.length === 0 ? matchingPosts : primaryPosts;
  } catch {
    return primaryPosts;
  }
}

export async function getPostsByContributor(contributor: WordPressContributor) {
  if (!isGuestContributor(contributor)) {
    return getPostsByAuthor(contributor.id);
  }

  const allPosts = await getAllPosts();

  return allPosts.filter((post) => getPostContributors(post).some((candidate) =>
    isGuestContributor(candidate) && (
      candidate.id === contributor.id || candidate.slug === contributor.slug
    )
  ));
}

export function getPostAuthor(post: WordPressPost) {
  return post._embedded?.author?.[0] ?? getPostContributors(post).find((contributor): contributor is WordPressAuthor => !isGuestContributor(contributor)) ?? null;
}

export async function getPostAuthorWithProfile(post: WordPressPost) {
  const embeddedAuthor = getPostAuthor(post);

  if (!embeddedAuthor) {
    return null;
  }

  if (embeddedAuthor.bylineProfile || embeddedAuthor.weeklyWildcatProfile) {
    return embeddedAuthor;
  }

  return (await getAuthorById(embeddedAuthor.id)) ?? embeddedAuthor;
}

export function getPostCategories(post: WordPressPost) {
  const terms = post._embedded?.["wp:term"]?.flat() ?? [];

  return terms.filter((term): term is WordPressCategory => term.taxonomy === "category");
}

export function getPostTags(post: WordPressPost) {
  const terms = post._embedded?.["wp:term"]?.flat() ?? [];

  return terms.filter((term): term is WordPressTag => term.taxonomy === "post_tag");
}

export function isGuestContributor(contributor: WordPressContributor): contributor is WordPressGuestContributor {
  return "type" in contributor && contributor.type === "guest";
}

function contributorRecordValues(post: WordPressPost) {
  const postRecord = post as unknown as Record<string, unknown>;
  const byline = isRecord(postRecord.byline) ? postRecord.byline : {};
  const legacyByline = isRecord(postRecord.weeklyWildcat) ? postRecord.weeklyWildcat : {};
  const embedded = isRecord(postRecord._embedded) ? postRecord._embedded : {};

  return [
    postRecord.contributors,
    postRecord.bylines,
    postRecord.authorBylines,
    byline.contributors,
    byline.authors,
    legacyByline.contributors,
    legacyByline.authors,
    embedded["byline:contributors"],
    embedded["byline:authors"]
  ].find(Array.isArray) as unknown[] | undefined;
}

function normalizePostUserContributor(value: unknown, embeddedAuthors: WordPressAuthor[]) {
  const id = typeof value === "number"
    ? positiveInteger(value)
    : isRecord(value)
      ? positiveInteger(value.id ?? value.userId ?? value.authorId)
      : null;

  if (!id) {
    return null;
  }

  const embedded = embeddedAuthors.find((author) => author.id === id);

  if (embedded) {
    return embedded;
  }

  if (!isRecord(value)) {
    return null;
  }

  const author = publicAuthor(value);

  return author?.id === id ? author : null;
}

function normalizePostContributor(value: unknown, embeddedAuthors: WordPressAuthor[]) {
  if (isRecord(value)) {
    const type = String(value.type ?? value.kind ?? "").toLowerCase();

    if (type === "guest" || type === "contributor" || isRecord(value.guest) || value.guest === true) {
      return normalizeGuestContributor(value);
    }
  }

  return normalizePostUserContributor(value, embeddedAuthors);
}

function contributorIdentity(contributor: WordPressContributor) {
  return isGuestContributor(contributor)
    ? `guest:${String(contributor.id)}:${contributor.slug}`
    : `user:${contributor.id}`;
}

export function getPostContributors(post: WordPressPost): WordPressContributor[] {
  const embeddedAuthors = post._embedded?.author ?? [];
  const rawValues = contributorRecordValues(post);
  const values = rawValues?.flatMap((value) => {
    const contributor = normalizePostContributor(value, embeddedAuthors);
    return contributor ? [contributor] : [];
  }) ?? [];
  const contributors = values.length > 0 ? values : embeddedAuthors;
  const deduplicated = contributors.filter((contributor, index, list) =>
    list.findIndex((candidate) => contributorIdentity(candidate) === contributorIdentity(contributor)) === index
  );
  const primaryAuthor = embeddedAuthors[0] ?? null;

  // A compact REST response may contain only the guest/secondary entry while
  // `_embedded.author` still carries the backwards-compatible primary author.
  // Preserve that author at the front without disturbing a complete explicit
  // byline order.
  if (primaryAuthor && !deduplicated.some((contributor) =>
    !isGuestContributor(contributor) && contributor.id === primaryAuthor.id
  )) {
    deduplicated.unshift(primaryAuthor);
  }

  return deduplicated;
}

export async function getPostContributorsWithProfiles(post: WordPressPost) {
  const contributors = getPostContributors(post);

  return Promise.all(contributors.map(async (contributor) => {
    if (isGuestContributor(contributor) || contributor.bylineProfile || contributor.weeklyWildcatProfile) {
      return contributor;
    }

    return (await getAuthorById(contributor.id)) ?? contributor;
  }));
}

export function getContributorHref(contributor: WordPressContributor) {
  return `/author/${contributor.slug}/`;
}

export function getContributorName(contributor: WordPressContributor) {
  return contributor.name;
}

export function getContributorDescription(contributor: WordPressContributor) {
  return contributor.description?.trim() || "";
}

export function getContributorRole(contributor: WordPressContributor) {
  return isGuestContributor(contributor) ? contributor.role ?? "Guest contributor" : getAuthorProfile(contributor)?.role ?? "Writer";
}

export function getContributorPhoto(contributor: WordPressContributor) {
  if (isGuestContributor(contributor)) {
    return contributor.profilePhoto?.url ? contributor.profilePhoto : null;
  }

  return getAuthorPhoto(contributor);
}

export function getContributorSocialLinks(contributor: WordPressContributor) {
  if (!isGuestContributor(contributor)) {
    return getAuthorSocialLinks(contributor);
  }

  return Object.entries(contributor.socials ?? {}).map(([label, href]) => ({
    label: label === "x" ? "X" : label.charAt(0).toUpperCase() + label.slice(1),
    href
  }));
}

function correctionType(value: unknown): WordPressCorrectionType {
  const normalized = String(value ?? "correction").toLowerCase().replace(/[_\s]+/g, "-");

  if (normalized === "clarification") return "clarification";
  if (["editor-note", "editors-note", "note"].includes(normalized)) return "editor-note";
  if (["substantive-update", "substantive", "update"].includes(normalized)) return "substantive-update";

  return "correction";
}

export function getCorrectionTypeLabel(type: WordPressCorrectionType) {
  switch (type) {
    case "clarification":
      return "Clarification";
    case "editor-note":
      return "Editor’s note";
    case "substantive-update":
      return "Substantive update";
    default:
      return "Correction";
  }
}

function correctionText(value: unknown) {
  if (!isRecord(value)) {
    return textValue(value);
  }

  return textValue(value.text ?? value.explanation ?? value.message ?? value.content ?? value.body);
}

function stableCorrectionId(postId: number | undefined, type: WordPressCorrectionType, date: string, text: string, index: number) {
  let hash = 2166136261;
  const input = `${postId ?? "public"}|${type}|${date}|${text}|${index}`;

  for (let characterIndex = 0; characterIndex < input.length; characterIndex += 1) {
    hash ^= input.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }

  return `correction-${postId ?? "public"}-${(hash >>> 0).toString(36)}`;
}

function normalizeCorrection(value: unknown, postId?: number, index = 0, legacy = false): WordPressCorrection | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = correctionType(value.type ?? value.kind ?? value.category);
  const text = correctionText(value);
  const dateValue = value.date ?? value.publishedAt ?? value.recordedAt ?? value.createdAt ?? value.modifiedAt ?? value.updatedAt;
  const date = typeof dateValue === "string" ? dateValue : "";
  const nestedPostId = isRecord(value.post) ? positiveInteger(value.post.id) : null;
  const resolvedPostId = postId ?? nestedPostId ?? positiveInteger(value.postId ?? value.storyId ?? value.articleId) ?? undefined;
  const rawId = value.id ?? value.uuid ?? value.recordId;
  const id = typeof rawId === "string" || typeof rawId === "number"
    ? String(rawId)
    : stableCorrectionId(resolvedPostId, type, date, text, index);

  if (!text) {
    return null;
  }

  return {
    id,
    type,
    date,
    text,
    ...(resolvedPostId ? { postId: resolvedPostId } : {}),
    ...(legacy ? { legacy: true } : {})
  };
}

function correctionRecordValues(post: WordPressPost) {
  const postRecord = post as unknown as Record<string, unknown>;
  const byline = isRecord(postRecord.byline) ? postRecord.byline : {};
  const legacyByline = isRecord(postRecord.weeklyWildcat) ? postRecord.weeklyWildcat : {};
  const embedded = isRecord(postRecord._embedded) ? postRecord._embedded : {};

  return [
    postRecord.corrections,
    postRecord.updates,
    byline.corrections,
    byline.updates,
    legacyByline.corrections,
    embedded["byline:corrections"],
    embedded["byline:updates"]
  ].find(Array.isArray) as unknown[] | undefined;
}

function correctionKey(correction: WordPressCorrection) {
  return `${correction.type}|${correction.date}|${correction.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export function getLegacyCorrectionNotices(post: WordPressPost) {
  const html = post.content?.rendered ?? "";
  const notices: WordPressCorrection[] = [];
  const blockPattern = /<aside\b[^>]*class\s*=\s*["'][^"']*byline-correction-notice[^"']*["'][^>]*>([\s\S]*?)<\/aside>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[0];
    const body = block.match(/class\s*=\s*["'][^"']*byline-correction-notice-body[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
    const date = block.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    const type = block.match(/data-correction-type\s*=\s*["']([^"']+)["']/i)?.[1] ?? "correction";
    const notice = normalizeCorrection({ type, date, text: body }, post.id, notices.length, true);

    if (notice) {
      notices.push(notice);
    }
  }

  return notices;
}

export function getPostCorrections(post: WordPressPost) {
  const legacyKeys = new Set(getLegacyCorrectionNotices(post).map(correctionKey));
  const rawValues = correctionRecordValues(post) ?? [];

  return rawValues
    .flatMap((value, index) => {
      const correction = normalizeCorrection(value, post.id, index);
      return correction && !legacyKeys.has(correctionKey(correction)) ? [correction] : [];
    });
}

export function getPublicCorrectionsForPost(post: WordPressPost) {
  return [...getLegacyCorrectionNotices(post), ...getPostCorrections(post)];
}

export function normalizePublicCorrection(value: unknown, index = 0) {
  return normalizeCorrection(value, undefined, index);
}

export function normalizePublicCoverage(value: unknown): WordPressCoverage | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = typeof value.status === "string" ? value.status.toLowerCase() : "";
  const postStatus = typeof value.postStatus === "string" ? value.postStatus.toLowerCase() : "";
  const visibility = typeof value.visibility === "string" ? value.visibility.toLowerCase() : "";
  const publicLandingPage = value.publicLandingPage ?? value.public ?? value.isPublic;

  if (
    [postStatus, status, visibility].some((candidate) => ["draft", "private", "pending", "trash", "future"].includes(candidate)) ||
    publicLandingPage === false ||
    visibility === "private"
  ) {
    return null;
  }

  const idValue = value.id ?? value.coverageId ?? value.slug;
  const slug = typeof value.slug === "string" ? value.slug.trim().toLowerCase() : "";
  const title = textValue(value.title ?? value.name);

  if (!idValue || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title) {
    return null;
  }

  const storyValues = [value.stories, value.posts, value.linkedStories, value.publicStories].find(Array.isArray) ?? [];
  const stories = storyValues.flatMap((story) => {
    const normalized = publicPost(story);
    return normalized && getPostHref(normalized) !== "#" ? [normalized] : [];
  });
  const artwork = publicPhoto(value.artwork ?? value.featuredMedia ?? value.image);
  const description = textValue(value.description ?? value.shortDescription);
  const overview = textValue(value.overview ?? value.content);
  const startDate = typeof value.startDate === "string"
    ? value.startDate
    : typeof value.start_date === "string"
      ? value.start_date
      : typeof value.startAt === "string"
        ? value.startAt
        : undefined;
  const endDate = typeof value.endDate === "string"
    ? value.endDate
    : typeof value.end_date === "string"
      ? value.end_date
      : typeof value.endAt === "string"
        ? value.endAt
        : undefined;
  const modified = typeof value.modified === "string"
    ? value.modified
    : typeof value.modifiedAt === "string"
      ? value.modifiedAt
      : undefined;

  return {
    id: typeof idValue === "number" ? idValue : String(idValue),
    slug,
    title,
    description,
    overview,
    artwork: artwork ? { url: artwork.url, alt: artwork.alt ?? title, width: artwork.width, height: artwork.height } : null,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(modified ? { modified } : {}),
    stories
  };
}

export async function getAllPublicCoverages() {
  const records = await publicCollection(["/coverage", "/coverages"], {
    public: 1,
    _embed: 1
  });

  return records.flatMap((record) => {
    const coverage = normalizePublicCoverage(record);
    return coverage ? [coverage] : [];
  });
}

export async function getPublicCoverageBySlug(slug: string) {
  const coverages = await getAllPublicCoverages();

  return coverages.find((coverage) => coverage.slug === slug) ?? null;
}

export async function getAllPublicCorrections() {
  const records = await publicCollection(["/corrections"], {
    public: 1,
    status: "publish",
    per_page: 100
  });

  return records.flatMap((record, index) => {
    const correction = normalizePublicCorrection(record, index);
    return correction ? [correction] : [];
  });
}

export function getPrimaryCategory(post: WordPressPost) {
  return getPostCategories(post)[0] ?? null;
}

export function getPrimaryRoutableCategory(post: WordPressPost) {
  return getPostCategories(post).find((category) => category.slug !== "uncategorized") ?? getPrimaryCategory(post);
}

export function getFeaturedMedia(post: WordPressPost) {
  return post._embedded?.["wp:featuredmedia"]?.[0] ?? null;
}

export function getPostDateParts(post: WordPressPost) {
  const [date] = post.date.split("T");
  const [year, month, day] = date.split("-");

  return { year, month, day };
}

export function getPostRouteParts(post: WordPressPost): PostRouteParts | null {
  const date = getPostDateParts(post);
  const category = getPrimaryRoutableCategory(post);

  if (!date.year || !date.month || !date.day || !category) {
    return null;
  }

  return {
    ...date,
    category: category.slug,
    slug: post.slug
  };
}

export function getPostHref(post: WordPressPost) {
  const route = getPostRouteParts(post);

  if (!route) {
    const link = post.link?.trim() ?? "";

    return (link.startsWith("/") && !link.startsWith("//")) || /^https?:\/\//i.test(link) ? link : "#";
  }

  return `/${route.year}/${route.month}/${route.day}/${route.category}/${route.slug}/`;
}

export function getCategoryHref(category: WordPressCategory) {
  return `/category/${category.slug}/`;
}

export function getCoverageHref(coverage: Pick<WordPressCoverage, "slug">) {
  return `/coverage/${coverage.slug}/`;
}

export function getAuthorHref(author: WordPressAuthor) {
  return `/author/${author.slug}/`;
}

export function getAuthorProfile(author: WordPressAuthor) {
  return author.bylineProfile ?? author.weeklyWildcatProfile ?? null;
}

export function getAuthorPhoto(author: WordPressAuthor) {
  const photo = getAuthorProfile(author)?.profilePhoto;

  return photo?.url ? photo : null;
}

export function getAuthorSocialLinks(author: WordPressAuthor) {
  const socials = getAuthorProfile(author)?.socials;

  if (!socials) {
    return [];
  }

  return [
    { label: "Website", href: socials.website },
    { label: "Email", href: socials.email ? `mailto:${socials.email}` : "" },
    { label: "Instagram", href: socials.instagram },
    { label: "TikTok", href: socials.tiktok },
    { label: "LinkedIn", href: socials.linkedin }
  ].filter((link) => link.href);
}

export function getPostPrimaryGameId(post: WordPressPost) {
  const primaryGameId = (post.byline ?? post.weeklyWildcat)?.primaryGameId;
  return primaryGameId && primaryGameId > 0 ? primaryGameId : null;
}

export function getPostGameScoreGameIds(post: WordPressPost) {
  const ids = (post.byline ?? post.weeklyWildcat)?.gameScoreGameIds;

  return Array.isArray(ids)
    ? Array.from(new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
}
