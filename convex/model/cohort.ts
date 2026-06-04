/**
 * Quit-stage bucket from the active attempt's start — the cohort dimension shared
 * by client analytics (event-level cohort snapshot) AND server activation/relapse
 * events, so the bucket is computed ONE way everywhere. Mirrors the
 * leagueMemberships.stageBucket literals so both can be filtered together.
 */
export type QuitStage = 'd0_7' | 'd8_30' | 'd31_90' | 'd90plus';

export function quitStage(quitStartMs: number, nowMs: number): QuitStage {
  const days = Math.floor(Math.max(0, nowMs - quitStartMs) / 86_400_000);
  if (days <= 7) return 'd0_7';
  if (days <= 30) return 'd8_30';
  if (days <= 90) return 'd31_90';
  return 'd90plus';
}
