import { createElement } from '@wordpress/element';
import { useBlockProps } from '@wordpress/block-editor';
import { LegacyStoryImageMarkup } from '../story/image';
import { clampCoordinate, type Annotation } from '../story/models';

/** Byline 0.3.24 and earlier: baked-in responsive candidates and credit, an editor instruction when empty, every marker kept. */
function LegacyAnnotatedImageSave({ attributes: a }: any) {
  const props = useBlockProps.save({ className: 'byline-annotated-image' });
  if (!a.image?.url) return createElement('figure', props, createElement('p', null, 'Annotated image pending.'));
  const notes = a.annotations as Annotation[];
  return createElement('figure', props,
    createElement('div', { className: 'byline-annotation-layout' },
      createElement('div', { className: 'byline-annotation-canvas' }, createElement(LegacyStoryImageMarkup, { image: a.image }),
        notes.map((note, index) => createElement('a', { key: note.id, className: 'byline-annotation-marker', href: `#annotation-${note.id}`, style: { left: `clamp(16px, ${clampCoordinate(note.x)}%, calc(100% - 16px))`, top: `clamp(16px, ${clampCoordinate(note.y)}%, calc(100% - 16px))` }, 'aria-label': `Annotation ${index + 1}: ${note.title || 'Read annotation'}` }, index + 1))),
      createElement('ol', { className: 'byline-annotations' }, notes.map((note) => createElement('li', { key: note.id, id: `annotation-${note.id}`, tabIndex: 0 }, note.title && createElement('h3', null, note.title), note.body && createElement('p', null, note.body))))),
    (a.caption || a.image.credit) && createElement('figcaption', null, a.caption, a.image.credit && createElement('p', null, 'Photo: ', a.image.credit)));
}

/** Drop the baked-in responsive candidates and credit; both are resolved from the attachment when the article renders. */
function migrate(attributes: any) {
  const { srcSet: _srcSet, sizes: _sizes, credit: _credit, ...image } = attributes.image || {};
  return { ...attributes, image };
}

export default [{ save: LegacyAnnotatedImageSave, migrate }];
