/**
 * PURE community rules — post validation, the rolling-hour rate limit, coarse
 * time labels, and the moderation state machine. No ctx, no I/O: every export
 * is unit-testable and safe to import from UI code (e.g. the composer's char
 * counter) as well as Convex functions.
 */

export const POST_MAX_CHARS = 500;
export const RATE_LIMIT_MAX_POSTS = 3;
export const RATE_LIMIT_WINDOW_MS = 3_600_000; // rolling hour

/**
 * Rolling-hour rate limit (3 posts/hour per anonProfile). recentPostTimes are
 * epoch ms of the profile's posts near the window, any order — only times in
 * (now - WINDOW, now] count. When blocked, retryAtMs is the moment the OLDEST
 * in-window post ages out (so the composer can say "try again in ~N min").
 */
export function canPostAgain(
  recentPostTimes: number[],
  now: number,
): { allowed: boolean; retryAtMs?: number } {
  const inWindow = recentPostTimes.filter((t) => t > now - RATE_LIMIT_WINDOW_MS && t <= now);
  if (inWindow.length < RATE_LIMIT_MAX_POSTS) return { allowed: true };
  return { allowed: false, retryAtMs: Math.min(...inWindow) + RATE_LIMIT_WINDOW_MS };
}

/**
 * Coarse, bucketed time label — the ONLY time representation clients ever see
 * for community content (SECURITY INVARIANT: never expose raw ts). Floor
 * division; negative deltas (clock skew) clamp to 0 → 'just now'.
 *   < 60s → 'just now' · < 60m → '{m}m ago' · < 24h → '{h}h ago'
 *   < 7d → '{d}d ago' · else → '{w}w ago'
 */
export function coarseTimeLabel(ts: number, now: number): string {
  const delta = Math.max(0, now - ts);
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return `${Math.floor(delta / (7 * 86_400_000))}w ago`;
}

/** Validates the TRIMMED body: 1..POST_MAX_CHARS chars. reason: 'empty' | 'too_long'. */
export function validatePostBody(body: string): { ok: boolean; reason?: string } {
  if (body.length === 0) return { ok: false, reason: 'empty' };
  if (body.length > POST_MAX_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true };
}

/**
 * Moderation state machine (shadow-ban semantics):
 *   pii || glamorizing || harassment → 'shadowed' (author still sees it as published)
 *   otherwise                        → 'published'
 * crisis is returned as-is, ALWAYS — a shadowed crisis post still shows the
 * author the crisis resource card.
 */
export function moderationOutcome(flags: {
  pii: boolean;
  crisis: boolean;
  glamorizing: boolean;
  harassment: boolean;
}): { status: 'published' | 'shadowed'; crisis: boolean } {
  const shadowed = flags.pii || flags.glamorizing || flags.harassment;
  return { status: shadowed ? 'shadowed' : 'published', crisis: flags.crisis };
}
