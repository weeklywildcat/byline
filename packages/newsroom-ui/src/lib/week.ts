/**
 * The newsroom week starts on Sunday, everywhere a week is drawn: Home's
 * "This week", the Calendar grid and every date picker. One value, so the
 * surfaces can never disagree.
 */
export const WEEK_STARTS_ON = 0 as const;

/** The same day as Schedule-X's `WeekDay` (Monday 1 … Sunday 7). */
export const SCHEDULE_X_FIRST_DAY = (WEEK_STARTS_ON === 0 ? 7 : WEEK_STARTS_ON) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
