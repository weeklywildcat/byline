import type { RepositoryTrackerClient } from "../types";

/** Progressive enhancement: a native checkbox that hides the finished phases. Cleans up completely. */
const enhance: RepositoryTrackerClient = (root) => {
  const host = root.querySelector<HTMLElement>("[data-fixture-tracker]");
  if (!host || host.dataset.enhanced === "true") return;
  const label = root.ownerDocument.createElement("label");
  const box = root.ownerDocument.createElement("input");
  box.type = "checkbox";
  label.append(box, "Show only what is left");
  const update = () => { host.dataset.remainingOnly = String(box.checked); };
  box.addEventListener("change", update);
  host.prepend(label);
  host.dataset.enhanced = "true";
  return () => {
    box.removeEventListener("change", update);
    label.remove();
    delete host.dataset.enhanced;
    delete host.dataset.remainingOnly;
  };
};

export default enhance;
