import { choiceTone } from "@byline/data";
import { defineDataPresentation, field, slot, type DataPresentationProps, type PrepareInput } from "../../sdk";

/**
 * Test and development only: a repository-coded presentation that proves
 * the whole custom path. Unlike the old Repository Tracker fixture, its facts
 * are not in a `data.ts`: they are a newsroom dataset, published as an
 * immutable release and bound here by role. The code reads choice TONES
 * (positive = done), never a dataset's labels or option values, so the
 * newsroom can rename "Done" to "Finished" freely.
 */
const datasets = {
  phases: slot({
    label: "Phases",
    fields: {
      name: field.text({ label: "Phase" }),
      status: field.choice({ label: "Status", description: "Mark finished phases with a positive tone." }),
      detail: field.longText({ label: "Detail", optional: true }),
      date: field.date({ label: "Date", optional: true })
    }
  })
};

type Settings = Record<never, never>;

export type SidewalkModel = {
  done: number;
  total: number;
  percent: number;
  phases: Array<{ id: string; name: string; status: string; tone: string; detail: string; date: string; dateLabel: string }>;
};

function prepare({ data, format }: PrepareInput<typeof datasets, Settings>): SidewalkModel {
  const { phases } = data;
  const rows = phases.records.map((record) => ({
    id: record.id,
    name: format.value(phases.roles.name, record.roles.name),
    status: format.value(phases.roles.status, record.roles.status),
    tone: choiceTone(phases.roles.status, record.roles.status),
    detail: phases.roles.detail ? format.value(phases.roles.detail, record.roles.detail) : "",
    date: record.roles.date === null ? "" : String(record.roles.date),
    dateLabel: phases.roles.date ? format.value(phases.roles.date, record.roles.date) : ""
  }));
  const done = rows.filter((row) => row.tone === "positive").length;
  return { done, total: rows.length, percent: rows.length ? Math.round((done / rows.length) * 100) : 0, phases: rows };
}

function SidewalkProject({ project, model, format }: DataPresentationProps<typeof datasets, Settings, SidewalkModel>) {
  return (
    <div className="sidewalk" data-fixture-data-presentation="sidewalk">
      <div className="sidewalk-summary">
        <p className="sidewalk-count"><strong>{model.done} of {format.count(model.total, "phase")} done</strong></p>
        <div className="sidewalk-meter" role="img" aria-label={`${model.percent}% of phases done`}><span style={{ width: `${model.percent}%` }} /></div>
      </div>
      <ol className="sidewalk-phases" aria-label={`${project.title}: phases`}>
        {model.phases.map((phase) => (
          <li key={phase.id} data-tone={phase.tone} data-remaining={phase.tone === "positive" ? "false" : "true"}>
            <span className="sidewalk-status">{phase.status}</span>
            <span className="sidewalk-name">{phase.name}</span>
            {phase.dateLabel ? <time className="sidewalk-date" dateTime={phase.date}>{phase.dateLabel}</time> : null}
            {phase.detail ? <span className="sidewalk-detail">{phase.detail}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default defineDataPresentation({
  key: "fixture-sidewalk-project",
  name: "Main Street sidewalk project (fixture)",
  description: "Which phases of the Main Street sidewalk project are done, underway or planned, with a filter for what is left.",
  datasets,
  settings: {},
  styles: true,
  client: true,
  fixture: true,
  prepare,
  Component: SidewalkProject
});
