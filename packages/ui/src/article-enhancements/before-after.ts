/**
 * Before / After comparison.
 *
 * The native <input type="range"> is the control. It is laid over the
 * photograph (see `.byline-comparison-range` in newsroom-blocks.css), so the
 * reader drags, taps or uses the arrow keys directly on the image. The script
 * only mirrors the value into CSS custom properties; both complete images stay
 * in the DOM and the no-script figure is untouched.
 */
export function enhanceBeforeAfter(figure: HTMLElement, signal: AbortSignal): (() => void) | null {
  const doc = figure.ownerDocument;
  const frame = figure.querySelector<HTMLElement>(".byline-comparison-images");
  if (!frame || frame.querySelectorAll(".byline-comparison-image img").length !== 2) return null;

  const before = figure.querySelector("[data-before]")?.textContent || "Before";
  const after = figure.querySelector("[data-after]")?.textContent || "After";

  const labels = doc.createElement("div");
  labels.className = "byline-comparison-labels";
  labels.setAttribute("aria-hidden", "true");
  for (const label of figure.querySelectorAll(".byline-comparison-image strong")) {
    const copy = doc.createElement("span");
    copy.textContent = label.textContent;
    labels.append(copy);
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

  function update() {
    const value = Number(range.value);
    figure.style.setProperty("--comparison-position", `${value}%`);
    figure.style.setProperty("--comparison-ratio", String(value / 100));
    range.setAttribute("aria-valuetext", `${value}% after image revealed`);
  }
  range.addEventListener("input", update, { signal });
  update();

  frame.append(labels, divider, range);
  figure.classList.add("is-enhanced");
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
