/**
 * Before / After comparison.
 *
 * The native <input type="range"> is the control. It is laid over the
 * photograph (see `.byline-comparison-range` in newsroom/before-after.css), so
 * the reader drags, taps or uses the arrow keys directly on the image. The
 * value is where the divider stands, from the left: Before shows to its left
 * and After to its right. The script only mirrors the value into CSS custom
 * properties; both complete images stay in the DOM and the no-script figure is
 * untouched.
 */

/** What the stylesheet and assistive technology need to know about a divider position (0-100). */
export function comparisonState(value: number, before: string, after: string) {
  return { position: `${value}%`, ratio: String(value / 100), valueText: `${value}% ${before}, ${100 - value}% ${after}` };
}

export function enhanceBeforeAfter(figure: HTMLElement, signal: AbortSignal): (() => void) | null {
  const doc = figure.ownerDocument;
  const frame = figure.querySelector<HTMLElement>(".byline-comparison-images");
  if (!frame || frame.querySelectorAll(".byline-comparison-image img").length !== 2) return null;

  const before = figure.querySelector("[data-before]")?.textContent || "Before";
  const after = figure.querySelector("[data-after]")?.textContent || "After";

  const labels = doc.createElement("div");
  labels.className = "byline-comparison-labels";
  labels.setAttribute("aria-hidden", "true");
  const chips: HTMLElement[] = [];
  for (const label of figure.querySelectorAll(".byline-comparison-image strong")) {
    const copy = doc.createElement("span");
    copy.textContent = label.textContent;
    labels.append(copy);
    chips.push(copy);
  }

  const divider = doc.createElement("span");
  divider.className = "byline-comparison-divider";
  divider.setAttribute("aria-hidden", "true");

  const range = doc.createElement("input");
  range.type = "range";
  range.className = "byline-comparison-range";
  range.min = "0";
  range.max = "100";
  range.step = "1";
  range.value = "50";
  range.setAttribute("aria-label", `Compare ${before} and ${after}`);

  /** A label fades once the divider has passed over the photograph it names. */
  function fadeCoveredLabels(value: number) {
    const width = frame!.clientWidth;
    if (!width || chips.length !== 2) return;
    const thumb = parseFloat(doc.defaultView!.getComputedStyle(figure).getPropertyValue("--comparison-thumb")) || 48;
    const edge = thumb / 2 + (width - thumb) * (value / 100);
    chips[0].classList.toggle("is-covered", edge < chips[0].offsetLeft + chips[0].offsetWidth + 8);
    chips[1].classList.toggle("is-covered", edge > chips[1].offsetLeft - 8);
  }
  function update() {
    const value = Number(range.value);
    const state = comparisonState(value, before, after);
    figure.style.setProperty("--comparison-position", state.position);
    figure.style.setProperty("--comparison-ratio", state.ratio);
    range.setAttribute("aria-valuetext", state.valueText);
    fadeCoveredLabels(value);
  }
  range.addEventListener("input", update, { signal });
  doc.defaultView?.addEventListener("resize", update, { signal });

  frame.append(labels, divider, range);
  figure.classList.add("is-enhanced");
  update();
  return () => {
    labels.remove();
    divider.remove();
    range.remove();
    figure.style.removeProperty("--comparison-position");
    figure.style.removeProperty("--comparison-ratio");
    figure.classList.remove("is-enhanced");
    // Leave the saved markup exactly as it was found.
    if (!figure.getAttribute("style")) figure.removeAttribute("style");
    if (!figure.getAttribute("class")) figure.removeAttribute("class");
  };
}
