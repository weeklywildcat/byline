import { visualizationHeight } from './visualization';

/**
 * The Interactive block's frame contract, shared by the editor preview, the
 * public enhancer and (by a contract test) the PHP renderer in
 * `wordpress-plugin/includes/content/interactive-block.php`.
 *
 * An interactive is one self-contained HTML file. It is printed as the
 * `srcdoc` of an iframe sandboxed with `allow-scripts` and nothing else: the
 * document gets an opaque origin, so it cannot read the article, its cookies
 * or storage, cannot navigate the page, open windows, submit forms or show
 * dialogs. It can only run its own scripts and post messages, and the one
 * message the page listens for is its height.
 */
export const INTERACTIVE_SANDBOX = 'allow-scripts';

/** The largest HTML file an Interactive block accepts, in bytes of UTF-8. */
export const INTERACTIVE_MAX_BYTES = 512 * 1024;

/** A frame's height is kept within these bounds, in CSS pixels. */
export const INTERACTIVE_MIN_HEIGHT = 120;
export const INTERACTIVE_MAX_HEIGHT = 4000;

/**
 * Appended to every interactive. It reports the document's height to the
 * page whenever it changes, and again when the page asks (the page's listener
 * may start after the frame has loaded). Keep it byte-identical to
 * `BYLINE_INTERACTIVE_RESIZE_SCRIPT` in PHP.
 */
export const INTERACTIVE_RESIZE_SCRIPT = '<script>(function(){var last=0;function post(force){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(force||h!==last){last=h;parent.postMessage({bylineInteractive:"height",height:h},"*");}}if(window.ResizeObserver){new ResizeObserver(function(){post(false);}).observe(document.documentElement);}addEventListener("load",function(){post(false);});addEventListener("message",function(e){if(e.source===parent&&e.data==="bylineInteractive:measure"){post(true);}});post(true);})();</script>';

/** The message the page sends a frame to ask for its height again. */
export const INTERACTIVE_MEASURE_MESSAGE = 'bylineInteractive:measure';

/** The frame's height before the interactive reports its own: one of the Chart / Map presets. */
export function interactiveInitialHeight(preset: string): number {
  return visualizationHeight(preset);
}

/** The frame document: the uploaded HTML with the resize reporter appended. */
export function interactiveSrcdoc(html: string): string {
  return html + INTERACTIVE_RESIZE_SCRIPT;
}

/** A height message from a frame, clamped to the bounds; null for anything else. */
export function interactiveMessageHeight(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.bylineInteractive !== 'height') return null;
  const height = message.height;
  if (typeof height !== 'number' || !Number.isFinite(height) || height < 0) return null;
  return Math.min(INTERACTIVE_MAX_HEIGHT, Math.max(INTERACTIVE_MIN_HEIGHT, Math.ceil(height)));
}

/**
 * Block storage: base64 of the UTF-8 file. WordPress filters the attributes of
 * a post saved by anyone without `unfiltered_html` through kses, which would
 * strip the scripts out of plain HTML; the encoded form passes through intact,
 * and the PHP save guard decides who may add or change one.
 */
export function encodeInteractiveDocument(html: string): string {
  const bytes = new TextEncoder().encode(html);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodeInteractiveDocument(encoded: string): string | null {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export type InteractiveFileProblem = 'empty' | 'too-large' | 'not-html';

/** Why an uploaded file cannot be used, or null when it can. */
export function interactiveFileProblem(html: string): InteractiveFileProblem | null {
  if (!html.trim()) return 'empty';
  if (new TextEncoder().encode(html).length > INTERACTIVE_MAX_BYTES) return 'too-large';
  if (!/<(?:!doctype\s+html|html|body|script|svg|canvas|div|main|section)\b/i.test(html)) return 'not-html';
  return null;
}
