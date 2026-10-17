import { useBlockProps } from '@wordpress/block-editor';
import { StoryImageMarkup } from '../story/image';
import { visualizationUrl } from '@byline/ui/visualization';
export function VisualizationSave({ attributes: a }: any) {
  const validated = visualizationUrl(a.embedUrl || '');
  return <figure {...useBlockProps.save({ className: 'byline-visualization' })} data-mode={a.mode} data-provider={validated?.provider} data-src={a.mode === 'embed' ? validated?.src : undefined} data-height={a.heightPreset}>
    {a.title && <h2>{a.title}</h2>}{a.description && <p>{a.description}</p>}
    <div className="byline-visualization-media"><div className="byline-visualization-fallback-image"><StoryImageMarkup image={a.image} /></div></div>
    {a.mode === 'embed' && validated && <p className="byline-visualization-link"><a href={validated.src} rel="noopener noreferrer">Open {a.type === 'map' ? 'map' : 'visualization'}: {a.title || validated.provider}</a></p>}
    {(a.source || a.notes || a.credit || a.image?.credit) && <figcaption>
      {a.source && <p>Source: {a.source}</p>}{a.notes && <p>{a.notes}</p>}{(a.credit || a.image?.credit) && <p>Credit: {a.credit || a.image.credit}</p>}
    </figcaption>}
  </figure>;
}
