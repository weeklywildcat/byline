import type { DataPresentationClient } from "../../sdk";

/** Progressive enhancement: a native checkbox that hides finished phases. Everything it filters is already in the HTML. */
const enhance: DataPresentationClient = (root) => {
  const host = root.querySelector<HTMLElement>("[data-fixture-data-presentation]");
  if (!host || host.dataset.enhanced === "true") return;
  const document = root.ownerDocument;
  const label = document.createElement("label");
  label.className = "sidewalk-filter";
  const box = document.createElement("input");
  box.type = "checkbox";
  label.append(box, "Show only what is left");
  const update = () => {
    host.dataset.remainingOnly = String(box.checked);
  };
  box.addEventListener("change", update);
  host.querySelector(".sidewalk-phases")?.before(label);
  host.dataset.enhanced = "true";
  return () => {
    box.removeEventListener("change", update);
    label.remove();
    delete host.dataset.enhanced;
    delete host.dataset.remainingOnly;
  };
};

export default enhance;
