import { useBlockProps } from '@wordpress/block-editor';
import { StoryImageMarkup } from '../story/image';
import { visualizationUrl } from '@byline/ui/visualization';

/**
 * The saved figure is a complete, readable section without JavaScript: title,
 * dek, the graphic (the fallback when there is an embed), a direct link, and
 * the attribution lines. The credit of a photograph or exported graphic is
 * added when the article renders (includes/content/story-blocks.php).
 */
export function VisualizationSave({ attributes: a }: any) {
  const validated = visualizationUrl(a.embedUrl || '');
  const embed = a.mode === 'embed';
  return <figure {...useBlockProps.save({ className: 'byline-visualization' })} data-mode={a.mode} data-provider={validated?.provider} data-src={embed ? validated?.src : undefined} data-height={a.heightPreset}>
    {a.title && <h3 className="byline-visualization-title">{a.title}</h3>}
    {a.description && <p className="byline-visualization-dek">{a.description}</p>}
    <div className="byline-visualization-media"><div className="byline-visualization-fallback-image"><StoryImageMarkup image={a.image} /></div></div>
    {embed && validated && <p className="byline-visualization-link"><a href={validated.src} rel="noopener noreferrer">Open the interactive version</a></p>}
    {(a.summary || a.source || a.notes || a.credit) && <figcaption>
      {a.summary && <p className="byline-visualization-summary">{a.summary}</p>}
      {a.source && <p className="byline-visualization-source">Source: {a.source}</p>}
      {a.notes && <p className="byline-visualization-notes">{a.notes}</p>}
      {a.credit && <p className="photo-credit">Credit: {a.credit}</p>}
    </figcaption>}
  </figure>;
}
