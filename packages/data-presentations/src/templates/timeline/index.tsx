import { choiceTone } from "@byline/data";
import { defineDataTemplate, field, headingTag, setting, slot, type DataPresentationProps, type PrepareInput } from "../../sdk";

const datasets = {
  events: slot({
    label: "Events",
    description: "One row per moment, with a date.",
    fields: {
      title: field.text({ label: "Title" }),
      date: field.date({ label: "Date" }),
      detail: field.longText({ label: "Detail", optional: true }),
      status: field.choice({ label: "Status", description: "Such as Done, Underway, Planned.", optional: true }),
      link: field.url({ label: "Link", description: "Coverage or a document to read more.", optional: true })
    }
  })
};
const settings = {
  order: setting.choice({ label: "Order", default: "oldest", choices: [{ value: "oldest", label: "Oldest first" }, { value: "newest", label: "Newest first" }] }),
  groupByYear: setting.boolean({ label: "Group by year", default: true }),
  linkLabel: setting.text({ label: "Link text", default: "Read more", maxLength: 40 })
};

type Settings = { order: "oldest" | "newest"; groupByYear: boolean; linkLabel: string };
export type TimelineEntry = { id: string; title: string; date: string; dateLabel: string; detail: string; status: string; tone: string; link: string };
export type TimelineModel = { groups: Array<{ label: string; entries: TimelineEntry[] }>; undated: number };

/** Sorts by date (ties keep the newsroom's order) and groups by year. Rows without a date are counted, not invented. */
export function buildTimeline({ data, settings, format }: PrepareInput<typeof datasets, Settings>): TimelineModel {
  const { events } = data;
  const dated = events.records.map((record, index) => ({ record, index })).filter(({ record }) => record.roles.date !== null && record.roles.title !== null);
  const sign = settings.order === "newest" ? -1 : 1;
  dated.sort((a, b) => sign * String(a.record.roles.date).localeCompare(String(b.record.roles.date)) || a.index - b.index);
  const groups: TimelineModel["groups"] = [];
  for (const { record } of dated) {
    const date = String(record.roles.date);
    const label = settings.groupByYear ? date.slice(0, 4) : "";
    if (groups.at(-1)?.label !== label || !groups.length) groups.push({ label, entries: [] });
    groups.at(-1)!.entries.push({
      id: record.id,
      title: format.value(events.roles.title, record.roles.title),
      date,
      dateLabel: format.value(events.roles.date, record.roles.date),
      detail: events.roles.detail ? format.value(events.roles.detail, record.roles.detail) : "",
      status: events.roles.status ? format.value(events.roles.status, record.roles.status) : "",
      tone: choiceTone(events.roles.status, record.roles.status),
      link: record.roles.link ? String(record.roles.link) : ""
    });
  }
  return { groups, undated: events.records.length - dated.length };
}

function Timeline({ project, data, model, format, headingLevel }: DataPresentationProps<typeof datasets, Settings, TimelineModel>) {
  // Year headings sit at the host's level (h2 on the page, h3 in a Story); entries one level below.
  const Year = headingTag(headingLevel);
  const Entry = headingTag(headingLevel, 1);
  if (!model.groups.length) return <p className="data-timeline-empty">Nothing is on this timeline yet.</p>;
  return (
    <div className="data-timeline">
      {model.groups.map((group) => (
        <section key={group.label || "all"} className="data-timeline-group" aria-label={group.label || data.events.dataset.title}>
          {group.label ? <Year className="data-timeline-year">{group.label}</Year> : null}
          <ol className="data-timeline-list">
            {group.entries.map((entry) => (
              <li key={entry.id} className="data-timeline-entry" data-tone={entry.tone}>
                <time className="data-timeline-date" dateTime={entry.date}>{entry.dateLabel}</time>
                <div className="data-timeline-content">
                  <Entry className="data-timeline-title">{entry.title}</Entry>
                  {entry.status ? <p className="data-timeline-status">{entry.status}</p> : null}
                  {entry.detail ? entry.detail.split(/\n+/).map((line, index) => <p key={index} className="data-timeline-detail">{line}</p>) : null}
                  {entry.link ? <p className="data-timeline-link"><a href={entry.link} rel="noopener">{project.settings.linkLabel || "Read more"}<span className="data-visually-hidden">: {entry.title}</span></a></p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {model.undated ? <p className="data-timeline-note">{format.count(model.undated, "entry", "entries")} without a date {model.undated === 1 ? "is" : "are"} not shown.</p> : null}
    </div>
  );
}

export default defineDataTemplate({
  key: "timeline",
  name: "Timeline",
  description: "Dated moments in order, grouped by year, with an optional status and link. Projects, cases, a season.",
  datasets,
  settings,
  styles: true,
  prepare: buildTimeline,
  Component: Timeline
});
