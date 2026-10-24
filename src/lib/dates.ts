/**
 * Date helpers. "Today" always means today in the user's own timezone (from
 * Settings), not the server's — servers usually run in UTC.
 * Dates are plain "YYYY-MM-DD" strings, matching Postgres `date` columns.
 */

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function todayIn(timezone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimezone(timezone) ? timezone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Hour of day (0–23) in the given timezone. */
export function hourIn(timezone: string, now = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: isValidTimezone(timezone) ? timezone : "UTC",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(h);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

const longFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortYearFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatLongDate(date: string) {
  return longFmt.format(new Date(`${date}T00:00:00Z`));
}

/** "Today", "Tomorrow", "Yesterday", "3 days ago", or "12 Nov". */
export function formatRelativeDate(date: string, today: string) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0 && diff >= -14) return `${-diff} days ago`;
  if (diff > 0 && diff < 7) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  }
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return (sameYear ? shortFmt : shortYearFmt).format(new Date(`${date}T00:00:00Z`));
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "09:30:00" → "09:30" */
export function formatTime(time: string) {
  return time.slice(0, 5);
}

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Offset (ms) of `timezone` from UTC at the given instant. */
function tzOffsetMs(timezone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * "2026-10-24T09:30" (wall-clock time in `timezone`, as produced by
 * <input type="datetime-local">) → ISO UTC timestamp.
 */
export function zonedLocalToUtcIso(local: string, timezone: string): string {
  const [date, time = "00:00"] = local.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - tzOffsetMs(timezone, new Date(guess));
  // Second pass corrects for DST transitions between guess and result.
  utc = guess - tzOffsetMs(timezone, new Date(utc));
  return new Date(utc).toISOString();
}

/** ISO UTC timestamp → "2026-10-24T09:30" wall-clock time in `timezone`. */
export function utcIsoToZonedLocal(iso: string, timezone: string): string {
  const at = new Date(iso);
  const local = new Date(at.getTime() + tzOffsetMs(timezone, at));
  return local.toISOString().slice(0, 16);
}

/** "09:30" for an ISO timestamp, in `timezone`. */
export function formatClockTime(iso: string, timezone: string) {
  return utcIsoToZonedLocal(iso, timezone).slice(11, 16);
}
