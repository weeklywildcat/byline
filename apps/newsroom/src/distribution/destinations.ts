import { parseSocialPostUrl } from "@byline/article-body";
import { parseYouTubeVideoId, youTubeWatchUrl } from "@byline/core";

/**
 * Distribution destinations (docs/distribution.md): where the newsroom
 * promotes its own published Stories. Provider-neutral and pure: no account
 * IDs, no credentials, no network. Which destinations a publication uses, and
 * its account addresses, are Distribution settings (`settings.ts`); whether a
 * destination is automated is the adapter boundary (`adapters.ts`). A
 * destination without an adapter is manual, and fully usable.
 */

export const DESTINATION_KINDS = ["instagram", "facebook", "newsletter", "school-tvs", "discord", "youtube", "other"] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const isDestinationKind = (value: unknown): value is DestinationKind => typeof value === "string" && (DESTINATION_KINDS as readonly string[]).includes(value);

/** What a destination's pending text is built from while it still inherits the Story. */
export type StoryFacts = { headline: string; deck: string; url: string | null };

/**
 * One text slot of a destination (Facebook's headline, Instagram's caption).
 * While it inherits, its value is `inherit(story)`; choosing Custom breaks
 * inheritance for that slot only.
 */
export type TextSlot = {
  label: string;
  /** A short name for "Using Story caption" in summaries. */
  noun: string;
  inherit: (story: StoryFacts) => string;
  required: boolean;
  max: number;
  /** One line (a headline) or several (a caption). */
  multiline: boolean;
};

/** How a final address is checked: a provider's post permalink, a video, a message link, any https page, or none. */
export type PermalinkRule = "instagram" | "facebook" | "youtube" | "discord" | "web" | "none";

export type DestinationDescriptor = {
  kind: DestinationKind;
  label: string;
  headline: TextSlot | null;
  text: TextSlot | null;
  /** Image: required (Instagram), optional (inherits the featured image), or not used. */
  media: "required" | "optional" | "none";
  permalink: PermalinkRule;
  /** A valid final address is what makes it Posted (no separate "Mark posted"). */
  requiresPermalink: boolean;
  /** The work can be recorded as scheduled on the platform (manually, or by an adapter). */
  supportsScheduling: boolean;
  /** Promotion of a Story needs its public URL. No destination supports pre-publication work yet. */
  requiresPublishedStory: boolean;
  /** What the newsroom does there, and what the result is called. */
  verb: string;
  postedLabel: string;
  /** Where "Open …" goes when the publication has not set an account address. */
  home: string | null;
};

export const joined = (...parts: Array<string | null | undefined>) => parts.map((part) => (part ?? "").trim()).filter(Boolean).join("\n\n");
const headlineSlot = (label = "Headline", max = 300): TextSlot => ({ label, noun: label.toLowerCase(), inherit: (story) => story.headline.trim(), required: true, max, multiline: false });

export const DESTINATIONS: Record<DestinationKind, DestinationDescriptor> = {
  instagram: {
    kind: "instagram", label: "Instagram",
    headline: null,
    // Links in Instagram captions are not clickable, so the caption does not carry the URL.
    text: { label: "Caption", noun: "caption", inherit: (story) => joined(story.headline, story.deck), required: true, max: 2200, multiline: true },
    media: "required", permalink: "instagram", requiresPermalink: true, supportsScheduling: true, requiresPublishedStory: true,
    verb: "Post", postedLabel: "Posted", home: "https://www.instagram.com/"
  },
  facebook: {
    kind: "facebook", label: "Facebook",
    headline: headlineSlot(),
    text: { label: "Description", noun: "description", inherit: (story) => story.deck.trim(), required: false, max: 2000, multiline: true },
    media: "optional", permalink: "facebook", requiresPermalink: true, supportsScheduling: true, requiresPublishedStory: true,
    verb: "Post", postedLabel: "Posted", home: "https://www.facebook.com/"
  },
  newsletter: {
    kind: "newsletter", label: "Newsletter",
    headline: headlineSlot(),
    text: { label: "Blurb", noun: "blurb", inherit: (story) => story.deck.trim(), required: false, max: 600, multiline: true },
    media: "optional", permalink: "none", requiresPermalink: false, supportsScheduling: false, requiresPublishedStory: true,
    verb: "Send", postedLabel: "Sent", home: null
  },
  "school-tvs": {
    kind: "school-tvs", label: "School TVs",
    headline: headlineSlot("Headline", 120),
    text: null,
    media: "required", permalink: "none", requiresPermalink: false, supportsScheduling: true, requiresPublishedStory: true,
    verb: "Put on screens", postedLabel: "On screens", home: null
  },
  discord: {
    kind: "discord", label: "Discord",
    headline: null,
    text: { label: "Message", noun: "message", inherit: (story) => joined(story.headline, story.url), required: true, max: 2000, multiline: true },
    media: "none", permalink: "discord", requiresPermalink: false, supportsScheduling: false, requiresPublishedStory: true,
    verb: "Post", postedLabel: "Posted", home: null
  },
  youtube: {
    kind: "youtube", label: "YouTube",
    headline: headlineSlot("Title", 100),
    text: { label: "Description", noun: "description", inherit: (story) => joined(story.deck, story.url), required: false, max: 5000, multiline: true },
    media: "none", permalink: "youtube", requiresPermalink: true, supportsScheduling: true, requiresPublishedStory: true,
    verb: "Upload", postedLabel: "Posted", home: "https://studio.youtube.com/"
  },
  other: {
    kind: "other", label: "Other",
    headline: null,
    text: { label: "Text", noun: "text", inherit: (story) => joined(story.headline, story.deck, story.url), required: false, max: 5000, multiline: true },
    media: "optional", permalink: "web", requiresPermalink: false, supportsScheduling: true, requiresPublishedStory: true,
    verb: "Share", postedLabel: "Done", home: null
  }
};

