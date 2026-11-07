import { normalizeCalendarPreferences, type CalendarPreferenceStorage } from "@byline/newsroom-screens/calendar/calendar-workspace";
import type { PreferenceStore } from "../stories/saved-views";

/**
 * The Calendar's remembered view and filters (category visibility and My
 * schedule), in Payload Preferences: the signed-in account's own admin UI
 * state, kept per user by Payload. No Users field, no migration, no Byline
 * endpoint. The selected date is navigation, not a preference, and is not
 * stored. Versioned by its key; every read is normalized.
 */
export const CALENDAR_PREFERENCES_KEY = "byline:calendar:preferences:v1";

export function payloadCalendarStorage(store: PreferenceStore): CalendarPreferenceStorage {
  return {
    load: async () => normalizeCalendarPreferences(await store.getPreference<unknown>(CALENDAR_PREFERENCES_KEY)),
    save: (preferences) => store.setPreference(CALENDAR_PREFERENCES_KEY, normalizeCalendarPreferences(preferences))
  };
}
