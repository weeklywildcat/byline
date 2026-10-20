import { createElement } from '@wordpress/element';
import { useBlockProps } from '@wordpress/block-editor';
import { LegacyStoryImageMarkup } from '../story/image';
import { mismatchedRatios } from '../story/models';
import metadata from './block.json';

/** Byline 0.3.24 and earlier: baked-in responsive candidates and credits, and an editor instruction while a photograph is missing. */
function LegacyBeforeAfterSave({ attributes: a }: any) {
  const credits = (a.caption || a.before?.credit || a.after?.credit) && createElement('figcaption', null, a.caption,
    a.before?.credit && createElement('p', null, a.beforeLabel || 'Before', ' photo: ', a.before.credit),
    a.after?.credit && createElement('p', null, a.afterLabel || 'After', ' photo: ', a.after.credit));
  return createElement('figure', useBlockProps.save({ className: 'byline-before-after' }),
    (!a.before?.url || !a.after?.url) && createElement('p', null, 'Choose both photographs to complete this comparison.'),
    createElement('div', { className: 'byline-comparison-images' },
      a.before?.url && createElement('div', { className: 'byline-comparison-image' }, createElement('strong', { 'data-before': true }, a.beforeLabel || 'Before'), createElement(LegacyStoryImageMarkup, { image: a.before })),
      a.after?.url && createElement('div', { className: 'byline-comparison-image' }, createElement('strong', { 'data-after': true }, a.afterLabel || 'After'), createElement(LegacyStoryImageMarkup, { image: a.after }))),
    credits);
}

const withoutBakedIn = ({ srcSet: _srcSet, sizes: _sizes, credit: _credit, ...image }: any = {}) => image;

/**
 * Drop the baked-in candidates and credits. Photographs of different shapes were
 * always shown complete, so they keep doing so rather than being cropped.
 */
function migrate(attributes: any) {
  const before = withoutBakedIn(attributes.before), after = withoutBakedIn(attributes.after);
  return { ...attributes, before, after, fit: mismatchedRatios(before, after) ? 'contain' : 'cover' };
}

/** The attributes as 0.3.24 knew them: no fit choice. */
const { fit: _fit, ...attributes } = metadata.attributes;

export default [{ attributes, supports: metadata.supports, save: LegacyBeforeAfterSave, migrate }];
