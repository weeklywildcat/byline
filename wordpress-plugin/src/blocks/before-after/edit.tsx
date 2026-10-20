import { BlockControls, InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { Notice, PanelBody, SelectControl, ToolbarButton, VisuallyHidden } from '@wordpress/components';
import { useCallback, useState } from '@wordpress/element';
import { flipHorizontal } from '@wordpress/icons';
import { comparisonState } from '@byline/ui/before-after';
import { StoryCaption, StoryTextControl } from '../story/fields';
import { StoryImageInspector, StoryImagePlaceholder, StoryImageToolbar, useStoryImage } from '../story/media';
import { mismatchedRatios, type StoryImage } from '../story/models';
import { comparisonAspect, comparisonCredit, normalizeFit, type ComparisonFit } from './model';

type Side = 'before' | 'after';

/**
 * The canvas is the comparison itself: the same frame, divider and range the
 * public page uses (newsroom/before-after.css), draggable here so a writer can
 * judge framing, crop and labels before publishing. Until both photographs are
 * chosen it is two drop zones, one per side.
 */
export function BeforeAfterEdit({ attributes: a, setAttributes, isSelected }: any) {
  const [position, setPosition] = useState(50);
  const [failed, setFailed] = useState<Record<Side, boolean>>({ before: false, after: false });
  const [announcement, setAnnouncement] = useState('');
  const onBefore = useCallback((before: StoryImage) => { setFailed((current) => ({ ...current, before: false })); setAttributes({ before }); }, [setAttributes]);
  const onAfter = useCallback((after: StoryImage) => { setFailed((current) => ({ ...current, after: false })); setAttributes({ after }); }, [setAttributes]);
  const photos = { before: useStoryImage(a.before, onBefore), after: useStoryImage(a.after, onAfter) };

  const labels = { before: a.beforeLabel || 'Before', after: a.afterLabel || 'After' };
  const fit: ComparisonFit = normalizeFit(a.fit);
  const complete = Boolean(a.before?.url && a.after?.url);
  const different = mismatchedRatios(a.before, a.after);
  const aspect = comparisonAspect(a.before, a.after, fit);
  const state = comparisonState(position, labels.before, labels.after);
  const credit = comparisonCredit({ before: photos.before.credit, after: photos.after.credit }, labels);
  const setFit = (next: ComparisonFit) => setAttributes({ fit: next });
  const setLabel = (side: Side, value: string) => setAttributes({ [side === 'before' ? 'beforeLabel' : 'afterLabel']: value.replace(/\s+/g, ' ').slice(0, 40) });
  const swapPhotographs = () => { setAttributes({ before: a.after, after: a.before }); setAnnouncement(`The ${labels.before} and ${labels.after} photographs were swapped.`); };

  const blockProps = useBlockProps({
    className: `byline-before-after${complete ? ' is-enhanced' : ''}`,
    'data-fit': fit,
    style: complete ? { '--comparison-position': state.position, '--comparison-ratio': state.ratio } : undefined
  });

  function photograph(side: Side) {
    const image: StoryImage | undefined = a[side];
    if (!image?.url) {
      return <div className="byline-comparison-slot" key={side}>
        <StoryImagePlaceholder title={`${labels[side]} photograph`} instructions={side === 'before' ? 'Upload, choose or drop the earlier photograph.' : 'Upload, choose or drop the later photograph.'} onSelect={photos[side].select} />
      </div>;
    }
    return <div className="byline-comparison-image" key={side}>
      <strong>{labels[side]}</strong>
      {failed[side] || photos[side].problem === 'missing'
        ? <p className="byline-comparison-missing" role="status">The {labels[side]} photograph could not be loaded. Replace it from the toolbar before publishing.</p>
        : <img src={image.url} alt={image.alt || ''} draggable={false} onError={() => setFailed((current) => ({ ...current, [side]: true }))} />}
    </div>;
  }

  return <div {...blockProps}>
    <StoryImageToolbar image={a.before} name="Replace Before" onSelect={photos.before.select} />
    <StoryImageToolbar image={a.after} name="Replace After" onSelect={photos.after.select} />
    {complete && <BlockControls group="other"><ToolbarButton icon={flipHorizontal} label="Swap Before and After" onClick={swapPhotographs} /></BlockControls>}
    <StoryImageInspector title={`${labels.before} photograph`} image={a.before} credit={photos.before.credit} problem={photos.before.problem} onAlt={photos.before.setAlt} />
    <StoryImageInspector title={`${labels.after} photograph`} image={a.after} credit={photos.after.credit} problem={photos.after.problem} onAlt={photos.after.setAlt} />
    <InspectorControls>
      <PanelBody title="Comparison" initialOpen>
        <StoryTextControl label="Left label" value={a.beforeLabel} onChange={(value: string) => setLabel('before', value)} help="Names the photograph on the left, for example Before or 2019." />
        <StoryTextControl label="Right label" value={a.afterLabel} onChange={(value: string) => setLabel('after', value)} help="Names the photograph on the right, for example After or 2026." />
        <SelectControl __nextHasNoMarginBottom label="Photograph fit" value={fit} onChange={(value: string) => setFit(normalizeFit(value))}
          options={[{ label: 'Fill the frame (crop the right photograph to match)', value: 'cover' }, { label: 'Show both complete (margins where shapes differ)', value: 'contain' }]}
          help={different ? 'These photographs are different shapes. Showing both complete never hides part of either.' : 'Matching framing works best, so the two line up as the divider moves.'} />
      </PanelBody>
    </InspectorControls>
    {isSelected && complete && different && fit === 'cover' && <Notice status="warning" isDismissible={false} actions={[{ label: 'Show both complete', onClick: () => setFit('contain') }]}>
      These photographs are different shapes, so the edges of the {labels.after} photograph are cropped to match the {labels.before} one. Show both complete if the edges matter.
    </Notice>}
    <div className="byline-comparison-images" style={complete && aspect ? { '--comparison-aspect': String(aspect) } as any : undefined}>
      {photograph('before')}
      {photograph('after')}
      {complete && <>
        <div className="byline-comparison-labels">
          {(['before', 'after'] as const).map((side) => <span key={side}>
            <StoryCaption singleLine className="byline-comparison-label-field" label={`${side === 'before' ? 'Left' : 'Right'} label`} placeholder={side === 'before' ? 'Before' : 'After'} value={a[side === 'before' ? 'beforeLabel' : 'afterLabel']} onChange={(value: string) => setLabel(side, value)} />
          </span>)}
        </div>
        <span className="byline-comparison-divider" aria-hidden="true" />
        <input type="range" className="byline-comparison-range" min={0} max={100} step={1} value={position} aria-label={`Compare ${labels.before} and ${labels.after}`} aria-valuetext={state.valueText} onChange={(event) => setPosition(Number(event.target.value))} />
      </>}
    </div>
    {!complete && <p className="byline-story-editor-note">Choose both photographs to complete this comparison. Readers see it once both are in. Photographs framed the same way line up best.</p>}
    <StoryCaption label="Caption" placeholder="Add a caption: what changed, and when" value={a.caption} onChange={(caption: string) => setAttributes({ caption })} />
    {credit && <p className="byline-story-image-credit">{credit}</p>}
    {isSelected && complete && (!a.before.alt || !a.after.alt) && <p className="byline-story-editor-note">A photograph is missing alternative text. Add it in the sidebar so readers using screen readers know what each shows.</p>}
    <VisuallyHidden><div role="status" aria-live="polite">{announcement}</div></VisuallyHidden>
  </div>;
}
