import { BlockControls, InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { Button, PanelBody, Placeholder, SelectControl, ToolbarButton, ToolbarGroup } from '@wordpress/components';
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { chartBar, image as imageIcon } from '@wordpress/icons';
import { StoryCaption } from '../story/fields';
import { StoryImageToolbar, useStoryImage } from '../story/media';
import { VisualizationFrame } from './frame';
import { diagnoseEmbedInput, embedAttributes, setupGaps } from './model';
import { AddressField, FallbackFields, HeightChoice } from './setup';

/** One attribution line typed where it prints: an optional printed label, then the text. */
function Line({ label, ariaLabel, className, ...field }: { label?: string; ariaLabel: string; className: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <p className={`byline-viz-line ${className}`}>{label && <span aria-hidden="true">{label}</span>}<StoryCaption singleLine className="byline-viz-field" label={ariaLabel} {...field} /></p>;
}

export function Edit({ attributes: a, setAttributes, isSelected }: any) {
  const root = useRef<HTMLElement>(null);
  const [picked, setPicked] = useState(false);
  const setImage = useCallback((image: any) => setAttributes({ image }), [setAttributes]);
  const graphic = useStoryImage(a.image?.url ? a.image : undefined, setImage);
  const embed = a.mode === 'embed';
  const diagnosis = diagnoseEmbedInput(a.embedUrl || '');
  const gaps = setupGaps(a);
  const fresh = !picked && embed && !a.embedUrl && !a.image?.url && !a.title && !a.description;
  useEffect(() => { if (picked) root.current?.querySelector<HTMLInputElement>('.byline-viz-address input')?.focus(); }, [picked]);

  const blockProps = useBlockProps({ ref: root, className: 'byline-visualization', 'data-mode': a.mode, 'data-provider': diagnosis.state === 'accepted' ? diagnosis.provider : undefined, 'data-height': a.heightPreset });
  const setAddress = (value: string, normalize = false) => setAttributes(embedAttributes(value, a, normalize));

  if (fresh) {
    return <div {...blockProps}>
      <Placeholder icon={chartBar} label="Chart / Map" instructions="What do you have?" className="byline-viz-choice">
        <Button variant="secondary" onClick={() => setPicked(true)}>
          <strong>Interactive chart or map</strong>
          <span>Paste a link from Datawrapper, Flourish, Google Maps or OpenStreetMap. Readers can hover and explore.</span>
        </Button>
        <Button variant="secondary" onClick={() => { setAttributes({ mode: 'static' }); setPicked(true); }}>
          <strong>Static graphic</strong>
          <span>Upload a chart, map or infographic you have exported as an image.</span>
        </Button>
      </Placeholder>
    </div>;
  }

  return <figure {...blockProps}>
    <BlockControls group="block">
      <ToolbarGroup>
        <ToolbarButton icon={chartBar} isPressed={embed} onClick={() => setAttributes({ mode: 'embed' })}>Interactive</ToolbarButton>
        <ToolbarButton icon={imageIcon} isPressed={!embed} onClick={() => setAttributes({ mode: 'static' })}>Static graphic</ToolbarButton>
      </ToolbarGroup>
    </BlockControls>
    <StoryImageToolbar image={a.image} name="Replace graphic" onSelect={graphic.select} onRemove={graphic.remove} />
    <InspectorControls><PanelBody title="Chart / Map" initialOpen>
      <SelectControl __nextHasNoMarginBottom label="Presentation" value={a.mode} onChange={(mode: string) => setAttributes({ mode })}
        options={[{ label: 'Interactive chart or map (a link)', value: 'embed' }, { label: 'Static graphic (an image)', value: 'static' }]}
        help={embed ? 'Readers see the interactive version. The graphic is the fallback.' : 'Readers see the uploaded image. No link is published.'} />
    </PanelBody></InspectorControls>

    <StoryCaption singleLine className="byline-visualization-title byline-viz-field" label="Title" value={a.title} placeholder="State the takeaway: Lunch got shorter for every wave" onChange={(title) => setAttributes({ title })} />
    <StoryCaption singleLine className="byline-visualization-dek byline-viz-field" label="Description" value={a.description} placeholder="Say exactly what is measured: minutes between the first bell and the last, by lunch wave" onChange={(description) => setAttributes({ description })} />
    <VisualizationFrame embed={embed} image={a.image} diagnosis={diagnosis} onSelect={graphic.select} />
    {(isSelected || a.summary || a.source || a.notes || a.credit) && <figcaption>
      {(isSelected || a.summary) && <Line className="byline-visualization-summary" value={a.summary} ariaLabel="What the graphic shows" placeholder="Describe what the chart shows in a sentence or two, for readers who cannot see it" onChange={(summary) => setAttributes({ summary })} />}
      {(isSelected || a.source) && <Line className="byline-visualization-source" label="Source:" value={a.source} ariaLabel="Source" placeholder="Who collected the data, and when" onChange={(source) => setAttributes({ source })} />}
      {(isSelected || a.notes) && <Line className="byline-visualization-notes" value={a.notes} ariaLabel="Notes" placeholder="Notes: methods, caveats, what is not included" onChange={(notes) => setAttributes({ notes })} />}
      {(isSelected || a.credit) && <Line className="photo-credit" label="Credit:" value={a.credit} ariaLabel="Credit" placeholder="Who made this chart or map" onChange={(credit) => setAttributes({ credit })} />}
    </figcaption>}

    {(isSelected || gaps.length > 0) && <div className="byline-viz-setup" role="group" aria-label="Chart or map setup">
      {embed && <AddressField value={a.embedUrl} diagnosis={diagnosis} onChange={setAddress}
        onPaste={(pasted) => { if (diagnoseEmbedInput(pasted).state !== 'accepted') return false; setAddress(pasted, true); return true; }}
        onBlur={() => { if (diagnosis.state === 'accepted' && a.embedUrl !== diagnosis.src) setAddress(a.embedUrl, true); }} />}
      <FallbackFields embed={embed} hasImage={Boolean(a.image?.url)} alt={a.image?.alt || ''} problem={graphic.problem} credit={graphic.credit} hasOwnCredit={Boolean(a.credit)} onAlt={graphic.setAlt} onSelect={graphic.select} />
      {embed && <HeightChoice value={a.heightPreset} onChange={(heightPreset) => setAttributes({ heightPreset })} />}
    </div>}
  </figure>;
}
