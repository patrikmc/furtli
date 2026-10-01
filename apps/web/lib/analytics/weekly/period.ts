/**
 * Reporting week for the Sunday-morning snapshot: the seven full days before
 * it, Sunday 00:00 to Saturday 24:00 in Europe/Zurich. Labelled with the ISO
 * week of that Saturday ("2026-W40"), which shares six of the seven days.
 *
 * Pure date maths, no dependencies; DST changes happen at 02:00/03:00, so
 * local midnight is always well defined.
 */

export interface ReportPeriod {
  /** "2026-W40" */
  week: string;
  /** Sunday 00:00 Europe/Zurich, as an instant. */
  start: Date;
  /** The following Sunday 00:00 Europe/Zurich (exclusive). */
  end: Date;
  /** "2026-09-27" (Sunday) */
  firstDay: string;
  /** "2026-10-03" (Saturday) */
  lastDay: string;
}

const TZ = "Europe/Zurich";
const DAY = 86_400_000;

/** Calendar date ("YYYY-MM-DD") of an instant in Zurich. */
export function zurichDate(at: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Minutes Zurich is ahead of UTC at an instant (60 in winter, 120 in summer). */
function zurichOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** 00:00 in Zurich on a calendar date, as an instant. */
export function zurichMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // DST switches at 01:00 UTC (02:00 CET / 03:00 CEST), after 00:00 UTC, so the
  // offset at 00:00 UTC is the one in force at local midnight (22:00/23:00 UTC the day before).
  return new Date(utcMidnight - zurichOffsetMinutes(new Date(utcMidnight)) * 60_000);
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ISO 8601 week label of a calendar date: "2026-W40". */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7; // Mon = 1 … Sun = 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday); // Thursday of this week decides the year
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The period ending on Saturday `lastDay` ("YYYY-MM-DD", must be a Saturday). */
export function periodEndingOn(lastDay: string): ReportPeriod {
  const [y, m, d] = lastDay.split("-").map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 6) throw new Error(`${lastDay} is not a Saturday`);
  const firstDay = addDays(lastDay, -6);
  return {
    week: isoWeek(lastDay),
    start: zurichMidnight(firstDay),
    end: zurichMidnight(addDays(lastDay, 1)),
    firstDay,
    lastDay,
  };
}

/** The last complete Sunday–Saturday week before `now` (on a Sunday morning: the week that just ended). */
export function lastCompletePeriod(now: Date = new Date()): ReportPeriod {
  const today = zurichDate(now);
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun = 0 … Sat = 6
  // Most recent Saturday strictly before today.
  return periodEndingOn(addDays(today, -(weekday + 1)));
}

/** "2026-W40" → the Sunday–Saturday period whose Saturday lies in that ISO week. */
export function periodForWeek(week: string): ReportPeriod {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`Expected a week like 2026-W40, got "${week}"`);
  const [year, w] = [Number(m[1]), Number(m[2])];
  // Monday of ISO week 1 = the Monday on or before 4 January.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday1 = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() || 7) - 1));
  const saturday = new Date(monday1 + ((w - 1) * 7 + 5) * DAY).toISOString().slice(0, 10);
  const p = periodEndingOn(saturday);
  if (p.week !== week) throw new Error(`${week} does not exist`);
  return p;
}

/** The `n` weeks before `week` (newest first), e.g. for trend columns. */
export function previousWeeks(week: string, n: number): string[] {
  const out: string[] = [];
  let last = periodForWeek(week).lastDay;
  for (let i = 0; i < n; i++) {
    last = addDays(last, -7);
    out.push(isoWeek(last));
  }
  return out;
}
