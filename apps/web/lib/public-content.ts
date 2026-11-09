import { nativeStory, nativeStoryRoute } from "./native-snapshot";
import { normalizeArtDirection, normalizeLiveCoverage, normalizePrimaryVideo, normalizeStoryFormat, type ImageArtDirection, type LiveCoverage as ArchiveLiveCoverage, type PrimaryVideo } from "@byline/core";
import { assertPreparedBuildMode, getPreparedDatasets, hasPreparedSnapshot } from "./prepared-data";
import { REDIRECTED_PAGE_SLUGS } from "@/lib/code-routes";
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";
import { stripHtml } from "@/lib/format";
import { getPublicationConfig } from "@/lib/publication";
import weeklyWildcatContent from "@/tests/fixtures/weekly-wildcat-content.json";
import storyPresentations from "../../../tests/fixtures/story-presentations.json";
import { browserContent } from "@/tests/fixtures/browser-content";
import galleryMedia from "../../../tests/fixtures/gallery-media.json";

const DEFAULT_SITE_URL = "https://weeklywildcat.com";
const buildDataPromises = new Map<string, Promise<unknown>>();

function memoizedBuildData<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = buildDataPromises.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = load().catch((error) => {
    buildDataPromises.delete(key);
    throw error;
  });
  buildDataPromises.set(key, promise);
  return promise;
}

const fixtures = weeklyWildcatContent as unknown as Partial<ReturnType<typeof getPreparedDatasets>>;
const fixturePosts = weeklyWildcatContent.posts.map((post) => {
  const extra = post.id === 4 ? storyPresentations.rendered : post.id === 5 ? galleryMedia.rendered : "";
  return extra ? { ...post, content: { rendered: post.content.rendered + extra } } : post;
});

const browserFixtures = process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-browser-fixture"
  ? browserContent(fixturePosts as ArchivePost[], weeklyWildcatContent.categories as ArchiveCategory[])
  : undefined;

export type RenderedText = {
  rendered: string;
  protected?: boolean;
};

export type ArchiveAuthor = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  url?: string;
  link?: string;
  avatar_urls?: Record<string, string>;
  bylineProfile?: ArchiveAuthorProfile;
  weeklyWildcatProfile?: ArchiveAuthorProfile;
};

export type ArchiveGuestContributor = {
  type: "guest";
  id: number | string;
  name: string;
  slug: string;
  /** False for one-off guests credited by name and photo only. Absent means a legacy guest with a page. */
  hasProfilePage?: boolean;
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

export type ArchiveContributor = ArchiveAuthor | ArchiveGuestContributor;

export type ArchiveAuthorProfile = {
  pronouns: string;
  role: string;
  shortBio?: string;
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

export type ArchiveCategory = {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: "category";
  parent: number;
};

export type ArchiveTag = {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: "post_tag";
};

export type ArchivePage = {
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
    /** "public" (default), "noindex" or "internal"; set in the Byline Page panel. */
    indexing?: string;
    sportsArchive?: { key: string; routes: Record<string, string> };
  };
};

export type ArchiveMediaSize = {
  file: string;
  width: number;
  height: number;
  mime_type?: string;
  source_url: string;
};

export type ArchiveMedia = {
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
    sizes?: Record<string, ArchiveMediaSize>;
    image_meta?: {
      caption?: string;
      copyright?: string;
      credit?: string;
    };
  };
  bylineImage?: ArchiveImageCredit;
  weeklyWildcatImage?: ArchiveImageCredit;
  source_url: string;
};

export type ArchiveImageCredit = {
    creator: string;
    creditText: string;
    copyrightNotice: string;
    licenseUrl: string;
    acquireLicensePage: string;
    /** Editor focal point, crop boxes and cropped files; see packages/core/src/image-crops.ts. */
    artDirection?: ImageArtDirection | null;
};

