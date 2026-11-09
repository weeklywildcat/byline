import { blueskyAtUri, parseSocialPostUrl, socialProviderLabel, type SocialPostUrl } from '@byline/article-body';

/**
 * Social Posts: a Byline facade with the permalink is already in the page.
 * Nothing from a provider is requested until a reader asks for that one post
 * ("Load Instagram post"): no frame, no script, no preconnect for a post the
 * reader scrolls past. Hovering or focusing the button may preconnect to that
 * provider's fixed origin. Activation then uses the provider's official
 * mechanism:
 *
 * - TikTok: the Embed Player iframe, `https://www.tiktok.com/player/v1/{id}`.
 * - Facebook: the documented post/video plugin iframes.
 * - Instagram and Threads: the post's own `/embed` frame (what each provider's
 *   embed script inserts), so no page-level script runs at all.
 * - X: `platform.twitter.com/widgets.js`, then `twttr.widgets.createTweet`
 *   into this block only (Do Not Track on).
 * - Bluesky: `embed.bsky.app/static/embed.js` with this post's AT-URI, scanned
 *   inside this block only.
 *
 * The address is re-validated by the one parser before anything is built
 * (`data-url` is never trusted as an iframe source). Each page script loads
 * at most once per document. Frames are lazy, sized before they load, and get
 * the narrowest sandbox, `allow` list and referrer policy that still let the
 * official embed work. If loading fails or times out the facade comes back
 * with an explanation; the permalink is never removed. Idempotent; the
 * cleanup restores the saved markup.
 */

const TIMEOUT_MS = 12000;
const SCRIPTS: Partial<Record<SocialPostUrl['provider'], string>> = {
  x: 'https://platform.twitter.com/widgets.js',
  bluesky: 'https://embed.bsky.app/static/embed.js'
};
const ORIGINS: Record<SocialPostUrl['provider'], string> = {
  instagram: 'https://www.instagram.com',
  threads: 'https://www.threads.com',
  facebook: 'https://www.facebook.com',
  tiktok: 'https://www.tiktok.com',
  x: 'https://platform.twitter.com',
  bluesky: 'https://embed.bsky.app'
};
/** Frame permissions: scripts and the provider's own origin (its embeds need its cookies), popups that open normally. Nothing else. */
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';

type Frame = { src: string; allow?: string };

/** The official iframe for a post, or null when the provider needs its page script instead. */
export function socialEmbedFrame(post: SocialPostUrl): Frame | null {
  switch (post.provider) {
    case 'tiktok':
      return { src: `https://www.tiktok.com/player/v1/${post.postId}?description=1&music_info=1&rel=0`, allow: 'fullscreen; encrypted-media; picture-in-picture' };
    case 'facebook': {
      const plugin = post.kind === 'video' ? 'video' : 'post';
      return { src: `https://www.facebook.com/plugins/${plugin}.php?href=${encodeURIComponent(post.url)}&show_text=true&width=500`, allow: post.kind === 'video' ? 'encrypted-media; picture-in-picture; fullscreen' : undefined };
    }
    case 'instagram':
      return { src: `${post.url}embed/captioned/` };
    case 'threads':
      return { src: `${post.url}/embed` };
    default:
      return null;
  }
}

type Twttr = { widgets?: { createTweet?: (id: string, target: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLElement | undefined> } };
type Bluesky = { scan?: (node?: Element) => void };

const scripts = new WeakMap<Document, Map<string, Promise<void>>>();

/** One provider script per document, from its fixed official origin only. */
function loadScript(document: Document, src: string, signal: AbortSignal): Promise<void> {
  let loaded = scripts.get(document);
  if (!loaded) scripts.set(document, (loaded = new Map()));
  const existing = loaded.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.charset = 'utf-8';
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => {
      loaded!.delete(src);
      script.remove();
      reject(new Error('script failed'));
    }, { once: true });
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    document.head.append(script);
  });
  loaded.set(src, promise);
  return promise;
}

const preconnected = new WeakMap<Document, Set<string>>();
function preconnect(document: Document, origin: string) {
  let done = preconnected.get(document);
  if (!done) preconnected.set(document, (done = new Set()));
  if (done.has(origin)) return;
  done.add(origin);
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = '';
  document.head.append(link);
}

function timeout<T>(promise: Promise<T>, view: Window, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = view.setTimeout(() => reject(new Error('timed out')), ms);
    promise.then((value) => { view.clearTimeout(timer); resolve(value); }, (error) => { view.clearTimeout(timer); reject(error); });
  });
}

