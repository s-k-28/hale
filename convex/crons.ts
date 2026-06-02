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

/**
 * trial-reminder sweep: a single daily win-back / trial-reminder pass.
 *
 * EMAIL-GATED: this only ever reaches users who have LINKED an email. Most
 * HALE users are anonymous (schema Decision 2) and have no email, so the
 * underlying email.sendTrialReminder is a silent no-op for them — the sweep
 * simply skips anyone without a linked address.
 *
 * Stub for now: trialReminderSweep enumerates eligible users and schedules
 * email.sendTrialReminder per user once trial/lifecycle windows are wired up.
 */
crons.daily(
  'trial-reminder',
  { hourUTC: 17, minuteUTC: 0 }, // shortly after the streak nudge; tune as we learn
  internal.email.trialReminderSweep,
);

/**
 * proactive-nudge (I3): runs HOURLY so it can land each user at THEIR local
 * hardestHour (pushes.proactiveNudgeSweep matches localHour == hardestHour per
 * timezone, deduped to once/local-day). The just-in-time "your tough hour" push.
 */
crons.hourly('proactive-nudge', { minuteUTC: 0 }, internal.pushes.proactiveNudgeSweep);

export default crons;
