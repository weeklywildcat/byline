import type { SocialProvider } from "./types";

/**
 * The one Social Post URL boundary. A writer pastes a permalink; this decides
 * whether it is a public post from a supported provider and, if so, returns
 * the provider, the post's stable identifier and a canonical permalink. The
 * editor, readiness, the runtime validator and the browser enhancer all call
 * it, so a stored address is re-derived wherever it is used and nothing a
 * provider returns (HTML, scripts) is ever trusted or stored.
 *
 * Rules: HTTPS only; an exact host allowlist per provider (no suffix
 * matching, so `instagram.com.example.net` and `evil-x.com` are rejected); no
 * credentials or ports; only post URL shapes (profiles, feeds, stories and
 * short-link redirectors are rejected with a reason). Tracking parameters and
 * fragments never survive canonicalization.
 */

export type SocialPostKind = "post" | "video";

export type SocialPostUrl = {
  ok: true;
  provider: SocialProvider;
  /** The provider's stable post identifier (Bluesky: `actor/rkey`). */
  postId: string;
  /** The canonical permalink: what the article stores and links to. */
  url: string;
  /** Facebook and Instagram distinguish videos and reels from posts. */
  kind: SocialPostKind;
};

export type SocialPostUrlProblem = {
  ok: false;
  code: "empty" | "not-url" | "not-https" | "youtube" | "profile" | "shortlink" | "unsupported";
  message: string;
};

export const SOCIAL_PROVIDERS: Record<SocialProvider, { label: string; origin: string }> = {
  instagram: { label: "Instagram", origin: "https://www.instagram.com" },
  threads: { label: "Threads", origin: "https://www.threads.com" },
  facebook: { label: "Facebook", origin: "https://www.facebook.com" },
  tiktok: { label: "TikTok", origin: "https://www.tiktok.com" },
  x: { label: "X", origin: "https://x.com" },
  bluesky: { label: "Bluesky", origin: "https://bsky.app" }
};

export const SOCIAL_PROVIDER_LIST: readonly SocialProvider[] = ["instagram", "threads", "facebook", "tiktok", "x", "bluesky"];

export function socialProviderLabel(provider: string): string {
  return provider in SOCIAL_PROVIDERS ? SOCIAL_PROVIDERS[provider as SocialProvider].label : "Social";
}

const HOSTS: Record<string, SocialProvider | "youtube"> = {
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "threads.net": "threads",
  "www.threads.net": "threads",
  "threads.com": "threads",
  "www.threads.com": "threads",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "web.facebook.com": "facebook",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "m.tiktok.com": "tiktok",
  "x.com": "x",
  "www.x.com": "x",
  "mobile.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "mobile.twitter.com": "x",
  "bsky.app": "bluesky",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "music.youtube.com": "youtube",
  "youtu.be": "youtube",
  "www.youtube-nocookie.com": "youtube"
};

/** Short links redirect somewhere we cannot see without a network request; the writer copies the full address instead. */
const SHORTLINK_HOSTS: Record<string, string> = {
  "fb.watch": "Facebook",
  "fb.me": "Facebook",
  "vm.tiktok.com": "TikTok",
  "vt.tiktok.com": "TikTok",
  "t.co": "X",
  "instagr.am": "Instagram"
};

const SUPPORTED = "Paste a public Instagram, Threads, Facebook, TikTok, X or Bluesky post.";

const problem = (code: SocialPostUrlProblem["code"], message: string): SocialPostUrlProblem => ({ ok: false, code, message });
const found = (provider: SocialProvider, postId: string, url: string, kind: SocialPostKind = "post"): SocialPostUrl => ({ ok: true, provider, postId, url, kind });

