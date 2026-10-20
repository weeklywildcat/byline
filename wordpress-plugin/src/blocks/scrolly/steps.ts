import { plainHeading, type StoryBlock } from '../story/headings';
import { hasImage, type StoryImage } from '../story/models';

/** What the story board and the reader preview need to know about one Story Step. */
export type StepSummary = {
  clientId: string;
  /** 0-based position in the story. */
  index: number;
  heading: string;
  /** Opening words of the reporting, for the preview. */
  excerpt: string;
  image?: StoryImage;
  caption: string;
  /** The step's own photograph is missing alt text. */
  needsAlt: boolean;
};

const textOf = (block: StoryBlock | undefined) => (block ? plainHeading(String(block.attributes.content || '')) : '');

export function summarizeStep(block: StoryBlock, index: number): StepSummary {
  const inner = block.innerBlocks || [];
  const image = hasImage(block.attributes.image) ? (block.attributes.image as StoryImage) : undefined;
  const heading = inner.find((child) => child.name === 'core/heading');
  const paragraph = inner.find((child) => child.name === 'core/paragraph' && textOf(child));
  return {
    clientId: block.clientId,
    index,
    heading: textOf(heading),
    excerpt: textOf(paragraph),
    image,
    caption: String(block.attributes.caption || ''),
    needsAlt: Boolean(image && !image.alt)
  };
}

export function summarizeSteps(blocks: StoryBlock[]): StepSummary[] {
  return blocks.filter((block) => block.name === 'byline/scrolly-step').map(summarizeStep);
}

/**
 * The step whose photograph the sticky stage shows at `index`. A step without
 * its own photograph keeps the previous one; steps before the first photograph
 * show that first photograph. Mirrors enhanceScrolly().
 */
export function stageStep<T extends Pick<StepSummary, 'image'>>(steps: T[], index: number): T | undefined {
  for (let i = Math.min(index, steps.length - 1); i >= 0; i -= 1) if (steps[i].image) return steps[i];
  return steps.find((step) => step.image);
}

/** The step to select after the one at `index` is removed from a story of `count` steps. */
export function indexAfterRemoval(index: number, count: number): number | null {
  return count <= 1 ? null : Math.min(index, count - 2);
}

/** Where a step moves, or null when it is already at that end. */
export function movedIndex(index: number, direction: -1 | 1, count: number): number | null {
  const destination = index + direction;
  return destination < 0 || destination >= count ? null : destination;
}

/** Roving-focus target for an arrow key pressed on a board card. */
export function boardFocusIndex(index: number, key: string, count: number): number | null {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, index - 1);
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, index + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
