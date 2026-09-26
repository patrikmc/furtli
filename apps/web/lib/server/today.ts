/** Today's date in Zürich as YYYY-MM-DD (servers run in UTC). */
export function zurichToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now);
}
