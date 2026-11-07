import type { RepositoryInteractiveClient } from "../types";

/** Progressive enhancement: a native slider that recomputes the waits in the static table. */
const enhance: RepositoryInteractiveClient = (root) => {
  const host = root.querySelector<HTMLElement>("[data-fixture-interactive]");
  if (!host || host.dataset.enhanced === "true") return;
  const first = host.querySelector<HTMLElement>('[data-wait="first"]');
  const second = host.querySelector<HTMLElement>('[data-wait="second"]');
  const label = root.ownerDocument.createElement("label");
  label.textContent = "Minutes per lunch period ";
  const range = root.ownerDocument.createElement("input");
  range.type = "range";
  range.min = "20";
  range.max = "40";
  range.step = "5";
  range.value = "30";
  const output = root.ownerDocument.createElement("output");
  output.textContent = "30";
  label.append(range, output);
  const update = () => {
    const minutes = Number(range.value);
    output.textContent = String(minutes);
    // 30 minutes is the baseline: each five minutes saves about two minutes in line.
    if (first) first.textContent = String(Math.max(1, Math.round(8 - ((minutes - 30) / 5) * 2)));
    if (second) second.textContent = String(Math.max(1, Math.round(14 - ((minutes - 30) / 5) * 2)));
  };
  range.addEventListener("input", update);
  host.prepend(label);
  host.dataset.enhanced = "true";
  return () => {
    label.remove();
    range.removeEventListener("input", update);
    delete host.dataset.enhanced;
  };
};

export default enhance;
