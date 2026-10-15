/**
 * Payment verification hours, in Lima time (UTC-5, no daylight saving):
 * Mon–Fri 7–18, Sat 8–14, Sun 12–14. Outside them nobody reviews proofs yet.
 */
const LIMA_OFFSET_HOURS = -5;
/** [open, close) in whole hours, by `getUTCDay()` of the Lima wall clock (0 = Sunday). */
const HOURS_BY_DAY: Record<number, [number, number]> = {
  0: [12, 14],
  1: [7, 18],
  2: [7, 18],
  3: [7, 18],
  4: [7, 18],
  5: [7, 18],
  6: [8, 14],
};

const toWall = (date: Date) => new Date(date.getTime() + LIMA_OFFSET_HOURS * 3_600_000);
const hoursOn = (utcDay: number): [number, number] => HOURS_BY_DAY[utcDay] ?? [0, 0];

export function isSupportOpen(now: Date): boolean {
  const wall = toWall(now);
  const [open, close] = hoursOn(wall.getUTCDay());
  const hour = wall.getUTCHours() + wall.getUTCMinutes() / 60;
  return hour >= open && hour < close;
}

/** When a person will next check the bank: now if open, otherwise the next opening. */
export function nextVerificationSlot(now: Date): Date {
  if (isSupportOpen(now)) return now;
  const wall = toWall(now);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(
      Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + offset),
    );
    const candidate = new Date(day.getTime() + hoursOn(day.getUTCDay())[0] * 3_600_000);
    if (candidate.getTime() > wall.getTime())
      return new Date(candidate.getTime() - LIMA_OFFSET_HOURS * 3_600_000);
  }
  return now;
}

/** "15/10/2026 5:18 p. m." in Lima time. */
export function formatLimaDateTime(date: Date): string {
  const wall = toWall(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour24 = wall.getUTCHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${pad(wall.getUTCDate())}/${pad(wall.getUTCMonth() + 1)}/${wall.getUTCFullYear()} ${hour12}:${pad(wall.getUTCMinutes())} ${hour24 >= 12 ? "p. m." : "a. m."}`;
}
