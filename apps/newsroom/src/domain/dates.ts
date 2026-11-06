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

function offsetMinutes(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - instant) / 60_000);
}

/**
 * A newsroom-local, offset-free time ("2026-11-10T10:15", as the Byline screens
 * send it) as a UTC ISO instant. Values that already carry an offset or `Z` are
 * returned normalized. Read in the newsroom timezone, never the browser's or
 * the server's; correct across DST changes.
 */
export function localToInstant(value: string, timeZone: string): string {
  const text = value.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) return new Date(text).toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) throw new Error("Use a date and time like 2026-11-10T10:15.");
  const [, y, mo, d, h = "12", mi = "0", s = "0"] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  let instant = wall - offsetMinutes(wall, timeZone) * 60_000;
  // Recheck with the offset in force at the result, which differs on DST change days.
  instant = wall - offsetMinutes(instant, timeZone) * 60_000;
  return new Date(instant).toISOString();
}