export type ArchivePost = {
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
  byline?: ArchivePostSettings;
  weeklyWildcat?: ArchivePostSettings;
  contributors?: unknown;
  bylines?: unknown;
  corrections?: unknown;
  /** Live coverage (snapshot posts carry it here; REST posts inside `byline`). */
  live?: unknown;
  _embedded?: {
    author?: ArchiveAuthor[];
    "wp:featuredmedia"?: ArchiveMedia[];
    "wp:term"?: Array<Array<ArchiveCategory | ArchiveTag | { taxonomy: string }>>;
  };
};

export type ArchivePostSettings = {
  primaryGameId?: number;
  gameScoreGameIds?: number[];
  presentation?: unknown;
  immersiveAlignment?: unknown;
  reportingNote?: unknown;
  /** "standard" or "video"; see packages/core/src/story-video.ts. */
  format?: unknown;
  video?: unknown;
  contributors?: unknown;
  authors?: unknown;
  corrections?: unknown;
  live?: unknown;
};

export type { LiveCoverage as ArchiveLiveCoverage, LiveCoverageUpdate as ArchiveLiveUpdate } from "@byline/core";

export type ArchiveCorrectionType = "correction" | "clarification" | "editor-note" | "substantive-update";

export type ArchiveCorrection = {
  id: string;
  type: ArchiveCorrectionType;
  date: string;
  text: string;
  postId?: number;
  legacy?: boolean;
};

export type ArchiveCoverageArtwork = {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  /** The editor's focal point as CSS object-position; artwork is shown square. */
  objectPosition?: string;
};

/** Ongoing coverage, or a numbered series read in the editor's order. */
export type ArchiveCoverageFormat = "coverage" | "series";

export type ArchiveCoverage = {
  id: number | string;
  slug: string;
  title: string;
  format: ArchiveCoverageFormat;
  description: string;
  overview: string;
  /** The overview as plain-text paragraphs. */
  overviewParagraphs: string[];
  /** upcoming, active, past or archived; past and archived coverage is complete. */
  status?: string;
  artwork: ArchiveCoverageArtwork | null;
  startDate?: string;
  endDate?: string;
  modified?: string;
  stories: ArchivePost[];
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
    height: typeof value.height === "number" ? value.height : null,
    // "30% 20%" from the editor's focal point; never anything else in a style.
    ...(typeof value.objectPosition === "string" && /^\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/.test(value.objectPosition) ? { objectPosition: value.objectPosition } : {})
  };
}

function publicImageCredit(value: unknown): ArchiveImageCredit | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const creditText = textValue(value.creditText ?? value.credit_text);
  const creator = textValue(value.creator);
  const copyrightNotice = textValue(value.copyrightNotice ?? value.copyright_notice);
  const licenseUrl = publicUrl(value.licenseUrl ?? value.license_url);
  const acquireLicensePage = publicUrl(value.acquireLicensePage ?? value.acquire_license_url);

  const artDirection = publicArtDirection(value.artDirection);

  if (!creditText && !creator && !copyrightNotice && !licenseUrl && !acquireLicensePage && !artDirection) {
    return undefined;
  }

  return { creator, creditText, copyrightNotice, licenseUrl, acquireLicensePage, ...(artDirection ? { artDirection } : {}) };
}

function publicArtDirection(value: unknown) {
  const art = normalizeArtDirection(value);
  if (!art) return null;
  const renditions = Object.fromEntries(Object.entries(art.renditions).flatMap(([shape, files]) => {
    const publicFiles = (files ?? []).flatMap((file) => publicUrl(file.url) ? [{ ...file, url: publicUrl(file.url) }] : []);
    return publicFiles.length ? [[shape, publicFiles]] : [];
  }));
  return { ...art, renditions };
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

export function normalizeGuestContributor(value: unknown): ArchiveGuestContributor | null {
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
    ...(source.hasProfilePage === false || source.hasProfilePage === "0" ? { hasProfilePage: false } : {}),
    ...(description ? { description } : {}),
    ...(role ? { role } : {}),
    ...(profilePhoto ? { profilePhoto } : {}),
    ...(socials ? { socials } : {})
  };
}