export type PermalinkResult = { ok: true; url: string } | { ok: false; message: string };

const OWN_HOSTS = {
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  facebook: new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"])
};
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);
const DISCORD_MESSAGE = /^\/channels\/(\d{5,25})\/(\d{5,25})\/(\d{5,25})\/?$/;

/**
 * A final address for this destination, canonicalized, or the reason it is
 * not one. Instagram and Facebook use the one Social Post parser
 * (`@byline/article-body`), so hostname and path rules are never duplicated;
 * only the messages are Distribution's ("for this destination").
 */
export function validatePermalink(kind: DestinationKind, input: unknown): PermalinkResult {
  const rule = DESTINATIONS[kind].permalink;
  const label = DESTINATIONS[kind].label;
  const raw = typeof input === "string" ? input.trim() : "";
  const wrongPlace = (noun = "post") => ({ ok: false as const, message: `Paste the ${label} ${noun} URL for this destination.` });
  if (rule === "none") return { ok: false, message: `${label} has no final address.` };
  if (!raw) return wrongPlace(rule === "youtube" ? "video" : rule === "discord" ? "message" : rule === "web" ? "page" : "post");
  if (rule === "instagram" || rule === "facebook") {
    const parsed = parseSocialPostUrl(raw);
    if (parsed.ok) return parsed.provider === rule ? { ok: true, url: parsed.url } : wrongPlace();
    if (parsed.code === "profile" || parsed.code === "not-https") return { ok: false, message: parsed.message };
    if (parsed.code === "shortlink") return { ok: false, message: `Open the ${label} post, then copy its full address from the browser.` };
    // This provider's own address that is not a post keeps the parser's reason; anything else is the wrong place.
    let host = "";
    try { host = new URL(raw).hostname.toLowerCase(); } catch { /* not a URL */ }
    return parsed.code === "unsupported" && OWN_HOSTS[rule].has(host) ? { ok: false, message: parsed.message } : wrongPlace();
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return wrongPlace(rule === "youtube" ? "video" : rule === "discord" ? "message" : "page");
  }
  if (url.protocol !== "https:") return { ok: false, message: "Use the secure https:// address." };
  if (url.username || url.password || url.port) return { ok: false, message: "That address isn't allowed." };
  if (rule === "youtube") {
    const id = parseYouTubeVideoId(raw);
    return id ? { ok: true, url: youTubeWatchUrl(id) } : wrongPlace("video");
  }
  if (rule === "discord") {
    const match = url.pathname.match(DISCORD_MESSAGE);
    return DISCORD_HOSTS.has(url.hostname.toLowerCase()) && match ? { ok: true, url: `https://discord.com/channels/${match[1]}/${match[2]}/${match[3]}` } : wrongPlace("message");
  }
  if (raw.length > 2000 || /[\u0000-\u001f\u007f\s]/.test(raw)) return wrongPlace("page");
  url.hash = "";
  return { ok: true, url: url.toString() };
}

/** "Paste Instagram post URL" */
export function permalinkPlaceholder(kind: DestinationKind): string {
  const { permalink, label } = DESTINATIONS[kind];
  return permalink === "youtube" ? "Paste the YouTube video URL" : permalink === "discord" ? "Paste the Discord message link" : permalink === "web" ? "Paste the address where it went out" : `Paste the ${label} post URL`;
}
