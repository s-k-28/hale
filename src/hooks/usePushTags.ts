import { useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { loginOneSignal, setUserTags } from '@/lib/onesignal';

/**
 * usePushTags — mirrors the user's live state into OneSignal as tags so the
 * SERVER can behavior-target pushes without round-tripping to Convex:
 *   - routine reminder  → fire just before `hardest_hour`
 *   - save / streak     → segment by `streak` (e.g. about-to-break-a-record)
 *   - proactive / buddy → only reach people whose `has_buddy` == "true"
 *
 * It also links the OneSignal device to the Convex user `_id` (loginOneSignal)
 * so server-side pushes can address the user by externalId. Everything degrades
 * to a clean no-op when OneSignal is unconfigured (the lib helpers short-circuit
 * on a missing app id), so this hook is always safe to mount.
 *
 * Tags are only (re)written when their string value actually changes — OneSignal
 * tag writes are network calls, and todayState is a reactive query that re-emits
 * on every counter/check-in tick, so we de-dupe aggressively.
 */

/** The subset of api.users.todayState this hook reads, plus the targeting input. */
type PushState = {
  currentStreak?: number | null;
  /**
   * The user's self-reported hardest hour (0–23). It is NOT part of
   * todayState today, so callers may pass it alongside; we read it defensively
   * and simply omit the tag when it's absent.
   */
  hardestHour?: number | null;
} | null | undefined;

export function usePushTags(
  userId: string | null | undefined,
  todayState: PushState,
  hasBuddy: boolean,
): void {
  // Remember what we last pushed so reactive re-renders don't spam OneSignal.
  const lastLoginRef = useRef<string | null>(null);
  const lastTagsRef = useRef<string | null>(null);
  const linkOneSignal = useMutation(api.users.linkOneSignal);

  // Link device → Convex user id (idempotent; only on change).
  useEffect(() => {
    if (!userId) return;
    if (lastLoginRef.current === userId) return;
    lastLoginRef.current = userId;
    // Log the device into OneSignal under the Convex user _id, then mirror that
    // link server-side so push targeting can reach this user. Only persist when
    // the SDK actually logged in (configured) — never flag an unreachable
    // scaffold-mode device as push-linked.
    if (loginOneSignal(userId)) {
      linkOneSignal({ externalId: userId }).catch(() => {
        // Best-effort: a failed write just means server pushes skip this user
        // until we retry. Clear the guard so the next render re-attempts.
        lastLoginRef.current = null;
      });
    }
  }, [userId, linkOneSignal]);

  // Mirror behavior-targeting tags.
  useEffect(() => {
    // Wait for the user to be known before tagging — otherwise tags could land
    // on an anonymous device record that the server can't address.
    if (!userId) return;
    if (todayState == null) return;

    const tags: Record<string, string> = {
      streak: String(todayState.currentStreak ?? 0),
      has_buddy: hasBuddy ? 'true' : 'false',
    };

    const hardestHour = todayState.hardestHour;
    if (typeof hardestHour === 'number' && Number.isFinite(hardestHour)) {
      // Normalize to a whole 0–23 hour for clean server segmentation.
      tags.hardest_hour = String(((Math.trunc(hardestHour) % 24) + 24) % 24);
    }

    // De-dupe: stable key off the resolved tag values.
    const key = `${tags.streak}|${tags.has_buddy}|${tags.hardest_hour ?? ''}`;
    if (lastTagsRef.current === key) return;
    lastTagsRef.current = key;

    setUserTags(tags);
  }, [userId, todayState, hasBuddy]);
}
