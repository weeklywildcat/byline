import type { DataValue, PublicFieldDefinition } from "@byline/data";
import { defineDataTemplate, field, setting, slot, type DataPresentationProps } from "../../sdk";

/** Rows printed in the HTML. A larger release is summarized and linked, never silently cut. */
export const TABLE_RENDER_LIMIT = 1000;

const NUMERIC = new Set(["integer", "number", "percentage", "currency"]);

function sortValue(fieldDefinition: PublicFieldDefinition, value: DataValue): string {
  if (value === null) return "";
  if (fieldDefinition.type === "select") return String(fieldDefinition.options.choices.findIndex((choice) => choice.value === value)).padStart(3, "0");
  if (fieldDefinition.type === "boolean") return value ? "1" : "0";
  return String(value);
}

const datasets = {
  rows: slot({
    label: "Rows",
    description: "Any dataset. Every public field becomes a column, in the dataset's order.",
    fields: { heading: field.any({ label: "Row heading", description: "Read first in each row, such as a name. Optional.", optional: true }) }
  })
};
const settings = {
  caption: setting.text({ label: "Caption", description: "What the table shows, in a sentence. Read by screen readers first.", maxLength: 200 }),
  searchable: setting.boolean({ label: "Let readers search and sort", default: true }),
  density: setting.choice({ label: "Rows", default: "comfortable", choices: [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }] })
};

function DataTable({ project, data, format }: DataPresentationProps<typeof datasets, { caption: string; searchable: boolean; density: "comfortable" | "compact" }>) {
  const { rows } = data;
  const heading = rows.roles.heading;
  const columns = heading ? [heading, ...rows.fields.filter((entry) => entry.key !== heading.key)] : rows.fields;
  const shown = rows.records.slice(0, TABLE_RENDER_LIMIT);
  const caption = project.settings.caption || `${rows.dataset.title}: ${format.count(rows.records.length, "row")}`;
  return (
    <div className="data-table" data-searchable={project.settings.searchable ? "true" : "false"} data-density={project.settings.density}>
      <div className="data-table-scroll" tabIndex={0} role="region" aria-label={caption}>
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" data-type={column.type} data-numeric={NUMERIC.has(column.type) ? "" : undefined}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((record) => (
              <tr key={record.id} data-record={record.id}>
                {columns.map((column, index) => {
                  const value = record.values[column.key] ?? null;
                  const text = format.value(column, value);
                  const content = column.type === "url" && value ? <a href={String(value)} rel="nofollow noopener">{text}</a> : text;
                  const cellProps = { key: column.key, "data-sort": sortValue(column, value), "data-numeric": NUMERIC.has(column.type) ? "" : undefined, "data-empty": value === null ? "" : undefined };
                  return heading && index === 0 ? <th scope="row" {...cellProps}>{content}</th> : <td {...cellProps}>{content}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.records.length > shown.length ? <p className="data-table-more">Showing the first {format.count(shown.length, "row")} of {format.count(rows.records.length, "row")}.</p> : null}
    </div>
  );
}

export default defineDataTemplate({
  key: "table",
  name: "Table",
  description: "Every public field as a clean, accessible table that readers can search and sort.",
  datasets,
  settings,
  styles: true,
  client: true,
  Component: DataTable
});
