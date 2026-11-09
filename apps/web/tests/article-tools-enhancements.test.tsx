// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARTICLE_BODY_FORMAT, type ArticleBlock, type ArticleBody } from "@byline/article-body";
import { FIXTURE_BLOCKS, FIXTURE_MEDIA } from "@byline/article-body/fixtures";
import { StructuredArticleBody } from "@byline/ui/article-body";
import { enhanceArticleStory, enhanceSocialPosts, socialEmbedFrame } from "@byline/ui/article-enhancements";
import { articleEnhancementSelector } from "@byline/ui/article-enhancement-selector";
import { parseSocialPostUrl } from "@byline/article-body";

const mount = (...nodes: ArticleBlock[]) => {
  const body: ArticleBody = { format: ARTICLE_BODY_FORMAT, version: 1, media: FIXTURE_MEDIA, nodes };
  document.body.innerHTML = renderToStaticMarkup(<div className="byline-article-view"><StructuredArticleBody body={body} /></div>);
  return document.querySelector<HTMLElement>(".article-body")!;
};
const post = (url: string): ArticleBlock => {
  const parsed = parseSocialPostUrl(url);
  if (!parsed.ok) throw new Error(url);
  return { type: "socialPost", id: `s-${parsed.provider}-${parsed.postId.length}`, url: parsed.url, provider: parsed.provider, postId: parsed.postId };
};

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("Social Post enhancement", () => {
  it("asks the enhancer for social posts and chapters only where they exist", () => {
    expect(mount(FIXTURE_BLOCKS.socialPost).querySelector(articleEnhancementSelector)).not.toBeNull();
    expect(mount(FIXTURE_BLOCKS.keyFacts).querySelector(articleEnhancementSelector)).toBeNull();
  });

  it("requests nothing from a provider until a reader asks, then loads the official frame once", () => {
    const root = mount(post("https://www.tiktok.com/@greenwood.hs/video/7301234567890123456"), FIXTURE_BLOCKS.socialPost);
    const cleanup = enhanceArticleStory(root);
    expect(document.querySelectorAll("iframe, script, link[rel=preconnect]")).toHaveLength(0);
    const buttons = root.querySelectorAll<HTMLButtonElement>(".byline-social-load");
    expect([...buttons].map((button) => button.textContent)).toEqual(["Load TikTok post", "Load Instagram post"]);
    buttons[0]!.dispatchEvent(new Event("focus"));
    expect(document.querySelectorAll('link[rel=preconnect][href="https://www.tiktok.com"]')).toHaveLength(1);
    buttons[0]!.click();
    const frame = root.querySelector<HTMLIFrameElement>(".byline-social-post iframe")!;
    expect(frame.src).toBe("https://www.tiktok.com/player/v1/7301234567890123456?description=1&music_info=1&rel=0");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    expect(frame.referrerPolicy).toBe("strict-origin-when-cross-origin");
    expect(frame.loading).toBe("lazy");
    expect(frame.allow).not.toContain("autoplay");
    // The permalink is never removed.
    expect(root.querySelectorAll(".byline-social-link a")).toHaveLength(2);
    // Idempotent: a second run adds nothing.
    expect(enhanceArticleStory(root)).toBe(cleanup);
    cleanup();
    expect(root.querySelector("iframe")).toBeNull();
    expect(root.querySelector(".byline-social-load")).toBeNull();
  });

  it("restores the facade and keeps the permalink when a post does not load", async () => {
    vi.useFakeTimers();
    const root = mount(FIXTURE_BLOCKS.socialPost);
    const controller = new AbortController();
    enhanceSocialPosts(root, controller.signal);
    root.querySelector<HTMLButtonElement>(".byline-social-load")!.click();
    expect(root.querySelector(".byline-social-frame")?.getAttribute("data-state")).toBe("loading");
    await vi.advanceTimersByTimeAsync(13000);
    expect(root.querySelector(".byline-social-frame")?.getAttribute("data-state")).toBe("facade");
    expect(root.querySelector("iframe")).toBeNull();
    expect(root.querySelector(".byline-social-error")?.textContent).toContain("did not load from Instagram");
    expect(root.querySelector(".byline-social-link a")?.getAttribute("href")).toBe("https://www.instagram.com/p/C0ffEeLunch1/");
    controller.abort();
  });

  it("loads one provider script per document for X, from its fixed origin, only after activation", () => {
    const root = mount(post("https://x.com/GreenwoodHS/status/1850000000000000000"), post("https://x.com/GreenwoodHS/status/1850000000000000001"));
    enhanceSocialPosts(root, new AbortController().signal);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    root.querySelectorAll<HTMLButtonElement>(".byline-social-load").forEach((button) => button.click());
    const scripts = document.querySelectorAll<HTMLScriptElement>("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe("https://platform.twitter.com/widgets.js");
  });

  it("never trusts a tampered address as a frame source, and keeps the private preview on its facade", () => {
    const root = mount(FIXTURE_BLOCKS.socialPost);
    root.querySelector<HTMLElement>(".byline-social-post")!.dataset.url = "https://evil.example/p/x/";
    enhanceSocialPosts(root, new AbortController().signal);
    expect(root.querySelector(".byline-social-load")).toBeNull();
    const preview = mount(FIXTURE_BLOCKS.socialPost);
    enhanceArticleStory(preview, { preview: true });
    expect(preview.querySelector(".byline-social-load")).toBeNull();
  });

  it("builds only the documented embed addresses", () => {
    const frame = (url: string) => {
      const parsed = parseSocialPostUrl(url);
      return parsed.ok ? socialEmbedFrame(parsed)?.src : null;
    };
    expect(frame("https://www.facebook.com/reel/987654321012345")).toBe("https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Freel%2F987654321012345&show_text=true&width=500");
    expect(frame("https://www.instagram.com/p/C0ffEeLunch1/")).toBe("https://www.instagram.com/p/C0ffEeLunch1/embed/captioned/");
    expect(frame("https://www.threads.net/@greenwood.hs/post/C9xYz12AbcD")).toBe("https://www.threads.com/@greenwood.hs/post/C9xYz12AbcD/embed");
    expect(frame("https://bsky.app/profile/greenwood.bsky.social/post/3kxyzabcdefgh")).toBeUndefined();
  });
});

describe("media chapters", () => {
  it("seek the block's own audio and re-cue the video without autoplay", () => {
    const root = mount(FIXTURE_BLOCKS.audio, FIXTURE_BLOCKS.video);
    enhanceArticleStory(root);
    const audio = root.querySelector("audio")!;
    const play = vi.spyOn(audio, "play").mockResolvedValue(undefined);
    root.querySelector<HTMLAnchorElement>('.byline-audio a[data-byline-seek="42"]')!.click();
    expect(audio.currentTime).toBe(42);
    expect(play).toHaveBeenCalled();
    root.querySelector<HTMLAnchorElement>('.byline-video a[data-byline-seek="84"]')!.click();
    const frame = root.querySelector<HTMLIFrameElement>(".byline-video iframe")!;
    expect(frame.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=84");
    expect(root.querySelector('.byline-video a[data-byline-seek="84"]')?.getAttribute("aria-current")).toBe("true");
  });
});
