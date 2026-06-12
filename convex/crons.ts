import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * Scheduled jobs. Kept deliberately small at MVP scale.
 *
 * streak-at-risk: a single daily save-notification sweep. The action evaluates
 * each user against their OWN timezone (see pushes.streakAtRisk), so one fixed
 * UTC run is a reasonable, best-effort approximation for "you haven't checked
 * in today" across zones. Tune the hour as we learn when the nudge lands best.
 */
const crons = cronJobs();

crons.daily(
  'streak-at-risk',
  { hourUTC: 16, minuteUTC: 0 }, // ~late-morning Americas; pick the window users respond to
  internal.pushes.streakAtRisk,
);

// The trial-reminder sweep is deliberately NOT registered: the app-managed
// 14-day trial was removed (hard paywall, 2026-06-11), so "your trial is
// ending" would be false. email.ts keeps the sweep functions (uncalled) —
// re-register here only if a real lifecycle email replaces it.

/**
 * proactive-nudge (I3): runs HOURLY so it can land each user at THEIR local
 * hardestHour (pushes.proactiveNudgeSweep matches localHour == hardestHour per
 * timezone, deduped to once/local-day). The just-in-time "your tough hour" push.
 */
crons.hourly('proactive-nudge', { minuteUTC: 0 }, internal.pushes.proactiveNudgeSweep);

export default crons;
