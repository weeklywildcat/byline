import type { VisualStoryClient } from "../../types";

/**
 * Progressive enhancement for WordPress post 10's narrative, loaded on this
 * story's page alone. The narrative is complete without it.
 *
 * A step is active while it covers a reading line 40% down the viewport,
 * watched by one IntersectionObserver. Ordinary scrolling only: never move the
 * reader's scroll position or listen to scroll events.
 */
const READING_LINE = 40;

const enhance: VisualStoryClient = (root) => {
  const sequence = root.querySelector<HTMLElement>(".story-visual-fixture-sequence");
  const view = root.ownerDocument.defaultView;
  if (!sequence || !view?.IntersectionObserver) return;
  const steps = Array.from(sequence.querySelectorAll<HTMLElement>(".story-visual-fixture-step"));
  const bars = Array.from(sequence.querySelectorAll<SVGGElement>(".story-visual-fixture-bar"));
  const show = (index: number) => {
    const highlight = Number(steps[index]?.dataset.highlight);
    steps.forEach((step, i) => step.classList.toggle("is-active", i === index));
    bars.forEach((bar, i) => bar.classList.toggle("is-highlighted", i === highlight));
  };

  const observer = new view.IntersectionObserver((entries) => {
    const covering = entries.filter((entry) => entry.isIntersecting).map((entry) => steps.indexOf(entry.target as HTMLElement));
    if (covering.length) show(Math.max(...covering));
  }, { rootMargin: `-${READING_LINE}% 0px -${100 - READING_LINE - 1}% 0px` });
  steps.forEach((step) => observer.observe(step));
  sequence.classList.add("is-enhanced");
  show(0);
  return () => {
    observer.disconnect();
    sequence.classList.remove("is-enhanced");
  };
};

export default enhance;
