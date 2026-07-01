const DEFAULT_WP_API_URL = "https://cms.weeklywildcat.com/wp-json/wp/v2";
const DEFAULT_SITE_URL = "https://weeklywildcat.com";
const WORDPRESS_FETCH_CACHE_KEY =
  process.env.WORDPRESS_FETCH_CACHE_KEY ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.NETLIFY_COMMIT_REF ||
  String(Date.now());

type QueryValue = string | number | boolean | undefined | null;

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
  weeklyWildcatProfile?: WordPressAuthorProfile;
};

export type WordPressAuthorProfile = {
  pronouns: string;
  role: string;
  founder: boolean;
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
  source_url: string;
};

export type WordPressPost = {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: "publish";
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
  _embedded?: {
    author?: WordPressAuthor[];
    "wp:featuredmedia"?: WordPressMedia[];
    "wp:term"?: Array<Array<WordPressCategory | WordPressTag | { taxonomy: string }>>;
  };
};

export type PostRouteParts = {
  year: string;
  month: string;
  day: string;
  category: string;
  slug: string;
};

export function getWordPressApiUrl() {
  return (process.env.NEXT_PUBLIC_WP_API_URL || DEFAULT_WP_API_URL).replace(/\/$/, "");
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
}

async function wpFetch<T>(path: string, query: Record<string, QueryValue> = {}) {
  const url = new URL(`${getWordPressApiUrl()}/${path.replace(/^\//, "")}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set("_ww_static_build", WORDPRESS_FETCH_CACHE_KEY);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache"
  });

  if (!response.ok) {
    throw new Error(`WordPress request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return {
    data: (await response.json()) as T,
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

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      wpFetch<T[]>(path, {
        per_page: 100,
        page: index + 2,
        ...query
      })
    )
  );

  return [...firstPage.data, ...remainingPages.flatMap((page) => page.data)];
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

export async function getAllCategories() {
  return wpFetchCollection<WordPressCategory>("/categories", {
    orderby: "name",
    order: "asc"
  });
}

export async function getAllAuthors() {
  return wpFetchCollection<WordPressAuthor>("/users", {
    orderby: "name",
    order: "asc"
  });
}

export async function getAuthorBySlug(slug: string) {
  const { data } = await wpFetch<WordPressAuthor[]>("/users", {
    slug,
    per_page: 100
  });

  return data[0] ?? null;
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
  return wpFetchCollection<WordPressPost>("/posts", {
    _embed: 1,
    status: "publish",
    author: authorId,
    orderby: "date",
    order: "desc"
  });
}

export function getPostAuthor(post: WordPressPost) {
  return post._embedded?.author?.[0] ?? null;
}

export function getPostCategories(post: WordPressPost) {
  const terms = post._embedded?.["wp:term"]?.flat() ?? [];

  return terms.filter((term): term is WordPressCategory => term.taxonomy === "category");
}

export function getPostTags(post: WordPressPost) {
  const terms = post._embedded?.["wp:term"]?.flat() ?? [];

  return terms.filter((term): term is WordPressTag => term.taxonomy === "post_tag");
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
    return "#";
  }

  return `/${route.year}/${route.month}/${route.day}/${route.category}/${route.slug}/`;
}

export function getCategoryHref(category: WordPressCategory) {
  return `/category/${category.slug}/`;
}

export function getAuthorHref(author: WordPressAuthor) {
  return `/author/${author.slug}/`;
}

export function getAuthorProfile(author: WordPressAuthor) {
  return author.weeklyWildcatProfile ?? null;
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
    { label: "LinkedIn", href: socials.linkedin },
    { label: "X", href: socials.x }
  ].filter((link) => link.href);
}