function publicAuthor(value: unknown): ArchiveAuthor | null {
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

function publicMedia(value: unknown): ArchiveMedia | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceUrl = publicUrl(value.source_url ?? value.url);

  if (!sourceUrl) {
    return null;
  }

  const details = isRecord(value.media_details) ? value.media_details : {};
  const bylineImage = publicImageCredit(value.bylineImage);
  const weeklyWildcatImage = publicImageCredit(value.weeklyWildcatImage);
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
    ...(bylineImage ? { bylineImage } : {}),
    ...(weeklyWildcatImage ? { weeklyWildcatImage } : {}),
    source_url: sourceUrl
  };
}

function publicPost(value: unknown): ArchivePost | null {
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
    date_gmt: typeof value.date_gmt === "string" ? value.date_gmt : "",
    modified,
    modified_gmt: typeof value.modified_gmt === "string" ? value.modified_gmt : "",
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
    ...(contributorValues ? { contributors } : {}),
    ...(correctionValues ? { corrections: correctionValues } : {}),
    ...([value.live, byline.live, weeklyWildcat.live].find(isRecord) ? { live: [value.live, byline.live, weeklyWildcat.live].find(isRecord) } : {})
  };
}

async function readCollection<T>(collection: keyof ReturnType<typeof getPreparedDatasets>): Promise<T[]> {
  assertPreparedBuildMode();
  if (hasPreparedSnapshot()) return getPreparedDatasets()[collection] as T[];
  if (!process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) return [];
  return (collection === "posts" ? browserFixtures?.posts ?? fixturePosts : collection === "categories" ? browserFixtures?.categories ?? fixtures.categories : fixtures[collection] ?? []) as T[];
}

export async function getLatestPosts(count = 12) {
  return (await getAllPosts()).slice(0, count);
}

export async function getAllPosts() {
  return memoizedBuildData("posts", () => readCollection<ArchivePost>("posts"));
}

export async function getPostBySlug(slug: string) {
  return (await getAllPosts()).find((post) => post.slug === slug) ?? null;
}

// Old administrative notice pages are not reader content.
export function isCmsNoticePage(page: Pick<ArchivePage, "title">) {
  return stripHtml(page.title.rendered).trim().toLowerCase() === "cms notice";
}

/**
 * How a CMS Page takes part in search:
 *  - public: a normal page; in the sitemap and indexable (the default)
 *  - noindex: still published and linkable, but out of the sitemap and marked noindex
 *  - internal: operational pages that are not published on the public site at all
 * Editors choose this in the Byline Page panel (`bylinePage.indexing`). The known
 * operational page below is also protected by identity in case the field is unset.
 */
export type PageIndexing = "public" | "noindex" | "internal";

const INTERNAL_PAGE_SLUGS = new Set(["78-2"]);

export function getPageIndexing(page: Pick<ArchivePage, "title" | "slug" | "bylinePage">): PageIndexing {
  const configured = page.bylinePage?.indexing;

  if (configured === "internal" || configured === "noindex" || configured === "public") {
    // Even an explicit "public" cannot expose the editors' landing page.
    return configured === "public" && (isCmsNoticePage(page) || INTERNAL_PAGE_SLUGS.has(page.slug)) ? "internal" : configured;
  }

  return isCmsNoticePage(page) || INTERNAL_PAGE_SLUGS.has(page.slug) ? "internal" : "public";
}

export function excludeInternalPages<T extends Pick<ArchivePage, "title" | "slug" | "bylinePage">>(pages: T[]) {
  return pages.filter((page) => getPageIndexing(page) !== "internal");
}

export function excludeCmsNoticePages<T extends Pick<ArchivePage, "title">>(pages: T[]) {
  return pages.filter((page) => !isCmsNoticePage(page));
}

export async function getAllPages() {
  const pages = await memoizedBuildData("pages", () => readCollection<ArchivePage>("pages"));

  return excludeInternalPages(pages).filter((page) => !(page.slug in REDIRECTED_PAGE_SLUGS));
}

export async function getPageBySlug(slug: string) {
  return (await getAllPages()).find((page) => page.slug === slug) ?? null;
}

export async function getAllCategories() {
  return memoizedBuildData("categories", () => readCollection<ArchiveCategory>("categories"));
}

