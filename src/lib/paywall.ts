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

/* ------------------------------------------------------------------ */
/* Hard paywall plumbing — direct StoreKit purchases via RevenueCat,   */
/* never the RC-rendered sheet. Entitlement RULES are untouched: a     */
/* successful purchase flows through the same RC entitlement + webhook */
/* mirror as before.                                                   */
/* ------------------------------------------------------------------ */

export type HalePlan = 'annual' | 'monthly';

export type PlanOffer = {
  plan: HalePlan;
  /** Localized price string from the store (e.g. "$79.99"). */
  price: string;
  /** The RC package to purchase. */
  pkg: import('react-native-purchases').PurchasesPackage;
};

/**
 * Load the annual + monthly packages from the current offering. Returns null
 * when RevenueCat is unconfigured or offerings can't load (callers show the
 * unavailable/retry state). Display-only metadata + the package handles.
 */
export async function loadPlanOffers(): Promise<PlanOffer[] | null> {
  if (!revenueCatConfigured()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    const offers: PlanOffer[] = [];
    const annual = current.annual ?? current.availablePackages.find((p) => p.packageType === 'ANNUAL');
    const monthly = current.monthly ?? current.availablePackages.find((p) => p.packageType === 'MONTHLY');
    if (annual) offers.push({ plan: 'annual', price: annual.product.priceString, pkg: annual });
    if (monthly) offers.push({ plan: 'monthly', price: monthly.product.priceString, pkg: monthly });
    return offers.length > 0 ? offers : null;
  } catch {
    return null;
  }
}

/**
 * Purchase a plan (starts the StoreKit intro trial when the store offer has
 * one). Returns 'purchased' | 'cancelled' | 'failed'. Fires the same funnel
 * events presentPaywall fired for the native sheet.
 */
export async function purchasePlan(
  offer: PlanOffer,
  surface?: string,
): Promise<'purchased' | 'cancelled' | 'failed'> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(offer.pkg);
    const active = customerInfo.entitlements.active[env.revenueCatEntitlement] != null;
    if (active) {
      track(Ev.PURCHASE_COMPLETED, { via: surface ?? 'paywall', result: 'PURCHASED' });
      track(Ev.SUBSCRIPTION_STARTED, { surface: surface ?? 'paywall', plan: offer.plan });
      return 'purchased';
    }
    return 'failed';
  } catch (e) {
    const cancelled =
      typeof e === 'object' && e !== null && (e as { userCancelled?: boolean }).userCancelled === true;
    return cancelled ? 'cancelled' : 'failed';
  }
}

/**
 * Restore previous purchases (required App Store affordance). Returns true
 * when the HALE+ entitlement is active after the restore.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!revenueCatConfigured()) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active[env.revenueCatEntitlement] != null;
  } catch {
    return false;
  }
}
