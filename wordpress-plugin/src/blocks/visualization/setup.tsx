import { Notice } from '@wordpress/components';
import { useId } from '@wordpress/element';
import { visualizationProviders } from '@byline/ui/visualization';
import { StoryTextControl } from '../story/fields';
import { StoryImagePlaceholder } from '../story/media';
import { embedProblem, heightChoices, type EmbedDiagnosis } from './model';

/** The chart or map address: one field, checked as it is typed, never accepting embed code. */
export function AddressField({ value, diagnosis, onChange, onPaste, onBlur }: { value: string; diagnosis: EmbedDiagnosis; onChange: (value: string) => void; onPaste: (pasted: string) => boolean; onBlur: () => void }) {
  const hint = useId();
  const unrecognised = diagnosis.state === 'insecure' || diagnosis.state === 'unsupported' || diagnosis.state === 'code';
  return <div className="byline-viz-address">
    <StoryTextControl label="Chart or map address" value={value} placeholder="https://" aria-describedby={hint} spellCheck={false} autoComplete="off" onChange={onChange}
      onBlur={onBlur} onPaste={(event: ClipboardEvent) => { if (onPaste(event.clipboardData?.getData('text') || '')) event.preventDefault(); }} />
    <div id={hint} role="status">
      {diagnosis.state === 'accepted' && <p className="byline-viz-recognised"><span className="byline-viz-provider"><span aria-hidden="true">{diagnosis.label[0]}</span>{diagnosis.label}</span> Recognised. Readers get the interactive version; this editor never loads it.</p>}
      {diagnosis.state === 'empty' && <p className="byline-viz-help">Paste a link from Datawrapper, Flourish, Google Maps or OpenStreetMap.</p>}
      {unrecognised && <Notice status="warning" isDismissible={false}>{embedProblem(diagnosis)}</Notice>}
    </div>
    {(diagnosis.state === 'empty' || unrecognised) && <details className="byline-viz-accepted" open={unrecognised}>
      <summary>Which addresses work, and where to find them</summary>
      <ul>
        {Object.values(visualizationProviders).map((provider) => <li key={provider.label}>
          <strong>{provider.label}</strong> {provider.where}
          {provider.examples.map((example) => <code key={example}>{example}</code>)}
        </li>)}
      </ul>
    </details>}
  </div>;
}

/** Four heights, drawn to scale: choosing one resizes the frame on the canvas. */
export function HeightChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const name = useId();
  return <fieldset className="byline-viz-heights">
    <legend>Height</legend>
    <div>
      {heightChoices.map((choice) => <label key={choice.value} className={value === choice.value ? 'is-checked' : undefined}>
        <input type="radio" name={name} value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />
        <span className="byline-viz-height-glyph" aria-hidden="true" style={{ aspectRatio: `1040 / ${choice.pixels}` }} />
        <span className="byline-viz-height-name">{choice.label}</span>
        <span className="byline-viz-height-note">{choice.pixels}px. {choice.note}.</span>
      </label>)}
    </div>
    <p className="byline-viz-help">The frame keeps this height at every width, so the page does not jump when the chart loads. Charts then resize to fit their own content. The fallback graphic is fitted inside the frame, never cropped.</p>
  </fieldset>;
}

type FallbackProps = { embed: boolean; hasImage: boolean; alt: string; problem: '' | 'missing' | 'lookup'; credit: string; hasOwnCredit: boolean; onAlt: (alt: string) => void; onSelect: (media: any) => void };

/** The fallback graphic of an interactive embed (or the static graphic itself): why it matters, its description and its credit. */
export function FallbackFields({ embed, hasImage, alt, problem, credit, hasOwnCredit, onAlt, onSelect }: FallbackProps) {
  const name = embed ? 'Fallback graphic' : 'Graphic';
  return <div className="byline-viz-fallback">
    <p className="byline-kicker">{name}</p>
    <p className="byline-viz-help">{embed
      ? 'Shown if the interactive version cannot load, to readers without JavaScript, and in search results. Export your chart or map as an image.'
      : 'Fills the width of the story, up to its own size, with its proportions kept. Export your chart or map at twice the size for sharp text.'}</p>
    {!hasImage && embed && <StoryImagePlaceholder icon="chart-bar" title={name} instructions="Upload an exported image of the chart or map, choose one from the media library, or drop one here." onSelect={onSelect} />}
    {hasImage && <>
      <StoryTextControl label={`${name} alternative text`} value={alt} help="Say what the graphic shows: the kind of chart or map, what is measured and the main finding. Screen readers read this instead of the image." onChange={onAlt} />
      {!alt && <Notice status="warning" isDismissible={false}>No alternative text yet. Readers who cannot see the graphic will not know what it shows.</Notice>}
      {credit && !hasOwnCredit && <p className="byline-viz-help">Published with the media library credit: “{credit}”. Type a credit under the graphic to use your own.</p>}
    </>}
    {problem === 'missing' && <Notice status="error" isDismissible={false}>This image is no longer in the media library. Replace it before publishing.</Notice>}
    {problem === 'lookup' && <Notice status="warning" isDismissible={false}>Could not check this image in the media library. Its credit may be out of date.</Notice>}
  </div>;
}
