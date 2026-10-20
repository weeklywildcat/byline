import { cloneBlock, createBlock } from '@wordpress/blocks';
import { useDispatch, useSelect } from '@wordpress/data';
import { useCallback, useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { STEP_TEMPLATE } from '../scrolly-step/template';
import { indexAfterRemoval, movedIndex, summarizeSteps, type StepSummary } from './steps';

const TEXT = 'weekly-wildcat-headless';
const STORE = 'core/block-editor';

function newStep() {
  return createBlock('byline/scrolly-step', {}, STEP_TEMPLATE.map(([name, attributes]) => createBlock(name, attributes)));
}

/**
 * Add, duplicate, move and remove for the Story Steps inside one Scrollytelling
 * block. Used by the story board and by each step's own toolbar, so the two
 * always do the same thing and announce the same sentence.
 */
export function useStepOperations(rootClientId: string | undefined, announce: (message: string) => void = () => {}) {
  const { insertBlock, removeBlock, moveBlockToPosition, selectBlock } = useDispatch(STORE) as any;
  const registry = useSelect((select) => select(STORE) as any, []);

  const stepIds = useCallback((): string[] => (rootClientId ? registry.getBlockOrder(rootClientId) : []), [registry, rootClientId]);
  /** Put the caret in a step's heading, which also scrolls the canvas to it. */
  const edit = useCallback((clientId: string) => {
    const heading = registry.getBlocks(clientId).find((block: any) => block.name === 'core/heading');
    selectBlock(heading ? heading.clientId : clientId);
  }, [registry, selectBlock]);
  /** Select a step without moving focus out of the control that asked. */
  const choose = useCallback((clientId: string) => selectBlock(clientId, null), [selectBlock]);

  const add = useCallback((afterClientId?: string) => {
    if (!rootClientId) return;
    const ids = stepIds();
    const at = afterClientId ? ids.indexOf(afterClientId) + 1 : ids.length;
    const step = newStep();
    insertBlock(step, at, rootClientId, false);
    selectBlock(step.innerBlocks[0].clientId);
    announce(`${__('Step added.', TEXT)} ${at + 1} / ${ids.length + 1}`);
  }, [rootClientId, stepIds, insertBlock, selectBlock, announce]);

  const duplicate = useCallback((clientId: string) => {
    if (!rootClientId) return;
    const ids = stepIds();
    const copy = cloneBlock(registry.getBlock(clientId));
    const at = ids.indexOf(clientId) + 1;
    insertBlock(copy, at, rootClientId, false);
    selectBlock(copy.clientId, null);
    announce(`${__('Step duplicated.', TEXT)} ${at + 1} / ${ids.length + 1}`);
  }, [rootClientId, stepIds, registry, insertBlock, selectBlock, announce]);

  const move = useCallback((clientId: string, direction: -1 | 1) => {
    if (!rootClientId) return;
    const ids = stepIds();
    const to = movedIndex(ids.indexOf(clientId), direction, ids.length);
    if (to === null) return;
    moveBlockToPosition(clientId, rootClientId, rootClientId, to);
    announce(`${direction < 0 ? __('Step moved earlier.', TEXT) : __('Step moved later.', TEXT)} ${to + 1} / ${ids.length}`);
  }, [rootClientId, stepIds, moveBlockToPosition, announce]);

  const remove = useCallback((clientId: string) => {
    if (!rootClientId) return;
    const ids = stepIds();
    const next = indexAfterRemoval(ids.indexOf(clientId), ids.length);
    removeBlock(clientId, false);
    if (next !== null) selectBlock(ids.filter((id) => id !== clientId)[next], null); else selectBlock(rootClientId, null);
    announce(__('Step removed.', TEXT));
  }, [rootClientId, stepIds, removeBlock, selectBlock, announce]);

  return { add, duplicate, move, remove, edit, choose };
}

/** The steps of one Scrollytelling block as the board and preview show them, and which one the writer is in. */
export function useStorySteps(rootClientId: string) {
  const { blocks, selectedStep } = useSelect((select) => {
    const editor = select(STORE) as any;
    const all = editor.getBlocks(rootClientId);
    const selected = editor.getSelectedBlockClientId();
    const parents = selected ? editor.getBlockParents(selected) : [];
    const owner = all.find((block: any) => block.clientId === selected || parents.includes(block.clientId));
    return { blocks: all, selectedStep: owner?.clientId as string | undefined };
  }, [rootClientId]);
  const steps: StepSummary[] = useMemo(() => summarizeSteps(blocks), [blocks]);

  // Selecting the story itself, or something outside it, keeps the last step the writer was in.
  const [lastStep, setLastStep] = useState<string>();
  useEffect(() => { if (selectedStep) setLastStep(selectedStep); }, [selectedStep]);
  const active = selectedStep ?? (steps.some((step) => step.clientId === lastStep) ? lastStep : steps[0]?.clientId);
  return { steps, activeId: active, activeIndex: Math.max(0, steps.findIndex((step) => step.clientId === active)), isInside: Boolean(selectedStep) };
}
