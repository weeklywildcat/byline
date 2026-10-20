import { Button } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { chevronLeft, chevronRight } from '@wordpress/icons';
import { useStoryImage } from '../story/media';
import { ownSelection } from './board';
import { stageStep, type StepSummary } from './steps';

const TEXT = 'weekly-wildcat-headless';
const nothing = () => {};

/** The stage, drawn with the public stylesheet's own classes (packages/ui/src/newsroom/scrolly.css). */
function PreviewStage({ steps, activeIndex, fit }: { steps: StepSummary[]; activeIndex: number; fit: string }) {
  const owner = stageStep(steps, activeIndex);
  const { credit } = useStoryImage(owner?.image, nothing);
  return <div className="byline-scrolly-stage" data-fit={fit} data-step={activeIndex}>
    <div className="byline-scrolly-progress byline-kicker">
      <span>{sprintf(__('Step %1$d of %2$d', TEXT), activeIndex + 1, steps.length)}</span>
      <span className="byline-scrolly-ticks" aria-hidden="true">{steps.map((step) => <i key={step.clientId} className={step.index < activeIndex ? 'is-past' : step.index === activeIndex ? 'is-active' : undefined} />)}</span>
    </div>
    {owner?.image
      ? <div className="byline-scrolly-frames"><figure className="byline-scrolly-frame">
        <img src={owner.image.url} alt="" width={owner.image.width} height={owner.image.height} />
        {owner.caption || credit ? <figcaption>{owner.caption}{credit ? <p className="photo-credit">{sprintf(__('Photo: %s', TEXT), credit)}</p> : null}</figcaption> : null}
      </figure></div>
      : <div className="byline-scrolly-preview-empty">{__('No photograph yet. Add one to a step to see the stage.', TEXT)}</div>}
  </div>;
}

/**
 * "As the reader sees it": the sticky stage and the active step side by side, on
 * a wide screen. It follows the writer's selection (or the stepper) instead of
 * the editor's scroll position, so the canvas scrolls normally.
 */
export function ReaderPreview({ steps, activeIndex, fit, onStep }: { steps: StepSummary[]; activeIndex: number; fit: string; onStep: (index: number) => void }) {
  const step = steps[activeIndex];
  if (!step) return null;
  const owner = stageStep(steps, activeIndex);
  const carried = owner && owner.index !== activeIndex;
  return <section className="byline-scrolly-preview" ref={ownSelection} aria-label={__('As the reader sees it', TEXT)}>
    <header className="byline-scrolly-preview-head">
      <span className="byline-kicker">{__('As the reader sees it', TEXT)}</span>
      <div className="byline-scrolly-stepper" role="group" aria-label={__('Preview step', TEXT)}>
        <Button size="compact" icon={chevronLeft} label={__('Previous step', TEXT)} disabled={activeIndex === 0} onClick={() => onStep(activeIndex - 1)} />
        <span aria-live="polite">{sprintf(__('%1$d / %2$d', TEXT), activeIndex + 1, steps.length)}</span>
        <Button size="compact" icon={chevronRight} label={__('Next step', TEXT)} disabled={activeIndex === steps.length - 1} onClick={() => onStep(activeIndex + 1)} />
      </div>
    </header>
    <div className="byline-scrolly-preview-body">
      <PreviewStage steps={steps} activeIndex={activeIndex} fit={fit} />
      <div className="byline-scrolly-preview-text">
        <div className="byline-scrolly-preview-heading">{step.heading || <em>{__('This step has no heading yet.', TEXT)}</em>}</div>
        {step.excerpt ? <div className="byline-scrolly-preview-excerpt">{step.excerpt}</div> : null}
        {carried ? <div className="byline-scrolly-preview-note">{sprintf(__('Text-only step: the stage keeps the photograph from step %d.', TEXT), owner.index + 1)}</div> : null}
      </div>
    </div>
    <div className="byline-scrolly-preview-note">{__('On phones, and for readers who prefer less motion, every photograph sits above its step in a plain, linear story.', TEXT)}</div>
  </section>;
}
