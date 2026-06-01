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

export default crons;
