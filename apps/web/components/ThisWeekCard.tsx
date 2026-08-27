import { ThisWeekCard as SharedThisWeekCard } from "@byline/ui";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { toCalendarEntries } from "@/lib/homepage-packages";

const WEEKLY_WILDCAT_CALENDAR_HEADING = "At NSHS";

type ThisWeekCardProps = {
  maxVisibleItems?: number;
  schoolEvents: SchoolEvent[];
  sportsGames: SportsGame[];
};

/** Adapter retained only for the frozen schema-v1 renderer. */
export function ThisWeekCard({ maxVisibleItems = 8, schoolEvents, sportsGames }: ThisWeekCardProps) {
  return (
    <SharedThisWeekCard
      entries={toCalendarEntries(schoolEvents, sportsGames, maxVisibleItems)}
      heading={WEEKLY_WILDCAT_CALENDAR_HEADING}
      scheduleHref="/sports/schedule/"
    />
  );
}
