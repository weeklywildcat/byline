import {
  chartModel,
  chartPercent,
  finalScoreKicker,
  finalScoreSentence,
  finalScoreWinner,
  formatCalendarDate,
  formatTick,
  formatTimestamp,
  socialProviderLabel,
  webUrlHost,
  type FinalScoreBlock,
  type MediaChapter,
  type NativeChartData,
  type NativeChartType,
  type PublicEventReference
} from "@byline/article-body";
import type { CSSProperties, ReactNode } from "react";

/**
 * Primitives for the tools added in the second article-tools pass: native
 * charts, Event, Social Post, Final Score, Repository Tracker and media
 * chapters. Same rules as `primitives.tsx`: element trees and classes the
 * shared CSS (`newsroom/article-tools.css`) styles, content as slots, no
 * editing state, no CMS. The editor passes its inputs into the same slots.
 */

const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");
const cssVars = (vars: Record<string, string>) => vars as CSSProperties;

// ---------------------------------------------------------------------------
// Native charts: server-rendered HTML and SVG. Series differ by shape and line
// pattern as well as tone, every bar carries its value, and the data is always
// one disclosure away. No script is needed to read any of it.
// ---------------------------------------------------------------------------

const CHART_NAMES: Record<NativeChartType, string> = { bar: "Bar chart", line: "Line chart", dot: "Dot plot" };

function ChartKey({ labels }: { labels: string[] }): ReactNode {
  if (labels.length < 2) return null;
  return (
    <ul className="byline-chart-key">
      {labels.map((label, index) => (
        <li key={index}><span className="byline-chart-swatch" data-series={index} aria-hidden="true" />{label}</li>
      ))}
    </ul>
  );
}

function Ticks({ ticks, min, max }: { ticks: number[]; min: number; max: number }): ReactNode {
  const step = ticks[1]! - ticks[0]!;
  return (
    <div className="byline-chart-ticks" aria-hidden="true">
      {ticks.map((tick) => (
        <span key={tick} className={join("byline-chart-tick", tick === 0 && "is-zero")} style={cssVars({ "--at": `${chartPercent({ min, max }, tick)}%` })}>
          <span className="byline-chart-tick-label">{formatTick(tick, step)}</span>
        </span>
      ))}
    </div>
  );
}