export async function getAllTags() {
  return memoizedBuildData("tags", () => readCollection<ArchiveTag>("tags"));
}

export async function getAllAuthors() {
  return memoizedBuildData("authors", () => readCollection<ArchiveAuthor>("authors"));
}

function uniqueContributorSlugs(authors: ArchiveAuthor[], guests: ArchiveGuestContributor[]) {
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
  return memoizedBuildData("guest-contributors", async () => {
    const records = await readCollection<unknown>("guests");
    return records.flatMap((record) => {
      const contributor = normalizeGuestContributor(record);
      return contributor && contributorHasProfilePage(contributor) ? [contributor] : [];
    });
  });
}

export async function getAllPublicContributors(): Promise<ArchiveContributor[]> {
  return memoizedBuildData("public-contributors", async () => {
    const [authors, guests] = await Promise.all([getAllAuthors(), getAllGuestContributors()]);
    return [...authors, ...uniqueContributorSlugs(authors, guests)];
  });
}

export async function getAuthorById(authorId: number) {
  return (await getAllAuthors()).find((author) => author.id === authorId) ?? null;
}

export async function getAuthorBySlug(slug: string) {
  return (await getAllAuthors()).find((author) => author.slug === slug) ?? null;
}

export async function getContributorBySlug(slug: string): Promise<ArchiveContributor | null> {
  const contributors = await getAllPublicContributors();

  return contributors.find((contributor) => contributor.slug === slug) ?? null;
}

export async function getCategoryBySlug(slug: string) {
  return (await getAllCategories()).find((category) => category.slug === slug) ?? null;
}

export async function getPostsByCategory(categoryId: number) {
  return (await getAllPosts()).filter((post) => post.categories.includes(categoryId));
}

export async function getPostsByAuthor(authorId: number) {
  const allPosts = await getAllPosts();
  return allPosts.filter((post) => getPostContributors(post).some((contributor) =>
    !isGuestContributor(contributor) && contributor.id === authorId
  ));
}

