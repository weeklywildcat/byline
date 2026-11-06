/** The calendar day (YYYY-MM-DD) of an instant in a timezone. */
export function localDay(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** A date-only string moved by whole days, with no timezone involved. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** The newsroom timezone: the publication's, never the browser's or the server's. */
export function newsroomTimeZone(): string {
  const configured = process.env.BYLINE_NEWSROOM_TIMEZONE;
  if (configured) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: configured });
      return configured;
    } catch {
      // fall through to the publication default
    }
  }
  return "America/New_York";
}
