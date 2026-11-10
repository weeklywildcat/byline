import type { DataPresentationClient } from "../../sdk";

/**
 * Progressive enhancement for the Table template: a search box and sortable
 * column headers over the rows already in the HTML. Without script the table
 * is complete; with it, nothing is fetched. Cleans up completely.
 */
const enhance: DataPresentationClient = (root) => {
  const host = root.querySelector<HTMLElement>(".data-table");
  const table = host?.querySelector("table");
  const body = table?.tBodies[0];
  if (!host || !table || !body || host.dataset.searchable !== "true" || host.dataset.enhanced === "true") return;
  const document = root.ownerDocument;
  const rows = [...body.rows];
  const original = [...rows];
  const cleanups: Array<() => void> = [];

  const tools = document.createElement("div");
  tools.className = "data-table-tools";
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.placeholder = "Search the table";
  label.append(Object.assign(document.createElement("span"), { className: "data-table-tools-label", textContent: "Search" }), input);
  const status = document.createElement("p");
  status.className = "data-table-status";
  status.setAttribute("role", "status");
  tools.append(label, status);
  host.prepend(tools);

  const text = rows.map((row) => row.textContent?.toLocaleLowerCase() ?? "");
  const update = () => {
    const needle = input.value.trim().toLocaleLowerCase();
    let visible = 0;
    rows.forEach((row, index) => {
      const show = !needle || text[index].includes(needle);
      row.hidden = !show;
      if (show) visible++;
    });
    status.textContent = needle ? `${visible} of ${rows.length} rows match` : "";
  };
  input.addEventListener("input", update);
  cleanups.push(() => input.removeEventListener("input", update));

  const headers = [...table.tHead!.rows[0].cells];
  let sorted: { index: number; direction: "ascending" | "descending" } | null = null;
  headers.forEach((header, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "data-table-sort";
    button.append(...header.childNodes);
    header.append(button);
    const sort = () => {
      const direction = sorted?.index === index && sorted.direction === "ascending" ? "descending" : "ascending";
      sorted = { index, direction };
      const numeric = header.hasAttribute("data-numeric");
      const key = (row: HTMLTableRowElement) => row.cells[index]?.getAttribute("data-sort") ?? "";
      const ordered = [...original].sort((a, b) => {
        const [left, right] = [key(a), key(b)];
        if (!left || !right) return left === right ? 0 : left ? -1 : 1;
        const compared = numeric ? Number(left) - Number(right) : left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
        return direction === "ascending" ? compared : -compared;
      });
      body.append(...ordered);
      headers.forEach((cell, other) => (other === index ? cell.setAttribute("aria-sort", direction) : cell.removeAttribute("aria-sort")));
    };
    button.addEventListener("click", sort);
    cleanups.push(() => {
      button.removeEventListener("click", sort);
      header.append(...button.childNodes);
      button.remove();
      header.removeAttribute("aria-sort");
    });
  });
  host.dataset.enhanced = "true";

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    body.append(...original);
    rows.forEach((row) => (row.hidden = false));
    tools.remove();
    delete host.dataset.enhanced;
  };
};

export default enhance;
