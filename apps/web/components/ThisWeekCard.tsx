import { ThisWeekCard as SharedThisWeekCard } from "@byline/ui";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { toCalendarEntries } from "@/lib/homepage-packages";

// Adapter over the shared renderer. The week-window filtering and the
// event/game merge moved into lib/homepage-packages so Studio's preview can
// produce the same entries from a different transport; this keeps the existing
// call sites unchanged while the rest of the homepage is still legacy.
//
// The heading was previously hardcoded to "At NSHS" inside the component.
// Weekly Wildcat's value is preserved here so its output does not change, but
// it is now a caller-supplied string rather than baked into shared code.
const WEEKLY_WILDCAT_CALENDAR_HEADING = "At NSHS";

type ThisWeekCardProps = {
  maxVisibleItems?: number;
  schoolEvents: SchoolEvent[];
  sportsGames: SportsGame[];
};

export function ThisWeekCard({ maxVisibleItems = 8, schoolEvents, sportsGames }: ThisWeekCardProps) {
  return (
    <SharedThisWeekCard
      entries={toCalendarEntries(schoolEvents, sportsGames, maxVisibleItems)}
      heading={WEEKLY_WILDCAT_CALENDAR_HEADING}
      scheduleHref="/sports/schedule/"
    />
  );
}
