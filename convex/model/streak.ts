/**
 * PURE streak/timezone helpers (Decision 1: streaks are a daily ritual in the
 * USER's local day — never UTC). Uses Intl for correct IANA-zone local dates.
 */
export function localDateOf(epochMs: number, timezone: string): string {
  // → "YYYY-MM-DD" in the user's zone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochMs));
  return parts; // en-CA already yields YYYY-MM-DD
}

export function localHourOf(epochMs: number, timezone: string): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(epochMs));
  return parseInt(h, 10) % 24;
}

/** Days between two YYYY-MM-DD strings (calendar days, tz already applied). */
export function dayDiff(fromLocalDate: string, toLocalDate: string): number {
  const a = Date.parse(fromLocalDate + 'T00:00:00Z');
  const b = Date.parse(toLocalDate + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

export type StreakUpdate = {
  newStreak: number;
  usedFreeze: boolean;
  freezesRemaining: number;
};

/**
 * Compute the new streak given the last check-in date, today's local date, the
 * current streak, and remaining freezes. Bounded forgiveness: a single missed
 * day is auto-covered by a freeze (if available); a larger gap resets to 1.
 */
export function computeStreakOnCheckIn(args: {
  lastCheckInLocalDate: string | undefined;
  todayLocalDate: string;
  currentStreak: number;
  freezesRemaining: number;
}): StreakUpdate {
  const { lastCheckInLocalDate, todayLocalDate, currentStreak, freezesRemaining } = args;
  if (!lastCheckInLocalDate) return { newStreak: 1, usedFreeze: false, freezesRemaining };
  if (lastCheckInLocalDate === todayLocalDate)
    return { newStreak: currentStreak, usedFreeze: false, freezesRemaining }; // already checked in
  const gap = dayDiff(lastCheckInLocalDate, todayLocalDate);
  if (gap === 1) return { newStreak: currentStreak + 1, usedFreeze: false, freezesRemaining };
  // Missed exactly one day and have a freeze → protect the streak (bounded).
  if (gap === 2 && freezesRemaining > 0)
    return { newStreak: currentStreak + 1, usedFreeze: true, freezesRemaining: freezesRemaining - 1 };
  return { newStreak: 1, usedFreeze: false, freezesRemaining }; // larger gap → restart
}