export async function getPostsByContributor(contributor: ArchiveContributor) {
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

export function getPostAuthor(post: ArchivePost) {
  return post._embedded?.author?.[0] ?? getPostContributors(post).find((contributor): contributor is ArchiveAuthor => !isGuestContributor(contributor)) ?? null;
}

export async function getPostAuthorWithProfile(post: ArchivePost) {
  const embeddedAuthor = getPostAuthor(post);

  if (!embeddedAuthor) {
    return null;
  }

  if (embeddedAuthor.bylineProfile || embeddedAuthor.weeklyWildcatProfile) {
    return embeddedAuthor;
  }

  return (await getAuthorById(embeddedAuthor.id)) ?? embeddedAuthor;
}

export function getPostCategories(post: ArchivePost) {
  const terms = post._embedded?.["wp:term"]?.flat() ?? [];

  return terms.filter((term): term is ArchiveCategory => term.taxonomy === "category");
}

export function getPostTags(post: ArchivePost) {
  const terms = post._embedded?.["wp:term"]?.flat() ?? [];

  return terms.filter((term): term is ArchiveTag => term.taxonomy === "post_tag");
}

export function isGuestContributor(contributor: ArchiveContributor): contributor is ArchiveGuestContributor {
  return "type" in contributor && contributor.type === "guest";
}

function contributorRecordValues(post: ArchivePost) {
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

function normalizePostUserContributor(value: unknown, embeddedAuthors: ArchiveAuthor[]) {
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

function normalizePostContributor(value: unknown, embeddedAuthors: ArchiveAuthor[]) {
  if (isRecord(value)) {
    const type = String(value.type ?? value.kind ?? "").toLowerCase();

    if (type === "guest" || type === "contributor" || isRecord(value.guest) || value.guest === true) {
      return normalizeGuestContributor(value);
    }
  }

  return normalizePostUserContributor(value, embeddedAuthors);
}

function contributorIdentity(contributor: ArchiveContributor) {
  return isGuestContributor(contributor)
    ? `guest:${String(contributor.id)}:${contributor.slug}`
    : `user:${contributor.id}`;
}

export function getPostContributors(post: ArchivePost): ArchiveContributor[] {
  const embeddedAuthors = post._embedded?.author ?? [];
  const rawValues = contributorRecordValues(post);
  const values = rawValues?.flatMap((value) => {
    const contributor = normalizePostContributor(value, embeddedAuthors);
    return contributor ? [contributor] : [];
  }) ?? [];
  // An explicit list (including []) is the editor's complete byline. Only
  // legacy posts without the field inherit WordPress's internal author.
  const contributors = rawValues ? values : embeddedAuthors;
  const deduplicated = contributors.filter((contributor, index, list) =>
    list.findIndex((candidate) => contributorIdentity(candidate) === contributorIdentity(contributor)) === index
  );
  return deduplicated;
}

export async function getPostContributorsWithProfiles(post: ArchivePost) {
  const contributors = getPostContributors(post);

  return Promise.all(contributors.map(async (contributor) => {
    if (isGuestContributor(contributor) || contributor.bylineProfile || contributor.weeklyWildcatProfile) {
      return contributor;
    }

    return (await getAuthorById(contributor.id)) ?? contributor;
  }));
}

/** One-off guests have no /author/ page, so bylines render them as plain text. */
export function contributorHasProfilePage(contributor: ArchiveContributor) {
  return !isGuestContributor(contributor) || contributor.hasProfilePage !== false;
}

export function getContributorHref(contributor: ArchiveContributor) {
  return `/author/${contributor.slug}/`;
}

export function getContributorName(contributor: ArchiveContributor) {
  return contributor.name;
}

export function getContributorDescription(contributor: ArchiveContributor) {
  return contributor.description?.trim() || "";
}

export function getContributorRole(contributor: ArchiveContributor) {
  return isGuestContributor(contributor) ? contributor.role ?? "Guest contributor" : getAuthorProfile(contributor)?.role ?? "Writer";
}

export function getContributorPhoto(contributor: ArchiveContributor) {
  if (isGuestContributor(contributor)) {
    return contributor.profilePhoto?.url ? contributor.profilePhoto : null;
  }

  return getAuthorPhoto(contributor);
}

export function getContributorSocialLinks(contributor: ArchiveContributor) {
  if (!isGuestContributor(contributor)) {
    return getAuthorSocialLinks(contributor);
  }

  return Object.entries(contributor.socials ?? {}).map(([label, href]) => ({
    label: label === "x" ? "X" : label.charAt(0).toUpperCase() + label.slice(1),
    href
  }));
}

function correctionType(value: unknown): ArchiveCorrectionType {
  const normalized = String(value ?? "correction").toLowerCase().replace(/[_\s]+/g, "-");

  if (normalized === "clarification") return "clarification";
  if (["editor-note", "editors-note", "note"].includes(normalized)) return "editor-note";
  if (["substantive-update", "substantive", "update"].includes(normalized)) return "substantive-update";

  return "correction";
}

export function getCorrectionTypeLabel(type: ArchiveCorrectionType) {
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

function stableCorrectionId(postId: number | undefined, type: ArchiveCorrectionType, date: string, text: string, index: number) {
  let hash = 2166136261;
  const input = `${postId ?? "public"}|${type}|${date}|${text}|${index}`;

  for (let characterIndex = 0; characterIndex < input.length; characterIndex += 1) {
    hash ^= input.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }

  return `correction-${postId ?? "public"}-${(hash >>> 0).toString(36)}`;
}

function normalizeCorrection(value: unknown, postId?: number, index = 0, legacy = false): ArchiveCorrection | null {
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

function correctionRecordValues(post: ArchivePost) {
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

function correctionKey(correction: ArchiveCorrection) {
  return `${correction.type}|${correction.date}|${correction.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export function getLegacyCorrectionNotices(post: ArchivePost) {
  const html = post.content?.rendered ?? "";
  const notices: ArchiveCorrection[] = [];
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

export function getPostCorrections(post: ArchivePost) {
  const legacyKeys = new Set(getLegacyCorrectionNotices(post).map(correctionKey));
  const rawValues = correctionRecordValues(post) ?? [];

  return rawValues
    .flatMap((value, index) => {
      const correction = normalizeCorrection(value, post.id, index);
      return correction && !legacyKeys.has(correctionKey(correction)) ? [correction] : [];
    });
}

export function getPublicCorrectionsForPost(post: ArchivePost) {
  return [...getLegacyCorrectionNotices(post), ...getPostCorrections(post)];
}

export function normalizePublicCorrection(value: unknown, index = 0) {
  return normalizeCorrection(value, undefined, index);
}

export function normalizePublicCoverage(value: unknown): ArchiveCoverage | null {
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
  const overviewSource = value.overview ?? value.content;
  const overviewHtml = typeof overviewSource === "string" ? overviewSource : isRecord(overviewSource) && typeof overviewSource.rendered === "string" ? overviewSource.rendered : "";
  const overviewParagraphs = overviewHtml.split(/<\/p>|<br\s*\/?>|\n\s*\n/i).map(stripHtml).filter(Boolean);
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
    format: value.format === "series" ? "series" : "coverage",
    description,
    overview,
    overviewParagraphs,
    ...(status ? { status } : {}),
    artwork: artwork ? { url: artwork.url, alt: artwork.alt ?? title, width: artwork.width, height: artwork.height, ...(artwork.objectPosition ? { objectPosition: artwork.objectPosition } : {}) } : null,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(modified ? { modified } : {}),
    stories
  };
}

export async function getAllPublicCoverages() {
  return memoizedBuildData("coverages", async () => { const records = await readCollection<unknown>("coverages");

  return records.flatMap((record) => {
    const coverage = normalizePublicCoverage(record);
    return coverage ? [coverage] : [];
  });
  });
}

export async function getPublicCoverageBySlug(slug: string) {
  const coverages = await getAllPublicCoverages();

  return coverages.find((coverage) => coverage.slug === slug) ?? null;
}

export async function getAllPublicCorrections() {
  return memoizedBuildData("corrections", async () => { const records = await readCollection<unknown>("corrections");

  return records.flatMap((record, index) => {
    const correction = normalizePublicCorrection(record, index);
    return correction ? [correction] : [];
  });
  });
}

export function getPrimaryCategory(post: ArchivePost) {
  return getPostCategories(post)[0] ?? null;
}

export function getPrimaryRoutableCategory(post: ArchivePost) {
  return getPostCategories(post).find((category) => category.slug !== "uncategorized") ?? getPrimaryCategory(post);
}

export function getFeaturedMedia(post: ArchivePost) {
  return post._embedded?.["wp:featuredmedia"]?.[0] ?? null;
}

// The photographer for an image, so every credit reads "Photo: Name". The plugin's
// Image Creator field is the person who took it; the free-text credit line and the
// file's own metadata are fallbacks, with any "Photo by" style lead-in removed so
// it is not repeated by the label.
export function getMediaCredit(image: ArchiveMedia | null | undefined) {
  if (!image) {
    return "";
  }

  const credit = stripHtml(
    [
      image.bylineImage?.creator,
      image.weeklyWildcatImage?.creator,
      image.bylineImage?.creditText,
      image.weeklyWildcatImage?.creditText
    ].find((value) => Boolean(value?.trim())) ||
      image.media_details?.image_meta?.credit ||
      image.media_details?.image_meta?.copyright ||
      ""
  ).trim();

  return credit.replace(/^(?:photos?|photograph|photography|image|credit)(?:\s+by\s+|\s*[:\-–—]\s*)/i, "").trim();
}

// The editor's art direction for an image (focal point, crops, cropped files), or
// null. Snapshot posts are not passed through publicMedia(), so always read it here.
export function getMediaArtDirection(image: ArchiveMedia | null | undefined): ImageArtDirection | null {
  if (!image) return null;
  return normalizeArtDirection(image.bylineImage?.artDirection ?? image.weeklyWildcatImage?.artDirection);
}

export function getPostDateParts(post: ArchivePost) {
  const [date] = post.date.split("T");
  const [year, month, day] = date.split("-");

  return { year, month, day };
}

export function getPostRouteParts(post: ArchivePost): PostRouteParts | null {
  const native = nativeStory(post.id);
  if (native) return nativeStoryRoute(native);
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

export function getPostHref(post: ArchivePost) {
  const native = nativeStory(post.id);
  if (native) return native.href;
  const route = getPostRouteParts(post);

  if (!route) {
    const link = post.link?.trim() ?? "";

    return (link.startsWith("/") && !link.startsWith("//")) || /^https?:\/\//i.test(link) ? link : "#";
  }

  return `/${route.year}/${route.month}/${route.day}/${route.category}/${route.slug}/`;
}

export function getCategoryHref(category: ArchiveCategory) {
  return category.slug === BEHIND_THE_SCENES.slug ? BEHIND_THE_SCENES.path : `/category/${category.slug}/`;
}

export function getCoverageHref(coverage: Pick<ArchiveCoverage, "slug">) {
  return `/coverage/${coverage.slug}/`;
}

export function getAuthorHref(author: ArchiveAuthor) {
  return `/author/${author.slug}/`;
}

export function getAuthorProfile(author: ArchiveAuthor) {
  return author.bylineProfile ?? author.weeklyWildcatProfile ?? null;
}

export function getAuthorPhoto(author: ArchiveAuthor) {
  const photo = getAuthorProfile(author)?.profilePhoto;

  return photo?.url ? photo : null;
}

export function getAuthorSocialLinks(author: ArchiveAuthor) {
  const socials = getAuthorProfile(author)?.socials;

  if (!socials) {
    return [];
  }

  return [
    { label: "Website", href: socials.website },
    { label: "Email", href: socials.email ? `mailto:${socials.email}` : "" },
    { label: "Instagram", href: socials.instagram },
    { label: "TikTok", href: socials.tiktok },
    { label: "LinkedIn", href: socials.linkedin },
    { label: "X", href: socials.x }
  ].filter((link) => link.href);
}

export function getPostPrimaryGameId(post: ArchivePost) {
  const primaryGameId = (post.byline ?? post.weeklyWildcat)?.primaryGameId;
  return primaryGameId && primaryGameId > 0 ? primaryGameId : null;
}

/**
 * The story's live coverage, newest update first, or null for an ordinary
 * story. Snapshot posts are used as-is, so this is the one validation point.
 */
export function getPostLiveCoverage(post: ArchivePost): ArchiveLiveCoverage | null {
  return normalizeLiveCoverage([post.live, post.byline?.live, post.weeklyWildcat?.live].find(isRecord));
}

/** Missing presentation settings use the standard layout, bottom left. */
export function getPostStoryPresentation(post: ArchivePost): { presentation: "standard" | "immersive"; immersiveAlignment: "bottom-left" | "center" } {
  const settings = post.byline ?? post.weeklyWildcat;
  return {
    presentation: settings?.presentation === "immersive" ? "immersive" : "standard",
    immersiveAlignment: settings?.immersiveAlignment === "center" ? "center" : "bottom-left"
  };
}

/**
 * The primary YouTube video of a video story, or null for an article. Only the
 * story format makes a video story: a YouTube embed in an ordinary article's
 * body never does.
 */
export function getPostPrimaryVideo(post: ArchivePost): PrimaryVideo | null {
  const settings = post.byline ?? post.weeklyWildcat;
  return normalizeStoryFormat(settings?.format) === "video" ? normalizePrimaryVideo(settings?.video) : null;
}

/**
 * The "How we reported this" note as paragraphs. Plain text from WordPress;
 * blank lines separate paragraphs. Empty when the author wrote none.
 */
export function getPostReportingNote(post: ArchivePost): string[] {
  const note = (post.byline ?? post.weeklyWildcat)?.reportingNote;
  if (typeof note !== "string") return [];
  return note.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function getPostGameScoreGameIds(post: ArchivePost) {
  const ids = (post.byline ?? post.weeklyWildcat)?.gameScoreGameIds;

  return Array.isArray(ids)
    ? Array.from(new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
}
