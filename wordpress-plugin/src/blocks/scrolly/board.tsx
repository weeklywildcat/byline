import { Button } from '@wordpress/components';
import { useEffect, useRef } from '@wordpress/element';
import type { KeyboardEvent } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { arrowLeft, arrowRight, copy, plus, trash } from '@wordpress/icons';
import { boardFocusIndex, type StepSummary } from './steps';
import type { useStepOperations } from './operations';

const TEXT = 'weekly-wildcat-headless';
type Operations = ReturnType<typeof useStepOperations>;

/** The sentence a screen reader hears for a card. */
function cardLabel(step: StepSummary) {
  return sprintf(__('Step %1$d: %2$s%3$s', TEXT), step.index + 1, step.heading || __('no heading yet', TEXT), step.image ? '' : `, ${__('text only', TEXT)}`);
}

/**
 * Gutenberg selects a block when focus enters it. The board and the preview sit
 * inside the Scrollytelling block but select steps themselves, so focus moving
 * between their controls must not also select the whole story. A native
 * listener: React's synthetic events arrive after the block has already seen the
 * native one. Pass as a `ref`.
 */
const stopFocusIn = (event: Event) => event.stopPropagation();
export function ownSelection(element: HTMLElement | null) {
  element?.addEventListener('focusin', stopFocusIn);
}

/**
 * The story board: every step in order with its photograph and heading, and the
 * actions that arrange them. Choosing a card selects the step (the reader preview
 * follows) and moves the caret to it; arrow keys browse the cards, Alt + arrow
 * keys move the focused step. Selection is the only state, so the board, the
 * canvas and the preview cannot disagree.
 */
export function StoryBoard({ steps, activeId, operations, announcement }: { steps: StepSummary[]; activeId?: string; operations: Operations; announcement: string }) {
  const strip = useRef<HTMLOListElement>(null);
  const focusAfterRender = useRef<string | null>(null);
  const active = steps.find((step) => step.clientId === activeId);
  const activeIndex = active ? active.index : -1;

  useEffect(() => {
    // A moved card is a different DOM node to the browser; give it focus back.
    const id = focusAfterRender.current;
    focusAfterRender.current = null;
    if (id) strip.current?.querySelector<HTMLElement>(`[data-step-id="${id}"]`)?.focus();
  }, [steps]);
  useEffect(() => {
    // Keep the chosen card in view without scrolling the page.
    const container = strip.current;
    const card = container?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!container || !card) return;
    const left = card.offsetLeft - container.offsetLeft;
    if (left < container.scrollLeft) container.scrollLeft = left - 8;
    else if (left + card.offsetWidth > container.scrollLeft + container.clientWidth) container.scrollLeft = left + card.offsetWidth - container.clientWidth + 8;
  }, [activeId, steps.length]);

  function onKeyDown(event: KeyboardEvent, step: StepSummary) {
    if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      focusAfterRender.current = step.clientId;
      operations.move(step.clientId, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const target = boardFocusIndex(step.index, event.key, steps.length);
    if (target === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = steps[target];
    operations.choose(next.clientId);
    strip.current?.querySelector<HTMLElement>(`[data-step-id="${next.clientId}"]`)?.focus();
  }

  const act = (run: (id: string) => void) => () => { if (active) run(active.clientId); };
  return <div className="byline-scrolly-board" ref={ownSelection} role="group" aria-label={__('Story board', TEXT)}>
    <div className="byline-scrolly-board-head">
      <span className="byline-kicker">{__('Story board', TEXT)}</span>
      <span className="byline-scrolly-board-count">{sprintf(_n('%d step', '%d steps', steps.length, TEXT), steps.length)}</span>
      <div className="byline-scrolly-board-actions">
        <Button size="compact" variant="primary" icon={plus} onClick={() => operations.add(active?.clientId)}>{__('Add step', TEXT)}</Button>
        <Button size="compact" variant="tertiary" icon={copy} disabled={!active} onClick={act(operations.duplicate)}>{__('Duplicate', TEXT)}</Button>
        <Button size="compact" variant="tertiary" icon={arrowLeft} disabled={!active || activeIndex === 0} onClick={act((id) => operations.move(id, -1))} aria-label={__('Move step earlier', TEXT)}>{__('Earlier', TEXT)}</Button>
        <Button size="compact" variant="tertiary" icon={arrowRight} disabled={!active || activeIndex === steps.length - 1} onClick={act((id) => operations.move(id, 1))} aria-label={__('Move step later', TEXT)}>{__('Later', TEXT)}</Button>
        <Button size="compact" variant="tertiary" icon={trash} isDestructive disabled={!active} onClick={act(operations.remove)} aria-label={__('Remove step', TEXT)}>{__('Remove', TEXT)}</Button>
      </div>
    </div>
    {steps.length ? <ol className="byline-scrolly-cards" ref={strip}>
      {steps.map((step) => <li key={step.clientId}>
        <button type="button" className="byline-scrolly-card" data-step-id={step.clientId} aria-current={step.clientId === activeId ? 'step' : undefined} aria-label={cardLabel(step)} tabIndex={step.clientId === activeId || (!active && step.index === 0) ? 0 : -1} onClick={() => operations.edit(step.clientId)} onKeyDown={(event) => onKeyDown(event, step)}>
          <span className="byline-scrolly-card-thumb">{step.image ? <img src={step.image.url} alt="" loading="lazy" /> : <span>{__('Text only', TEXT)}</span>}</span>
          <span className="byline-scrolly-card-number">{step.index + 1}</span>
          <span className="byline-scrolly-card-title">{step.heading || __('Untitled step', TEXT)}</span>
          {step.needsAlt ? <span className="byline-scrolly-card-flag">{__('Needs alt text', TEXT)}</span> : null}
        </button>
      </li>)}
    </ol> : <div className="byline-scrolly-board-empty">{__('Add the first step: a photograph and the reporting that goes with it.', TEXT)}</div>}
    <div className="byline-scrolly-board-hint">{__('Choose a step to edit it. Arrow keys browse the board; Alt + arrow keys move the step.', TEXT)}</div>
    <div className="byline-visually-hidden" role="status" aria-live="polite">{announcement}</div>
  </div>;
}
