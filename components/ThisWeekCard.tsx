import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { SiteIcon } from "./SiteIcon";

type ThisWeekCardProps = {
  schoolEvents: SchoolEvent[];
  sportsGames: SportsGame[];
};

type WeekItem = {
  id: string;
  kind: "event" | "game";
  title: string;
  label: string;
  date: string;
  dateTime: string;
  location: string;
  href: string;
};

const MAX_VISIBLE_ITEMS = 8;

function getSportLevel(game: SportsGame) {
  return game.display.sportLevel || [game.sportLabel || game.sport, game.level].filter(Boolean).join(" / ") || "Sports";
}

function getGameLocation(game: SportsGame) {
  return game.display.location || game.locationName || game.locationAddress || game.location || "";
}

function formatEventType(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function getWeekWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isInWeek(dateTime: string, start: Date, end: Date) {
  const time = new Date(dateTime).getTime();

  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
}

function toWeekItems(schoolEvents: SchoolEvent[], sportsGames: SportsGame[]) {
  const eventItems = schoolEvents
    .filter((event) => event.status !== "canceled")
    .map<WeekItem>((event) => ({
      id: `event-${event.id}`,
      kind: "event",
      title: event.title,
      label: formatEventType(event.eventType) || "School Event",
      date: [event.display.date, event.display.time].filter(Boolean).join(" / "),
      dateTime: event.startDate,
      location: event.location,
      href: event.externalUrl
    }));
  const gameItems = sportsGames
    .filter((game) => game.status !== "canceled" && game.status !== "postponed")
    .map<WeekItem>((game) => ({
      id: `game-${game.id}`,
      kind: "game",
      title: game.display.matchup || game.title,
      label: getSportLevel(game),
      date: game.display.date || game.startDate,
      dateTime: game.startDate,
      location: getGameLocation(game),
      href: game.recapUrl || "/sports/schedule/"
    }));

  return [...eventItems, ...gameItems].sort(
    (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
  );
}

export function ThisWeekCard({ schoolEvents, sportsGames }: ThisWeekCardProps) {
  const { start, end } = getWeekWindow();
  const allItems = toWeekItems(schoolEvents, sportsGames);
  const weekItems = allItems.filter((item) => isInWeek(item.dateTime, start, end));
  const visibleItems = (weekItems.length > 0 ? weekItems : allItems).slice(0, MAX_VISIBLE_ITEMS);

  return (
    <section className="this-week-card" aria-labelledby="this-week-heading">
      <div className="this-week-header">
        <div>
          <p>This Week</p>
          <h2 id="this-week-heading">At NSHS</h2>
        </div>
        <SiteIcon name="ph:calendar-dots" width={20} height={20} />
      </div>
      {visibleItems.length > 0 ? (
        <div className="this-week-list">
          {visibleItems.map((item) => {
            const content = (
              <>
                <span className={`this-week-type this-week-type-${item.kind}`}>{item.label}</span>
                <strong>{item.title}</strong>
                <span>{[item.date, item.location].filter(Boolean).join(" / ")}</span>
              </>
            );

            return item.href ? (
              <a key={item.id} className="this-week-item" href={item.href}>
                {content}
              </a>
            ) : (
              <article key={item.id} className="this-week-item">
                {content}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="this-week-empty">No calendar items are listed for this week yet.</p>
      )}
      <div className="this-week-links">
        <a href="/sports/schedule/">Sports schedule</a>
      </div>
    </section>
  );
}
