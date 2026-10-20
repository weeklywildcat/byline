import { useBlockProps } from '@wordpress/block-editor';
import { visualizationUrl } from '@byline/ui/visualization';
import { LegacyStoryImageMarkup } from '../story/image';
import metadata from './block.json';

/** Byline 0.3.24 and earlier: an h2 and unclassed paragraphs, credit and responsive candidates baked in. */
function LegacyVisualizationSave({ attributes: a }: any) {
  const validated = visualizationUrl(a.embedUrl || '');
  return <figure {...useBlockProps.save({ className: 'byline-visualization' })} data-mode={a.mode} data-provider={validated?.provider} data-src={a.mode === 'embed' ? validated?.src : undefined} data-height={a.heightPreset}>
    {a.title && <h2>{a.title}</h2>}{a.description && <p>{a.description}</p>}
    <div className="byline-visualization-media"><div className="byline-visualization-fallback-image"><LegacyStoryImageMarkup image={a.image} /></div></div>
    {a.mode === 'embed' && validated && <p className="byline-visualization-link"><a href={validated.src} rel="noopener noreferrer">Open {a.type === 'map' ? 'map' : 'visualization'}: {a.title || validated.provider}</a></p>}
    {(a.source || a.notes || a.credit || a.image?.credit) && <figcaption>
      {a.source && <p>Source: {a.source}</p>}{a.notes && <p>{a.notes}</p>}{(a.credit || a.image?.credit) && <p>Credit: {a.credit || a.image.credit}</p>}
    </figcaption>}
  </figure>;
}

/** Drop the baked-in responsive candidates and credit; a credit with no attachment behind it becomes the block's own. */
function migrate(attributes: any) {
  const { srcSet: _srcSet, sizes: _sizes, credit: attachmentCredit, ...image } = attributes.image || {};
  return { ...attributes, image, credit: attributes.credit || (image.id ? '' : attachmentCredit || '') };
}

// Deprecations do not inherit the block's attributes or supports; this one differs only by not having `summary`.
const { summary: _summary, ...attributes } = metadata.attributes;
export default [{ attributes, supports: metadata.supports, save: LegacyVisualizationSave, migrate }];
