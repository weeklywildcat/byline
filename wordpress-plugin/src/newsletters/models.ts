/**
 * Shared, presentation-free contracts for the protected newsletter admin UI.
 *
 * The WordPress newsletter integration owns these records.  This module only
 * describes the safe response shape and provides pure helpers for optimistic
 * editing; it does not create a second client-side store.
 */

export const NEWSLETTER_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled"
] as const;

export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

export const NEWSLETTER_PROVIDER_IDS = [
  "kit",
  "mailchimp",
  "buttondown",
  "webhook",
  "signup-link",
  "none"
] as const;

export type NewsletterProviderId = (typeof NEWSLETTER_PROVIDER_IDS)[number] | (string & {});

export const NEWSLETTER_CAPABILITIES = [
  "signup",
  "audienceDiscovery",
  "connectionTest",
  "sendTest",
  "immediateSend",
  "remoteScheduling",
  "stats"
] as const;

export type NewsletterCapability = (typeof NEWSLETTER_CAPABILITIES)[number];

export type NewsletterProviderCapabilities = Record<NewsletterCapability, boolean>;

export type NewsletterConnectionStatus = "connected" | "disconnected" | "unknown" | "unavailable";

export type NewsletterProviderField = {
  id: string;
  label: string;
  type: "text" | "url" | "email" | "password";
  description?: string;
  /** Secret values are intentionally never returned by the API. */
  secret?: boolean;
  value?: string;
  placeholder?: string;
};

export type NewsletterProvider = {
  id: NewsletterProviderId;
  label: string;
  configured: boolean;
  maskedIdentifier?: string | null;
  connectionStatus: NewsletterConnectionStatus;
  capabilities: NewsletterProviderCapabilities;
  fields?: NewsletterProviderField[];
  setupMessage?: string | null;
  lastTestedAt?: string | null;
};

export type NewsletterStory = {
  id: number;
  title: string;
  url?: string | null;
  excerpt?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  publishedAt?: string | null;
};

export type NewsletterDeliveryStats = {
  recipients?: number;
  delivered?: number;
  opens?: number;
  clicks?: number;
  unsubscribes?: number;
  measuredAt?: string | null;
};

