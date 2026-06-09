import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { isPremium as rcIsPremium } from '@/lib/revenuecat';

/**
 * usePremium — single source of HALE+ entitlement for the UI.
 *
 * Two signals, OR'd so the user is never wrongly locked out:
 *   1. RevenueCat `isPremium()` — the RUNTIME source of truth (customer info on
 *      device). Reflects a purchase/restore immediately, before the RC→Convex
 *      webhook lands. Re-checked on every screen focus.
 *   2. `api.users.todayState().premium` — the reactive Convex MIRROR (kept fresh
 *      by the RC webhook). Survives reinstalls/relogin and updates live for free
 *      via Convex reactivity.
 *
 * `loading` is true until the very first resolution (either signal) so callers
 * can avoid flashing a locked state on cold start.
 *
 * A third grant path — the 7-day REFERRAL REWARD — is OR'd in via the Convex
 * mirror (todayState.referralRewardActive, computed by model/entitlement.ts). So
 * the subscription, the trial, AND the referral reward all feed ONE hasHALEPlus,
 * which every blurred feature gates on. `hasAccess` is kept as a back-compat alias.
 */
export function usePremium(): {
  premium: boolean;
  trialActive: boolean;
  trialDaysRemaining: number;
  referralRewardActive: boolean;
  rewardDaysRemaining: number;
  hasHALEPlus: boolean;
  hasAccess: boolean;
  loading: boolean;
} {
  const { isAuthenticated } = useConvexAuth();

  // Convex mirror — undefined while loading, null when not onboarded.
  const today = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip');
  const mirrorPremium = today?.premium ?? false;
  const mirrorResolved = today !== undefined; // 'skip' yields undefined too

  // RevenueCat runtime truth — checked on mount + every focus.
  const [rcPremium, setRcPremium] = useState(false);
  const [rcResolved, setRcResolved] = useState(false);

  const refresh = useCallback(() => {
    let cancelled = false;
    rcIsPremium()
      .then((p) => {
        if (!cancelled) {
          setRcPremium(p);
          setRcResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRcPremium(false);
          setRcResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial check on mount.
  useEffect(() => refresh(), [refresh]);

  // Re-check whenever a screen using this hook regains focus (e.g. returning
  // from the paywall after a purchase, before the webhook mirror updates).
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const premium = rcPremium || mirrorPremium;
  // Resolved once EITHER signal has answered — don't block the UI waiting on a
  // slow/absent RC in scaffold mode, and don't wait on Convex when signed out.
  const loading = !rcResolved && !mirrorResolved;

  // App-managed trial (§8) from the Convex mirror. A subscriber is never "in
  // trial" (todayState already reports trialActive=false when premium).
  const trialActive = today?.trialActive ?? false;
  const trialDaysRemaining = today?.trialDaysRemaining ?? 0;
  // Referral reward window (7-day HALE+) from the same mirror — the third grant
  // path, already OR'd into todayState.hasHALEPlus server-side.
  const referralRewardActive = today?.referralRewardActive ?? false;
  const rewardDaysRemaining = today?.rewardDaysRemaining ?? 0;

  // The single gate every blurred feature reads. premium (RC runtime OR mirror)
  // OR trial OR referral reward. Equivalent to todayState.hasHALEPlus, but also
  // honors RC's runtime truth before the webhook mirror lands.
  const hasHALEPlus = premium || trialActive || referralRewardActive;

  return {
    premium,
    trialActive,
    trialDaysRemaining,
    referralRewardActive,
    rewardDaysRemaining,
    hasHALEPlus,
    hasAccess: hasHALEPlus, // back-compat alias for existing call sites
    loading,
  };
}
