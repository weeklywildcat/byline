import { enhanceArticleGalleries } from './gallery';
import { enhanceBeforeAfter } from './before-after';
import { enhanceVisualizations } from './visualization';
import { enhanceAnnotatedImage } from './annotated-image';
import { enhanceInteractives } from './interactive';

export { articleEnhancementSelector } from './selector';
export type ArticleEnhancementOptions = { preview?: boolean };
const sessions = new WeakMap<ParentNode, () => void>();

/** Framework-free, scoped to the owning document (including preview iframes).
 * Repeated initialization is a no-op. Cleanup releases observers/listeners and
 * restores the linear presentation before a host unmounts the article. */
export function enhanceArticleStory(root: HTMLElement, options: ArticleEnhancementOptions = {}): () => void {
  const previous = sessions.get(root);
  if (previous) return previous;
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) return () => {};
  const abort = new view.AbortController();
  const signal = abort.signal;
  const cleanups: (() => void)[] = [];
  if (!options.preview) cleanups.push(enhanceArticleGalleries(root));
  cleanups.push(enhanceVisualizations(root, signal, Boolean(options.preview)));
  cleanups.push(enhanceInteractives(root, signal));
  root.querySelectorAll<HTMLElement>('.byline-annotated-image').forEach((figure) => enhanceAnnotatedImage(figure, signal));

  root.querySelectorAll<HTMLElement>('.byline-before-after').forEach((figure) => {
    const undo = enhanceBeforeAfter(figure, signal);
    if (undo) cleanups.push(undo);
  });
  const cleanup = () => { abort.abort(); cleanups.forEach((fn) => fn()); sessions.delete(root); };
  sessions.set(root, cleanup);
  return cleanup;
}