async function embed(post: SocialPostUrl, target: HTMLElement, signal: AbortSignal): Promise<void> {
  const document = target.ownerDocument;
  const view = document.defaultView!;
  const frame = socialEmbedFrame(post);
  if (frame) {
    const iframe = document.createElement('iframe');
    iframe.src = frame.src;
    iframe.title = `${socialProviderLabel(post.provider)} post`;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('sandbox', FRAME_SANDBOX);
    if (frame.allow) iframe.allow = frame.allow;
    iframe.setAttribute('scrolling', 'no');
    const loaded = new Promise<void>((resolve, reject) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
      iframe.addEventListener('error', () => reject(new Error('frame failed')), { once: true });
    });
    target.append(iframe);
    await timeout(loaded, view);
    return;
  }
  if (post.provider === 'x') {
    await timeout(loadScript(document, SCRIPTS.x!, signal), view);
    const twttr = (view as unknown as { twttr?: Twttr }).twttr;
    const created = await timeout(twttr?.widgets?.createTweet?.(post.postId, target, { dnt: true, conversation: 'none' }) ?? Promise.reject(new Error('no widgets')), view);
    if (!created) throw new Error('post unavailable');
    return;
  }
  if (post.provider === 'bluesky') {
    const uri = blueskyAtUri(post.postId);
    if (!uri) throw new Error('bad post');
    const quote = document.createElement('blockquote');
    quote.className = 'bluesky-embed';
    quote.dataset.blueskyUri = uri;
    const link = document.createElement('a');
    link.href = post.url;
    link.textContent = 'View the post on Bluesky';
    quote.append(link);
    target.append(quote);
    await timeout(loadScript(document, SCRIPTS.bluesky!, signal), view);
    (view as unknown as { bluesky?: Bluesky }).bluesky?.scan?.(target);
    // The script swaps the blockquote for its frame; wait for that frame to load.
    await timeout(new Promise<void>((resolve, reject) => {
      const check = () => {
        const iframe = target.querySelector('iframe');
        if (iframe) {
          iframe.addEventListener('load', () => resolve(), { once: true });
          return true;
        }
        return false;
      };
      if (check()) return;
      const observer = new view.MutationObserver(() => { if (check()) observer.disconnect(); });
      observer.observe(target, { childList: true, subtree: true });
      signal.addEventListener('abort', () => { observer.disconnect(); reject(new Error('aborted')); }, { once: true });
    }), view);
  }
}

function enhance(figure: HTMLElement, signal: AbortSignal, preview: boolean): (() => void) | null {
  const post = parseSocialPostUrl(figure.dataset.url);
  // Only a canonical, supported address that matches what the page says it is.
  if (!post.ok || post.url !== figure.dataset.url || post.provider !== figure.dataset.provider) return null;
  const frame = figure.querySelector<HTMLElement>('.byline-social-frame');
  const facade = frame?.querySelector<HTMLElement>('.byline-social-facade');
  if (!frame || !facade || preview) return null;
  const document = figure.ownerDocument;
  const label = socialProviderLabel(post.provider);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'byline-social-load';
  button.textContent = `Load ${label} post`;
  const error = document.createElement('p');
  error.className = 'byline-social-error';
  error.setAttribute('role', 'status');
  error.hidden = true;
  facade.append(button, error);
  const warm = () => preconnect(document, ORIGINS[post.provider]);
  button.addEventListener('pointerenter', warm, { signal, once: true });
  button.addEventListener('focus', warm, { signal, once: true });

  let target: HTMLElement | null = null;
  const restore = (message?: string) => {
    target?.remove();
    target = null;
    frame.dataset.state = 'facade';
    facade.hidden = false;
    button.disabled = false;
    button.textContent = `Load ${label} post`;
    error.hidden = !message;
    error.textContent = message ?? '';
  };
  button.addEventListener('click', () => {
    if (target) return;
    button.disabled = true;
    button.textContent = `Loading ${label} post…`;
    error.hidden = true;
    frame.dataset.state = 'loading';
    target = document.createElement('div');
    target.className = 'byline-social-embed';
    frame.append(target);
    embed(post, target, signal).then(() => {
      if (!target) return;
      frame.dataset.state = 'loaded';
      facade.hidden = true;
    }, () => {
      if (signal.aborted) return;
      restore(`The post did not load from ${label}. Use the link below to open it there.`);
      button.focus();
    });
  }, { signal });

  return () => {
    restore();
    button.remove();
    error.remove();
  };
}

/** Enhances every Social Post in `root`. Returns its cleanup. */
export function enhanceSocialPosts(root: HTMLElement, signal: AbortSignal, preview = false): () => void {
  const cleanups: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>('.byline-social-post').forEach((figure) => {
    if (figure.dataset.socialEnhanced === 'true') return;
    const undo = enhance(figure, signal, preview);
    if (!undo) return;
    figure.dataset.socialEnhanced = 'true';
    cleanups.push(() => { undo(); delete figure.dataset.socialEnhanced; });
  });
  return () => cleanups.forEach((fn) => fn());
}
