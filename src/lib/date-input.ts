/**
 * Converts a YYYY-MM-DD date input to ISO timestamptz using **UTC noon** for that
 * calendar date so US timezones don't shift the stored calendar day backward
 * (unlike `new Date("YYYY-MM-DD")` which is UTC midnight).
 */
export function dateInputToIsoPreservingCalendarDay(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).toISOString();
}