function BarChart({ data }: { data: NativeChartData }): ReactNode {
  const model = chartModel(data);
  const zero = chartPercent(model, 0);
  return (
    <>
      <ChartKey labels={model.series.map((series) => series.label)} />
      <div className="byline-chart-plot" data-series-count={model.series.length}>
        <Ticks ticks={model.ticks} min={model.min} max={model.max} />
        <ol className="byline-chart-rows">
          {model.categories.map((category, row) => (
            <li key={category.id} className="byline-chart-row">
              <span className="byline-chart-category">{category.label}</span>
              <span className="byline-chart-group">
                {model.series.map((series, index) => {
                  const value = series.values[row];
                  if (value === null || value === undefined) return <span key={series.id} className="byline-chart-bar is-empty" data-series={index}><span className="byline-chart-value">No data</span></span>;
                  const at = chartPercent(model, value);
                  return (
                    <span key={series.id} className={join("byline-chart-bar", value < 0 && "is-negative")} data-series={index} style={cssVars({ "--from": `${Math.min(at, zero)}%`, "--size": `${Math.abs(at - zero)}%` })}>
                      <span className="byline-chart-value">{series.texts[row]}</span>
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function DotChart({ data }: { data: NativeChartData }): ReactNode {
  const model = chartModel(data);
  return (
    <>
      <ChartKey labels={model.series.map((series) => series.label)} />
      <div className="byline-chart-plot">
        <Ticks ticks={model.ticks} min={model.min} max={model.max} />
        <ol className="byline-chart-rows">
          {model.categories.map((category, row) => (
            <li key={category.id} className="byline-chart-row">
              <span className="byline-chart-category">{category.label}</span>
              <span className="byline-chart-track">
                {model.series.map((series, index) => {
                  const value = series.values[row];
                  if (value === null || value === undefined) return null;
                  return <span key={series.id} className="byline-chart-dot" data-series={index} style={cssVars({ "--at": `${chartPercent(model, value)}%` })} />;
                })}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

const DASHES = ["", "6 4", "2 3", "10 3 2 3"];

function LineChart({ data }: { data: NativeChartData }): ReactNode {
  const model = chartModel(data);
  const tickStep = model.ticks[1]! - model.ticks[0]!;
  const count = model.categories.length;
  const x = (index: number) => (count > 1 ? (index / (count - 1)) * 100 : 50);
  const y = (value: number) => 100 - chartPercent(model, value);
  // Label a handful of categories along the axis: the first, the last and evenly between.
  const step = Math.max(1, Math.ceil(count / 6));
  return (
    <>
      <ChartKey labels={model.series.map((series) => series.label)} />
      <div className="byline-chart-plot byline-chart-line-plot">
        <div className="byline-chart-line-area">
          <div className="byline-chart-gridlines" aria-hidden="true">
            {model.ticks.map((tick) => (
              <span key={tick} className={join("byline-chart-gridline", tick === 0 && "is-zero")} style={cssVars({ "--at": `${chartPercent(model, tick)}%` })}>
                <span className="byline-chart-tick-label">{formatTick(tick, tickStep)}</span>
              </span>
            ))}
          </div>
          <svg className="byline-chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {model.series.map((series, index) => {
              const points = series.values.map((value, i) => (value === null ? null : `${x(i)},${y(value)}`));
              // A missing value breaks the line rather than inventing a slope through it.
              const segments: string[][] = [[]];
              for (const point of points) {
                if (point === null) segments.push([]);
                else segments[segments.length - 1]!.push(point);
              }
              return segments.filter((segment) => segment.length > 1).map((segment, part) => (
                <polyline key={`${series.id}-${part}`} className="byline-chart-line" data-series={index} points={segment.join(" ")} strokeDasharray={DASHES[index] || undefined} />
              ));
            })}
          </svg>
          {model.series.map((series, index) => series.values.map((value, i) => (value === null ? null : (
            <span key={`${series.id}-${i}`} className="byline-chart-point" data-series={index} style={cssVars({ "--x": `${x(i)}%`, "--y": `${y(value)}%` })} aria-hidden="true" />
          ))))}
          {model.series.length > 1 ? model.series.map((series, index) => {
            const last = series.values.map((value, i) => [value, i] as const).filter(([value]) => value !== null).at(-1);
            if (!last) return null;
            return <span key={series.id} className="byline-chart-end-label" data-series={index} style={cssVars({ "--y": `${y(last[0]!)}%` })} aria-hidden="true">{series.label}</span>;
          }) : null}
        </div>
        <ol className="byline-chart-x" aria-hidden="true">
          {model.categories.map((category, index) => (index % step === 0 || index === count - 1 ? (
            <li key={category.id} style={cssVars({ "--x": `${x(index)}%` })}>{category.label}</li>
          ) : null))}
        </ol>
      </div>
    </>
  );
}

/** The drawn chart, named for assistive technology by the figure's title and summary. */
export function NativeChart({ type, data, labelledBy }: { type: NativeChartType; data: NativeChartData; labelledBy?: string }): ReactNode {
  return (
    <div className="byline-native-chart" data-chart={type} role="img" aria-roledescription={CHART_NAMES[type].toLowerCase()} aria-labelledby={labelledBy}>
      {type === "line" ? <LineChart data={data} /> : type === "dot" ? <DotChart data={data} /> : <BarChart data={data} />}
    </div>
  );
}

/** "Show the data": the chart's own table, in a native disclosure. */
export function ChartDataTable({ data, caption }: { data: NativeChartData; caption: string }): ReactNode {
  const rows = data.rows.filter((row) => row.cells.some((cell) => cell.trim()));
  return (
    <details className="byline-chart-data">
      <summary>Show the data</summary>
      <div className="byline-data-table">
        <div className="byline-data-table-scroll" role="region" aria-label={`Data: ${caption}`} tabIndex={0}>
          <table>
            <caption className="byline-chart-data-caption">{caption}</caption>
            <thead><tr>{data.columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>{row.cells.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Media chapters: ordinary timestamp links; the enhancer makes them seek.
// ---------------------------------------------------------------------------

export function MediaChapters({ chapters, href, label = "Chapters" }: { chapters: readonly MediaChapter[]; href: (time: number) => string; label?: string }): ReactNode {
  if (!chapters.length) return null;
  return (
    <nav className="byline-media-chapters" aria-label={label}>
      <p className="byline-kicker">{label}</p>
      <ol>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <a href={href(chapter.time)} data-byline-seek={chapter.time}>
              <span className="byline-chapter-time">{formatTimestamp(chapter.time)}</span>
              <span className="byline-chapter-label">{chapter.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/** When an event happens, in the publication's own timezone: "Wednesday, Jan. 14, 2026, 6–8 p.m." */
export function formatEventWhen(event: Pick<PublicEventReference, "startAt" | "endAt" | "allDay">, timeZone = "UTC", locale = "en-US"): string {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;
  const day = (date: Date) => new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone }).format(date);
  const time = (date: Date) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(date).replace(":00", "").replace(/\s?AM$/, " a.m.").replace(/\s?PM$/, " p.m.");
  const sameDay = end && day(start) === day(end);
  if (event.allDay) return end && !sameDay ? `${day(start)} – ${day(end)}` : day(start);
  if (!end) return `${day(start)}, ${time(start)}`;
  if (sameDay) {
    const from = time(start);
    const to = time(end);
    const meridiem = (value: string) => value.slice(-4);
    return `${day(start)}, ${meridiem(from) === meridiem(to) ? from.slice(0, -5) : from}–${to}`;
  }
  return `${day(start)}, ${time(start)} – ${day(end)}, ${time(end)}`;
}

export function EventView({ headingId, event, title, timeZone, locale }: { headingId: string; event: PublicEventReference; title?: ReactNode; timeZone?: string; locale?: string }): ReactNode {
  const canceled = event.eventStatus === "canceled";
  return (
    <aside className="byline-event" data-status={event.eventStatus} aria-labelledby={headingId}>
      <p className="byline-kicker">{canceled ? "Canceled" : event.eventType ? `Event · ${event.eventType}` : "Event"}</p>
      <h3 id={headingId} className="byline-event-title">{title ?? event.title}</h3>
      <p className="byline-event-when"><time dateTime={event.startAt}>{formatEventWhen(event, timeZone, locale)}</time></p>
      {event.location ? <p className="byline-event-where">{event.location}</p> : null}
      {event.description ? <p className="byline-event-description">{event.description}</p> : null}
      {event.externalUrl ? <p className="byline-event-link"><a href={event.externalUrl} rel="noopener">Event details on {webUrlHost(event.externalUrl)}</a></p> : null}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Social Post: a Byline-owned facade with the permalink. The provider's own
// embed loads only when a reader asks (enhanceSocialPosts).
// ---------------------------------------------------------------------------

export function SocialPostFigure({ provider, postId, url, caption, facadeNote, children }: { provider: string; postId: string; url: string; caption?: ReactNode; facadeNote?: ReactNode; children?: ReactNode }): ReactNode {
  const label = socialProviderLabel(provider);
  return (
    <figure className="byline-social-post" data-provider={provider} data-post-id={postId} data-url={url}>
      <div className="byline-social-frame" data-state="facade">
        <div className="byline-social-facade">
          <p className="byline-kicker">{label} post</p>
          <p className="byline-social-facade-note">{facadeNote ?? `This post is hosted by ${label}. Loading it shares your visit with ${label}.`}</p>
          {children}
        </div>
      </div>
      <figcaption>
        {caption}
        <p className="byline-social-link"><a href={url} rel="noopener noreferrer" referrerPolicy="no-referrer">View the post on {label}</a></p>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Final Score: two ruled rows, the winner in a stronger weight only.
// ---------------------------------------------------------------------------

export function FinalScoreView({ block, teamA, teamB, scoreA, scoreB, details, note }: {
  block: Pick<FinalScoreBlock, "status" | "sport" | "teamA" | "teamB" | "teamAScore" | "teamBScore">;
  teamA?: ReactNode;
  teamB?: ReactNode;
  scoreA?: ReactNode;
  scoreB?: ReactNode;
  details?: ReactNode;
  note?: ReactNode;
}): ReactNode {
  const winner = finalScoreWinner(block);
  return (
    <section className="byline-final-score" data-status={block.status} aria-label={finalScoreSentence(block)}>
      <p className="byline-kicker">{finalScoreKicker(block)}</p>
      <div className="byline-final-score-rows">
        <div className="byline-final-score-row" data-winner={winner === "a" || undefined}>
          <span className="byline-final-score-team">{teamA ?? block.teamA}</span>
          <span className="byline-final-score-value">{scoreA ?? (block.teamAScore ?? "–")}</span>
        </div>
        <div className="byline-final-score-row" data-winner={winner === "b" || undefined}>
          <span className="byline-final-score-team">{teamB ?? block.teamB}</span>
          <span className="byline-final-score-value">{scoreB ?? (block.teamBScore ?? "–")}</span>
        </div>
      </div>
      {details ? <p className="byline-final-score-meta">{details}</p> : null}
      {note ? <p className="byline-final-score-note">{note}</p> : null}
    </section>
  );
}

/** "Fri., Oct. 17, 2025 · Wildcat Stadium" */
export function finalScoreDetails(block: Pick<FinalScoreBlock, "date" | "location">): string {
  return [block.date ? formatCalendarDate(block.date) : "", block.location ?? ""].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Repository Tracker: like a repository interactive, a distinct editorial idea.
// ---------------------------------------------------------------------------

export function RepositoryTrackerFigure({ trackerKey, title, description, children }: { trackerKey: string; title: ReactNode; description: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <figure className="byline-repository-tracker" data-repository-tracker={trackerKey}>
      <p className="byline-kicker">Tracker</p>
      <h3 className="byline-repository-tracker-title">{title}</h3>
      <p className="byline-repository-tracker-description">{description}</p>
      <div className="byline-repository-tracker-root" data-tracker-root="">{children}</div>
    </figure>
  );
}
