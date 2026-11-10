import { compareDecimal } from "@byline/data";
import { defineDataTemplate, field, setting, slot, type DataPresentationProps, type PrepareInput } from "../../sdk";

const datasets = {
  entries: slot({
    label: "Entries",
    description: "One row per entry: a band, a school, a candidate.",
    fields: {
      name: field.text({ label: "Name" }),
      value: field.number({ label: "Score", description: "What the ranking is by." }),
      detail: field.text({ label: "Detail", description: "A short line under the name.", optional: true }),
      highlight: field.boolean({ label: "Highlight", description: "Marks an entry, such as a winner or a local school.", optional: true })
    }
  })
};
const settings = {
  order: setting.choice({ label: "Rank by", default: "desc", choices: [{ value: "desc", label: "Highest first" }, { value: "asc", label: "Lowest first" }] }),
  limit: setting.number({ label: "Show at most", description: "0 shows every entry.", default: 0, min: 0, max: 100 }),
  bars: setting.boolean({ label: "Show bars", default: true }),
  valueLabel: setting.text({ label: "Score label", description: "What the number is, such as Points.", maxLength: 40 })
};

type Settings = { order: "desc" | "asc"; limit: number; bars: boolean; valueLabel: string };
export type RankedEntry = { id: string; rank: number; tied: boolean; name: string; value: string; share: number; detail: string; highlight: boolean };
export type RankingModel = { entries: RankedEntry[]; unranked: number; total: number };

/**
 * The trusted transform: standard competition ranking ("1, 2, 2, 4"),
 * shares of the leader for the bars, entries without a score counted but
 * not ranked. Deterministic: only the bound data and settings.
 */
export function rankEntries({ data, settings, format }: PrepareInput<typeof datasets, Settings>): RankingModel {
  const { entries } = data;
  const scored = entries.records.filter((record) => record.roles.value !== null && record.roles.name !== null);
  const valueField = entries.roles.value;
  const compareValues = (left: (typeof scored)[number], right: (typeof scored)[number]) =>
    valueField?.type === "currency"
      ? compareDecimal(String(left.roles.value), String(right.roles.value))
      : Number(left.roles.value) - Number(right.roles.value);
  const sign = settings.order === "asc" ? 1 : -1;
  const sorted = [...scored].sort((a, b) => sign * compareValues(a, b) || String(a.roles.name).localeCompare(String(b.roles.name)) || a.id.localeCompare(b.id));
  const max = Math.max(0, ...sorted.map((record) => Math.abs(Number(record.roles.value))));
  let previousRank = 0;
  const ranked = sorted.map((record, index) => {
    const sameAsPrevious = index > 0 && compareValues(sorted[index - 1]!, record) === 0;
    const sameAsNext = index + 1 < sorted.length && compareValues(record, sorted[index + 1]!) === 0;
    const rank = sameAsPrevious ? previousRank : index + 1;
    previousRank = rank;
    return {
      id: record.id,
      rank,
      tied: sameAsPrevious || sameAsNext,
      name: format.value(entries.roles.name, record.roles.name),
      value: format.value(entries.roles.value, record.roles.value),
      share: max ? Math.round((Math.abs(Number(record.roles.value)) / max) * 1000) / 10 : 0,
      detail: entries.roles.detail ? format.value(entries.roles.detail, record.roles.detail) : "",
      highlight: record.roles.highlight === true,
      index
    };
  });
  const limited = settings.limit > 0 ? ranked.slice(0, settings.limit) : ranked;
  return { entries: limited.map(({ index: _index, ...entry }) => entry), unranked: entries.records.length - scored.length, total: scored.length };
}

function Ranking({ project, data, model, format }: DataPresentationProps<typeof datasets, Settings, RankingModel>) {
  const label = project.settings.valueLabel || data.entries.roles.value?.label || "Score";
  if (!model.entries.length) return <p className="data-ranking-empty">Nothing has been ranked yet.</p>;
  return (
    <div className="data-ranking" data-bars={project.settings.bars ? "true" : "false"}>
      <ol className="data-ranking-list" aria-label={`${data.entries.dataset.title}, ranked by ${label.toLowerCase()}`}>
        {model.entries.map((entry) => (
          <li key={entry.id} className="data-ranking-entry" data-highlight={entry.highlight ? "true" : undefined} style={{ ["--data-share" as string]: `${entry.share}%` }}>
            <span className="data-ranking-rank" aria-label={`${entry.tied ? "Tied for " : "Rank "}${entry.rank}`}>{entry.tied ? `T-${entry.rank}` : entry.rank}</span>
            <span className="data-ranking-name">
              {entry.name}
              {entry.highlight ? <span className="data-ranking-flag"> · {data.entries.roles.highlight?.label ?? "Highlighted"}</span> : null}
              {entry.detail ? <span className="data-ranking-detail">{entry.detail}</span> : null}
            </span>
            <span className="data-ranking-value"><span className="data-ranking-value-label">{label}: </span>{entry.value}</span>
            {project.settings.bars ? <span className="data-ranking-bar" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      {model.unranked ? <p className="data-ranking-note">{format.count(model.unranked, "entry", "entries")} without a {label.toLowerCase()} {model.unranked === 1 ? "is" : "are"} not ranked.</p> : null}
    </div>
  );
}

export default defineDataTemplate({
  key: "ranking",
  name: "Ranking",
  description: "A ranked list by one number, with ties, optional bars and a highlighted entry. Results, standings, leaderboards.",
  datasets,
  settings,
  styles: true,
  prepare: rankEntries,
  Component: Ranking
});