const INSTAGRAM_POST = /^\/(?:[A-Za-z0-9._]{1,30}\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?$/;
const THREADS_POST = /^\/@([A-Za-z0-9._]{1,30})\/post\/([A-Za-z0-9_-]{5,64})\/?$/;
const TIKTOK_VIDEO = /^\/@([A-Za-z0-9._]{2,40})\/video\/(\d{8,25})\/?$/;
const X_STATUS = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:\/(?:photo|video)\/\d)?\/?$/;
const X_ANON_STATUS = /^\/i\/(?:web\/)?status\/(\d{1,25})\/?$/;
const BLUESKY_POST = /^\/profile\/((?:did:plc:[a-z2-7]{24})|(?:did:web:[A-Za-z0-9.-]{1,253})|(?:[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+))\/post\/([a-z2-7]{13})\/?$/;
const FACEBOOK_SLUG = "[A-Za-z0-9.\\-]{1,80}";
const FACEBOOK_POST = new RegExp(`^/(${FACEBOOK_SLUG})/posts/((?:pfbid[A-Za-z0-9]{10,80})|\\d{5,25})/?$`);
const FACEBOOK_VIDEO = new RegExp(`^/(${FACEBOOK_SLUG})/videos/(?:[A-Za-z0-9.\\-]{1,120}/)?(\\d{5,25})/?$`);
const FACEBOOK_REEL = /^\/reel\/(\d{5,25})\/?$/;
const NUMERIC = /^\d{5,25}$/;

function parseFacebook(url: URL): SocialPostUrl | SocialPostUrlProblem {
  const path = url.pathname;
  let match: RegExpMatchArray | null;
  if ((match = path.match(FACEBOOK_POST))) return found("facebook", match[2]!, `https://www.facebook.com/${match[1]}/posts/${match[2]}`);
  if ((match = path.match(FACEBOOK_VIDEO))) return found("facebook", match[2]!, `https://www.facebook.com/${match[1]}/videos/${match[2]}/`, "video");
  if ((match = path.match(FACEBOOK_REEL))) return found("facebook", match[1]!, `https://www.facebook.com/reel/${match[1]}`, "video");
  if (/^\/watch\/?$/.test(path) && NUMERIC.test(url.searchParams.get("v") ?? "")) {
    const id = url.searchParams.get("v")!;
    return found("facebook", id, `https://www.facebook.com/watch/?v=${id}`, "video");
  }
  if (/^\/permalink\.php$/.test(path) && /^(?:pfbid[A-Za-z0-9]{10,80}|\d{5,25})$/.test(url.searchParams.get("story_fbid") ?? "") && NUMERIC.test(url.searchParams.get("id") ?? "")) {
    const story = url.searchParams.get("story_fbid")!;
    return found("facebook", story, `https://www.facebook.com/permalink.php?story_fbid=${story}&id=${url.searchParams.get("id")}`);
  }
  if (/^\/(?:photo\/?|photo\.php)$/.test(path) && NUMERIC.test(url.searchParams.get("fbid") ?? "")) {
    const id = url.searchParams.get("fbid")!;
    return found("facebook", id, `https://www.facebook.com/photo/?fbid=${id}`);
  }
  if (/^\/share\//.test(path)) return problem("shortlink", "Facebook share links can't be embedded. Open the post, then copy the address from the browser.");
  if (new RegExp(`^/(?:profile\\.php|${FACEBOOK_SLUG})/?$`).test(path)) return problem("profile", "That is a Facebook page or profile, not a post. Paste the address of one post.");
  return problem("unsupported", "That Facebook address isn't a public post, video or reel.");
}

/**
 * A pasted address as a supported public post, or the reason it is not.
 * Pure: no network, no provider requests.
 */
export function parseSocialPostUrl(input: unknown): SocialPostUrl | SocialPostUrlProblem {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return problem("empty", SUPPORTED);
  if (raw.length > 2048) return problem("not-url", "That address is too long to be a post.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return problem("not-url", `That isn't a web address. ${SUPPORTED}`);
  }
  if (url.protocol === "http:") return problem("not-https", "Use the secure https:// address of the post.");
  if (url.protocol !== "https:") return problem("not-url", `That isn't a web address. ${SUPPORTED}`);
  if (url.username || url.password || url.port) return problem("unsupported", `That address isn't allowed. ${SUPPORTED}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host in SHORTLINK_HOSTS) return problem("shortlink", `${SHORTLINK_HOSTS[host]} short links can't be embedded. Open the post, then copy its full address.`);
  const provider = HOSTS[host];
  if (!provider) return problem("unsupported", `That site isn't supported. ${SUPPORTED}`);
  if (provider === "youtube") return problem("youtube", "YouTube videos go in a Video block, which plays them with captions. Use Video instead.");
  const path = url.pathname;
  let match: RegExpMatchArray | null;
  switch (provider) {
    case "instagram": {
      if ((match = path.match(INSTAGRAM_POST))) {
        const video = match[1] === "reel" || match[1] === "reels";
        return found("instagram", match[2]!, `https://www.instagram.com/${video ? "reel" : "p"}/${match[2]}/`, video ? "video" : "post");
      }
      if (/^\/stories\//.test(path)) return problem("unsupported", "Instagram stories disappear and can't be embedded. Paste a post or reel.");
      if (/^\/[A-Za-z0-9._]{1,30}\/?$/.test(path)) return problem("profile", "That is an Instagram profile, not a post. Paste the address of one post or reel.");
      return problem("unsupported", "That Instagram address isn't a public post or reel.");
    }
    case "threads": {
      if ((match = path.match(THREADS_POST))) return found("threads", match[2]!, `https://www.threads.com/@${match[1]}/post/${match[2]}`);
      if (/^\/@[A-Za-z0-9._]{1,30}\/?$/.test(path)) return problem("profile", "That is a Threads profile, not a post. Paste the address of one post.");
      return problem("unsupported", "That Threads address isn't a public post.");
    }
    case "facebook":
      return parseFacebook(url);
    case "tiktok": {
      if ((match = path.match(TIKTOK_VIDEO))) return found("tiktok", match[2]!, `https://www.tiktok.com/@${match[1]}/video/${match[2]}`, "video");
      if (/^\/@[A-Za-z0-9._]{2,40}\/?$/.test(path)) return problem("profile", "That is a TikTok profile, not a video. Paste the address of one video.");
      return problem("unsupported", "That TikTok address isn't a public video.");
    }
    case "x": {
      if ((match = path.match(X_STATUS))) return found("x", match[2]!, `https://x.com/${match[1]}/status/${match[2]}`);
      if ((match = path.match(X_ANON_STATUS))) return found("x", match[1]!, `https://x.com/i/status/${match[1]}`);
      if (/^\/[A-Za-z0-9_]{1,15}\/?$/.test(path)) return problem("profile", "That is an X profile, not a post. Paste the address of one post.");
      return problem("unsupported", "That X address isn't a public post.");
    }
    case "bluesky": {
      if ((match = path.match(BLUESKY_POST))) {
        const actor = match[1]!.toLowerCase().startsWith("did:") ? match[1]! : match[1]!.toLowerCase();
        return found("bluesky", `${actor}/${match[2]}`, `https://bsky.app/profile/${actor}/post/${match[2]}`);
      }
      if (/^\/profile\/[^/]+\/?$/.test(path)) return problem("profile", "That is a Bluesky profile, not a post. Paste the address of one post.");
      return problem("unsupported", "That Bluesky address isn't a public post.");
    }
  }
}

/** Whether a stored permalink is already canonical (the validator's check). */
export function isCanonicalSocialPost(url: unknown, provider?: unknown, postId?: unknown): boolean {
  const parsed = parseSocialPostUrl(url);
  return parsed.ok && parsed.url === url && (provider === undefined || parsed.provider === provider) && (postId === undefined || parsed.postId === postId);
}

/** The Bluesky AT-URI an official Bluesky embed needs, from a parsed post id (`actor/rkey`). */
export function blueskyAtUri(postId: string): string | null {
  const [actor, rkey] = postId.split("/");
  return actor && rkey ? `at://${actor}/app.bsky.feed.post/${rkey}` : null;
}
