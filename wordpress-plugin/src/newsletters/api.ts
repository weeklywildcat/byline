import type {
  Newsletter,
  NewsletterActionResponse,
  NewsletterDetailResponse,
  NewsletterDraft,
  NewsletterListFilters,
  NewsletterListResponse,
  NewsletterProvider,
  NewsletterProviderResponse,
  NewsletterProviderSettings,
  NewsletterProviderSettingsResponse,
  NewsletterStory
} from "./models";

/**
 * A small adapter around @wordpress/api-fetch.  Keeping the request function
 * injected lets the UI be mounted by any admin entrypoint while preserving the
 * protected REST permission/nonce setup owned by WordPress.
 */
export type NewsletterRequestOptions = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  data?: unknown;
};

export type NewsletterRequest = <T>(options: NewsletterRequestOptions) => Promise<T>;

export type NewsletterFetchers = {
  list: (filters?: NewsletterListFilters) => Promise<NewsletterListResponse>;
  get: (id: number) => Promise<NewsletterDetailResponse>;
  save: (newsletter: NewsletterDraft) => Promise<Newsletter>;
  addStory: (newsletterId: number, storyId: number, placement: "lead" | "additional") => Promise<Newsletter>;
  sendTest: (newsletterId: number, recipient?: string) => Promise<NewsletterActionResponse>;
  send: (newsletterId: number) => Promise<NewsletterActionResponse>;
  schedule: (newsletterId: number, scheduledAt: string) => Promise<NewsletterActionResponse>;
  cancel: (newsletterId: number) => Promise<NewsletterActionResponse>;
  providers: () => Promise<NewsletterProviderResponse>;
  saveProviderSettings: (providerId: string, settings: NewsletterProviderSettings) => Promise<NewsletterProviderSettingsResponse>;
  testProvider: (providerId: string, settings: NewsletterProviderSettings) => Promise<NewsletterProviderSettingsResponse>;
  searchStories: (query: string) => Promise<NewsletterStory[]>;
};

export const NEWSLETTER_API_BASE = "/byline/v1/admin/newsletters";
export const NEWSLETTER_STORY_SEARCH_PATH = "/byline/v1/editorial/planning";

function encodePart(value: string | number): string {
  return encodeURIComponent(String(value));
}

function queryPath(path: string, values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

type NewsletterListPayload = NewsletterListResponse & {
  newsletters?: Newsletter[];
};

function normalizeListResponse(payload: NewsletterListPayload): NewsletterListResponse {
  return {
    items: Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.newsletters)
        ? payload.newsletters
        : [],
    total: payload.total,
    providers: payload.providers
  };
}

function normalizeStories(payload: unknown): NewsletterStory[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item): NewsletterStory[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as {
      id?: unknown;
      title?: unknown;
      link?: unknown;
      excerpt?: unknown;
      imageUrl?: unknown;
      featuredImage?: { url?: unknown; alt?: unknown };
      _embedded?: { "wp:featuredmedia"?: Array<{ source_url?: unknown; alt_text?: unknown }> };
    };
    const id = typeof candidate.id === "number" ? candidate.id : Number(candidate.id);
    if (!Number.isInteger(id) || id <= 0) return [];

    const title = typeof candidate.title === "string"
      ? candidate.title
      : candidate.title && typeof candidate.title === "object" && typeof (candidate.title as { rendered?: unknown }).rendered === "string"
        ? (candidate.title as { rendered: string }).rendered
        : "";
    const excerpt = typeof candidate.excerpt === "string"
      ? candidate.excerpt
      : candidate.excerpt && typeof candidate.excerpt === "object" && typeof (candidate.excerpt as { rendered?: unknown }).rendered === "string"
        ? (candidate.excerpt as { rendered: string }).rendered
        : null;
    const embeddedImage = candidate._embedded?.["wp:featuredmedia"]?.[0];
    const featuredImage = candidate.featuredImage;

    return [{
      id,
      title: title || "Untitled story",
      url: typeof candidate.link === "string" ? candidate.link : null,
      excerpt,
      imageUrl: typeof candidate.imageUrl === "string"
        ? candidate.imageUrl
        : typeof featuredImage?.url === "string"
          ? featuredImage.url
          : typeof embeddedImage?.source_url === "string"
            ? embeddedImage.source_url
            : null,
      imageAlt: typeof featuredImage?.alt === "string"
        ? featuredImage.alt
        : typeof embeddedImage?.alt_text === "string"
          ? embeddedImage.alt_text
          : null
    }];
  });
}

/**
 * Creates route-aware fetchers for the protected Byline newsletter API.  No
 * provider credential or REST nonce is accepted here; @wordpress/api-fetch's
 * configured middleware supplies authorization at the host application.
 */
export function createNewsletterFetchers(request: NewsletterRequest): NewsletterFetchers {
  return {
    list: (filters = {}) => request<NewsletterListPayload>({
      path: queryPath(NEWSLETTER_API_BASE, {
        status: filters.status && filters.status !== "all" ? filters.status : undefined,
        audience: filters.audience,
        search: filters.search,
        page: filters.page,
        per_page: filters.perPage
      })
    }).then(normalizeListResponse),

    get: (id) => request<NewsletterDetailResponse>({ path: `${NEWSLETTER_API_BASE}/${encodePart(id)}` }),

    save: (newsletter) => request<Newsletter>({
      path: newsletter.id ? `${NEWSLETTER_API_BASE}/${encodePart(newsletter.id)}` : NEWSLETTER_API_BASE,
      method: "POST",
      data: newsletter
    }),

    addStory: (newsletterId, storyId, placement) => request<Newsletter>({
      path: `${NEWSLETTER_API_BASE}/${encodePart(newsletterId)}/stories`,
      method: "POST",
      data: { storyId, placement }
    }),

    sendTest: (newsletterId, recipient) => request<NewsletterActionResponse>({
      path: `${NEWSLETTER_API_BASE}/${encodePart(newsletterId)}/send-test`,
      method: "POST",
      data: recipient ? { recipient } : {}
    }),

    send: (newsletterId) => request<NewsletterActionResponse>({
      path: `${NEWSLETTER_API_BASE}/${encodePart(newsletterId)}/send`,
      method: "POST",
      data: {}
    }),

    schedule: (newsletterId, scheduledAt) => request<NewsletterActionResponse>({
      path: `${NEWSLETTER_API_BASE}/${encodePart(newsletterId)}/schedule`,
      method: "POST",
      data: { scheduledAt }
    }),

    cancel: (newsletterId) => request<NewsletterActionResponse>({
      path: `${NEWSLETTER_API_BASE}/${encodePart(newsletterId)}/cancel`,
      method: "POST",
      data: {}
    }),

    providers: () => request<NewsletterProviderResponse>({ path: `${NEWSLETTER_API_BASE}/providers` }),

    saveProviderSettings: (providerId, settings) => request<NewsletterProviderSettingsResponse>({
      path: `${NEWSLETTER_API_BASE}/providers/${encodePart(providerId)}/settings`,
      method: "POST",
      data: settings
    }),

    testProvider: (providerId, settings) => request<NewsletterProviderSettingsResponse>({
      path: `${NEWSLETTER_API_BASE}/providers/${encodePart(providerId)}/test`,
      method: "POST",
      data: settings
    }),

    searchStories: (query) => request<unknown>({
      path: queryPath(NEWSLETTER_STORY_SEARCH_PATH, {
        search: query,
        per_page: 20
      })
    }).then(normalizeStories)
  };
}
