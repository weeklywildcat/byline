import { Icon } from "./Icon";
import type { CalendarEntryView } from "./story-view";

// Extracted from apps/web/components/ThisWeekCard.tsx. The week-window filtering
// and the event/game merge moved into the resolver; this renders the result.
export type ThisWeekCardProps = {
  entries: CalendarEntryView[];
  // Was hardcoded to "At NSHS" in the original component, which would have
  // leaked Weekly Wildcat's school into any other publication that enabled the
  // events or sports modules. It is a caller-supplied label now.
  heading: string;
  scheduleHref: string;
};

export function ThisWeekCard({ entries, heading, scheduleHref }: ThisWeekCardProps) {
  return (
    <section className="this-week-card" aria-labelledby="this-week-heading">
      <div className="this-week-header">
        <div>
          <p>This Week</p>
          <h2 id="this-week-heading">{heading}</h2>
        </div>
        <Icon name="ph:calendar-dots" width={20} height={20} />
      </div>
      {entries.length > 0 ? (
        <div className="this-week-list">
          {entries.map((entry) => {
            const content = (
              <>
                <span className={`this-week-type this-week-type-${entry.kind}`}>{entry.label}</span>
                <strong>{entry.title}</strong>
                <span>{[entry.date, entry.location].filter(Boolean).join(" / ")}</span>
              </>
            );

            return entry.href ? (
              <a key={entry.id} className="this-week-item" href={entry.href}>
                {content}
              </a>
            ) : (
              <article key={entry.id} className="this-week-item">
                {content}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="this-week-empty">No calendar items are listed for this week yet.</p>
      )}
      <div className="this-week-links">
        <a href={scheduleHref}>Sports schedule</a>
      </div>
    </section>
  );
}
