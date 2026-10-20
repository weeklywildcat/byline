import { visualizationPieceName, visualizationPreviewNote } from '@byline/ui/visualization';
import type { StoryImage } from '../story/models';
import type { EmbedDiagnosis } from './model';
import { StoryImagePlaceholder } from '../story/media';

/** A drawn stand-in for a chart or a map, so an empty frame still says what will be there. */
function Schematic({ map }: { map: boolean }) {
  return <svg className="byline-viz-schematic" viewBox="0 0 72 48" width="72" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {map
      ? <><path d="M6 10l20-4 20 4 20-4v32l-20 4-20-4-20 4z" /><path d="M26 6v32M46 10v32" /><circle cx="36" cy="22" r="4" /></>
      : <><path d="M6 6v36h60" /><path d="M16 42V28M28 42V18M40 42V24M52 42V12" strokeWidth="5" /></>}
  </svg>;
}

/**
 * The graphic region as readers will see it, at its real height. An interactive
 * embed is never loaded here: the fallback graphic (or a drawn stand-in with the
 * provider's name) is shown, and the badge says so.
 */
export function VisualizationFrame({ embed, image, diagnosis, onSelect }: { embed: boolean; image?: StoryImage; diagnosis: EmbedDiagnosis; onSelect: (media: any) => void }) {
  const provider = diagnosis.state === 'accepted' ? diagnosis.provider : '';
  const hasImage = Boolean(image?.url);
  return <div className="byline-visualization-media">
    <div className="byline-visualization-fallback-image">
      {hasImage && <img src={image!.url} alt={image!.alt || ''} width={image!.width || undefined} height={image!.height || undefined} style={!embed && image!.width ? { maxWidth: image!.width } : undefined} />}
    </div>
    {!embed && !hasImage && <StoryImagePlaceholder icon="chart-bar" title="Static graphic" instructions="Upload a chart, map or infographic exported as an image, choose one from the media library, or drop one here." onSelect={onSelect} />}
    {embed && !hasImage && <div className="byline-visualization-placeholder">
      <Schematic map={provider === 'google-maps' || provider === 'openstreetmap'} />
      <span>{diagnosis.state === 'accepted' ? visualizationPieceName(provider) : 'Interactive chart or map'}</span>
    </div>}
    {embed && <p className="byline-visualization-badge">{diagnosis.state === 'accepted'
      ? <><strong>Preview:</strong> {visualizationPreviewNote(provider)}</>
      : <><strong>Fallback only:</strong> add a chart or map address below to make this interactive.</>}</p>}
  </div>;
}
