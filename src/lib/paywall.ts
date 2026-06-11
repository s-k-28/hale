import Purchases from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { env, has } from './config';
import { isPremium } from './revenuecat';
import { track, Ev } from './analytics';

/**
 * RevenueCat paywall presentation (Phase-1 step 8).
 *
 * Single entry point for showing the HALE+ paywall. We use RevenueCat's
 * `presentPaywallIfNeeded` so the native template (configured in the RC
 * dashboard) is the source of truth for layout/pricing — the app just asks
 * "gate behind this entitlement" and reacts to the result.
 *
 * Scaffold-safe: when RevenueCat has no key on this platform we never call into
 * the native module (it isn't configured) and return NOT_PRESENTED so callers
 * can fall back to an in-app upsell instead of crashing.
 *
 * NOTE on imports: the task spec referenced `import { PAYWALL_RESULT } from
 * 'react-native-purchases'`, but that barrel does NOT re-export the enum in
 * v10. The canonical (and only working) value export lives in
 * 'react-native-purchases-ui', which is also where RevenueCatUI comes from — so
 * we import it from there to keep a single, correct source.
 */

/** True only when RevenueCat is actually configured on this platform. */
function revenueCatConfigured(): boolean {
  return has('revenueCatIosKey') || has('revenueCatAndroidKey');
}

/**
 * Present the HALE+ paywall, gating on the configured entitlement. If the user
 * already owns the entitlement the native layer returns NOT_PRESENTED without
 * showing anything.
 *
 * Fires PAYWALL_VIEWED on (attempted) presentation and PURCHASE_COMPLETED on a
 * successful purchase or restore. Returns the RC result so callers can branch
 * (e.g. unlock a feature, or render a fallback when NOT_PRESENTED in scaffold).
 *
 * `surface` tags both events so we can segment conversion by where the paywall
 * fired (e.g. 'onboarding_peak' vs a later feature gate). Pass it once here so
 * callers never have to re-fire (and double-count) PAYWALL_VIEWED themselves.
 */
export async function presentPaywall(surface?: string): Promise<PAYWALL_RESULT> {
  // Unconfigured → no native module to call. Degrade gracefully.
  if (!revenueCatConfigured()) return PAYWALL_RESULT.NOT_PRESENTED;

  // Offerings pre-check (Guideline 3.1.1 robustness): if RevenueCat can't
  // load a current offering (network failure, store misconfiguration), the
  // native template would present broken — an empty sheet plus RC's own
  // error alert. Detect that BEFORE presenting and report NOT_PRESENTED so
  // callers show the clean in-app fallback with its retry state instead.
  // Presentation-only guard; entitlement logic is untouched.
  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current) return PAYWALL_RESULT.NOT_PRESENTED;
  } catch {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  track(Ev.PAYWALL_VIEWED, surface ? { surface } : undefined);

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: env.revenueCatEntitlement,
    });

    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      track(Ev.PURCHASE_COMPLETED, { via: surface ?? 'paywall', result });
    }
    // A NEW subscription (not a restore) — the conversion endpoint of the funnel,
    // so referral-vs-pay can be split against the referral_completed cohort.
    if (result === PAYWALL_RESULT.PURCHASED) {
      track(Ev.SUBSCRIPTION_STARTED, { surface: surface ?? 'paywall' });
    }
    // CANCELLED / ERROR / NOT_PRESENTED need no extra signal here; the
    // premium mirror (Convex todayState + RC isPremium) reflects the truth.

    return result;
  } catch {
    // Native present can throw in preview/sandbox or on a transient RC error;
    // treat as "not presented" so the UI can fall back rather than crash.
    return PAYWALL_RESULT.NOT_PRESENTED;
  }
}

/**
 * Gate a HALE+ feature: present the paywall ONLY if the user isn't already
 * premium (avoids flashing a paywall at existing subscribers). Returns true when
 * the user has access after this call (already premium, purchased, or restored).
 */
export async function gateHalePlus(): Promise<boolean> {
  // Runtime source of truth — RC's customer info. Cheap, and short-circuits the
  // native present for subscribers.
  if (await isPremium()) return true;

  const result = await presentPaywall();
  return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
}
