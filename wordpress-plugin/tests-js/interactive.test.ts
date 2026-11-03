// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INTERACTIVE_MAX_BYTES,
  INTERACTIVE_MEASURE_MESSAGE,
  INTERACTIVE_RESIZE_SCRIPT,
  INTERACTIVE_SANDBOX,
  decodeInteractiveDocument,
  encodeInteractiveDocument,
  interactiveFileProblem,
  interactiveMessageHeight,
  interactiveSrcdoc
} from '../../packages/ui/src/interactive';
import { enhanceArticleStory } from '../../packages/ui/src/article-enhancements';
import { articleEnhancementSelector } from '../../packages/ui/src/article-enhancements/selector';
import metadata from '../src/blocks/interactive/block.json';

const php = readFileSync(resolve(process.cwd(), 'includes/content/interactive-block.php'), 'utf8');
const phpConstant = (name: string) => php.match(new RegExp(`const ${name} = '((?:[^'\\\\]|\\\\.)*)';`))?.[1].replace(/\\'/g, "'");

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) });
});

describe('the Interactive frame contract', () => {
  it('is the same in PHP and TypeScript', () => {
    expect(phpConstant('BYLINE_INTERACTIVE_RESIZE_SCRIPT')).toBe(INTERACTIVE_RESIZE_SCRIPT);
    expect(phpConstant('BYLINE_INTERACTIVE_SANDBOX')).toBe(INTERACTIVE_SANDBOX);
    expect(php).toContain(`const BYLINE_INTERACTIVE_MAX_BYTES = ${INTERACTIVE_MAX_BYTES};`);
    expect(INTERACTIVE_SANDBOX).toBe('allow-scripts');
  });

  it('stores any UTF-8 file losslessly as base64 and refuses anything else', () => {
    const html = '<!doctype html><p>Café ✓ — “quotes” &amp; <b>tags</b></p><script>let x = 1 < 2;</script>';
    const encoded = encodeInteractiveDocument(html);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decodeInteractiveDocument(encoded)).toBe(html);
    expect(decodeInteractiveDocument('not base64!')).toBeNull();
    expect(decodeInteractiveDocument(btoa('\xff\xfe'))).toBeNull();
    const large = '<div>' + 'x'.repeat(200_000) + '</div>';
    expect(decodeInteractiveDocument(encodeInteractiveDocument(large))).toBe(large);
  });

  it('accepts one HTML file within the size limit', () => {
    expect(interactiveFileProblem('<!doctype html><title>Quiz</title>')).toBeNull();
    expect(interactiveFileProblem('<div id="app"></div><script src="app.js"></script>')).toBeNull();
    expect(interactiveFileProblem('   ')).toBe('empty');
    expect(interactiveFileProblem('a,b,c\n1,2,3')).toBe('not-html');
    expect(interactiveFileProblem('<div>' + 'é'.repeat(INTERACTIVE_MAX_BYTES / 2) + '</div>')).toBe('too-large');
  });

  it('appends the resize reporter and keeps reported heights within bounds', () => {
    expect(interactiveSrcdoc('<p>Hi</p>')).toBe('<p>Hi</p>' + INTERACTIVE_RESIZE_SCRIPT);
    expect(interactiveMessageHeight({ bylineInteractive: 'height', height: 612.4 })).toBe(613);
    expect(interactiveMessageHeight({ bylineInteractive: 'height', height: 50 })).toBe(120);
    expect(interactiveMessageHeight({ bylineInteractive: 'height', height: 99999 })).toBe(4000);
    for (const data of [{ bylineInteractive: 'height', height: -5 }, { bylineInteractive: 'height', height: Infinity }, { bylineInteractive: 'height', height: '600' }, { bylineInteractive: 'other', height: 600 }, { height: 600 }, '{"bylineInteractive":"height","height":600}', null]) {
      expect(interactiveMessageHeight(data), JSON.stringify(data)).toBeNull();
    }
  });

  it('is a dynamic block: WordPress renders it, the editor saves only attributes', () => {
    expect(metadata.name).toBe('byline/interactive');
    expect(Object.keys(metadata.attributes).sort()).toEqual(['align', 'credit', 'description', 'document', 'fileName', 'heightPreset', 'title']);
    expect(metadata.supports.html).toBe(false);
    expect(php).toContain("add_filter('wp_insert_post_data', 'byline_interactive_guard_post_data'");
  });
});

describe('Interactive frames in the article', () => {
  const figure = '<figure class="wp-block-byline-interactive byline-interactive alignwide" data-height="standard"><h3 class="byline-interactive-title">Quiz</h3><p class="byline-interactive-description" id="d">What it shows.</p><iframe class="byline-interactive-frame" title="Quiz" aria-describedby="d" sandbox="allow-scripts"></iframe></figure>';
  const message = (source: Window | null, data: unknown, origin = 'null') => new MessageEvent('message', { source, origin, data });

  it('loads the shared enhancer', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = figure;
    expect(root.querySelector(articleEnhancementSelector)).not.toBeNull();
  });

  it('takes the height a frame reports, only from that frame and its opaque origin', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = figure + figure.replace(/"d"/g, '"e"');
    const [frame, other] = Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe'));
    const asked = vi.spyOn(frame.contentWindow!, 'postMessage');
    const cleanup = enhanceArticleStory(root);
    // It asks each frame to report again, in case the frame spoke before the page listened.
    expect(asked).toHaveBeenCalledWith(INTERACTIVE_MEASURE_MESSAGE, '*');

    window.dispatchEvent(message(frame.contentWindow, { bylineInteractive: 'height', height: 640 }));
    expect(frame.style.height).toBe('640px');
    expect(other.style.height).toBe('');
    window.dispatchEvent(message(frame.contentWindow, { bylineInteractive: 'height', height: 900 }, 'https://evil.example'));
    window.dispatchEvent(message(window, { bylineInteractive: 'height', height: 900 }));
    window.dispatchEvent(message(frame.contentWindow, { bylineInteractive: 'height', height: 'tall' }));
    expect(frame.style.height).toBe('640px');
    window.dispatchEvent(message(other.contentWindow, { bylineInteractive: 'height', height: 300 }));
    expect([frame.style.height, other.style.height]).toEqual(['640px', '300px']);

    cleanup();
    expect([frame.style.height, other.style.height]).toEqual(['', '']);
    window.dispatchEvent(message(frame.contentWindow, { bylineInteractive: 'height', height: 700 }));
    expect(frame.style.height).toBe('');
  });
});