export type Newsletter = {
  id: number;
  title: string;
  subject: string;
  preheader: string;
  audience: string;
  leadStoryId: number | null;
  additionalStoryIds: number[];
  sectionHeadings: string[];
  intro: string;
  outro: string;
  providerId: NewsletterProviderId | null;
  status: NewsletterStatus;
  scheduledAt?: string | null;
  sentAt?: string | null;
  providerExternalId?: string | null;
  htmlSnapshot?: string | null;
  plaintextSnapshot?: string | null;
  deliveryStats?: NewsletterDeliveryStats | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type NewsletterDraft = Omit<Newsletter, "id" | "status"> & {
  id?: number;
  status: NewsletterStatus;
};

export type NewsletterListFilters = {
  status?: NewsletterStatus | "all";
  audience?: string;
  search?: string;
  page?: number;
  perPage?: number;
};

export type NewsletterListResponse = {
  items: Newsletter[];
  total?: number;
  providers?: NewsletterProvider[];
};

export type NewsletterDetailResponse = {
  newsletter: Newsletter;
  stories?: NewsletterStory[];
  providers?: NewsletterProvider[];
};

export type NewsletterProviderResponse = {
  providers: NewsletterProvider[];
};

export type NewsletterActionResponse = {
  newsletter: Newsletter;
  message?: string;
};

export type NewsletterProviderSettingsResponse = {
  provider: NewsletterProvider;
  message?: string;
};

export type NewsletterProviderSettings = Record<string, string>;

export type NewsletterAction =
  | "sendTest"
  | "send"
  | "schedule"
  | "cancel"
  | "stats";

export type NewsletterStoryPlacement = "lead" | "additional";

export const DEFAULT_PROVIDER_CAPABILITIES: NewsletterProviderCapabilities = {
  signup: false,
  audienceDiscovery: false,
  connectionTest: false,
  sendTest: false,
  immediateSend: false,
  remoteScheduling: false,
  stats: false
};

export function createBlankNewsletter(): NewsletterDraft {
  return {
    title: "",
    subject: "",
    preheader: "",
    audience: "",
    leadStoryId: null,
    additionalStoryIds: [],
    sectionHeadings: [],
    intro: "",
    outro: "",
    providerId: null,
    status: "draft",
    scheduledAt: null,
    sentAt: null,
    providerExternalId: null,
    htmlSnapshot: null,
    plaintextSnapshot: null,
    deliveryStats: null,
    createdAt: null,
    updatedAt: null
  };
}
/**
 * Normalizes values before a save.  The API remains authoritative, but doing
 * this locally prevents duplicate story IDs and makes the editor predictable
 * when a user clicks an add action more than once.
 */
export function normalizeNewsletterDraft(value: NewsletterDraft): NewsletterDraft {
  const additionalStoryIds = Array.from(new Set(value.additionalStoryIds.filter((id) => Number.isInteger(id) && id > 0)));
  const leadStoryId = Number.isInteger(value.leadStoryId) && (value.leadStoryId as number) > 0 ? value.leadStoryId : null;

  return {
    ...value,
    title: value.title.trim(),
    subject: value.subject.trim(),
    preheader: value.preheader.trim(),
    audience: value.audience.trim(),
    intro: value.intro,
    outro: value.outro,
    sectionHeadings: value.sectionHeadings.map((heading) => heading.trim()).filter(Boolean),
    leadStoryId,
    additionalStoryIds: additionalStoryIds.filter((id) => id !== leadStoryId)
  };
}

/**
 * Adds a story without ever duplicating it.  A story moved into the lead slot
 * is removed from the additional list; an additional story never displaces an
 * existing lead.  This mirrors the idempotent server action contract.
 */
export function addStoryIdempotently(
  newsletter: NewsletterDraft,
  storyId: number,
  placement: NewsletterStoryPlacement
): NewsletterDraft {
  if (!Number.isInteger(storyId) || storyId <= 0) return newsletter;

  if (placement === "lead") {
    return {
      ...newsletter,
      leadStoryId: storyId,
      additionalStoryIds: newsletter.additionalStoryIds.filter((id) => id !== storyId)
    };
  }

  if (newsletter.leadStoryId === storyId || newsletter.additionalStoryIds.includes(storyId)) return newsletter;

  return {
    ...newsletter,
    additionalStoryIds: [...newsletter.additionalStoryIds, storyId]
  };
}

export function removeStory(newsletter: NewsletterDraft, storyId: number): NewsletterDraft {
  return {
    ...newsletter,
    leadStoryId: newsletter.leadStoryId === storyId ? null : newsletter.leadStoryId,
    additionalStoryIds: newsletter.additionalStoryIds.filter((id) => id !== storyId)
  };
}

export function orderedStoryIds(newsletter: Pick<Newsletter, "leadStoryId" | "additionalStoryIds">): number[] {
  return [
    ...(newsletter.leadStoryId ? [newsletter.leadStoryId] : []),
    ...newsletter.additionalStoryIds.filter((id) => id !== newsletter.leadStoryId)
  ];
}

export function newsletterStatusLabel(status: NewsletterStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

export function newsletterStatusDescription(status: NewsletterStatus): string {
  switch (status) {
    case "draft":
      return "This issue can be edited and prepared for delivery.";
    case "scheduled":
      return "This issue is waiting for its scheduled send time.";
    case "sending":
      return "The provider is processing this issue. Sending cannot be repeated from this screen.";
    case "sent":
      return "This issue was sent. Its saved snapshot will not change if stories are edited later.";
    case "failed":
      return "The provider did not complete delivery. Review the error and retry when ready.";
    case "cancelled":
      return "This scheduled issue was cancelled and can be prepared again.";
  }
}

/**
 * The server remains the authority for transitions.  This guard only controls
 * which buttons the UI offers, so a stale tab can still be handled as a normal
 * REST error rather than silently changing state.
 */
export function canTransitionNewsletter(from: NewsletterStatus, to: NewsletterStatus): boolean {
  const transitions: Record<NewsletterStatus, NewsletterStatus[]> = {
    draft: ["scheduled", "sending", "cancelled"],
    scheduled: ["draft", "sending", "cancelled"],
    sending: ["sent", "failed"],
    sent: [],
    failed: ["draft", "scheduled", "sending", "cancelled"],
    cancelled: ["draft", "scheduled"]
  };

  return transitions[from].includes(to);
}

export function availableNewsletterActions(
  newsletter: Pick<Newsletter, "status">,
  provider: NewsletterProvider | null | undefined
): NewsletterAction[] {
  if (!provider || !provider.configured || provider.connectionStatus === "unavailable") return [];

  const actions: NewsletterAction[] = [];
  const capabilities = { ...DEFAULT_PROVIDER_CAPABILITIES, ...provider.capabilities };

  if ((newsletter.status === "draft" || newsletter.status === "failed" || newsletter.status === "cancelled") && capabilities.sendTest) {
    actions.push("sendTest");
  }
  if ((newsletter.status === "draft" || newsletter.status === "failed" || newsletter.status === "cancelled") && capabilities.immediateSend) {
    actions.push("send");
  }
  if ((newsletter.status === "draft" || newsletter.status === "failed" || newsletter.status === "cancelled") && capabilities.remoteScheduling) {
    actions.push("schedule");
  }
  if (newsletter.status === "scheduled") actions.push("cancel");
  if (newsletter.status === "sent" && capabilities.stats) actions.push("stats");

  return actions;
}

export function providerCapabilityLabel(capability: NewsletterCapability): string {
  switch (capability) {
    case "signup":
      return "Public signup";
    case "audienceDiscovery":
      return "Audience discovery";
    case "connectionTest":
      return "Connection test";
    case "sendTest":
      return "Test send";
    case "immediateSend":
      return "Immediate send";
    case "remoteScheduling":
      return "Remote scheduling";
    case "stats":
      return "Delivery stats";
  }
}

export function providerStatusLabel(status: NewsletterConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Not connected";
    case "unknown":
      return "Status unavailable";
    case "unavailable":
      return "Provider unavailable";
  }
}

export function describeNewsletterError(error: unknown, fallback = "The newsletter service is unavailable right now."): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}
