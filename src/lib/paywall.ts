import Purchases from 'react-native-purchases';
import { env, has } from './config';
import { track, Ev } from './analytics';
import { haptics } from './haptics';

/**
 * HALE+ hard paywall — direct StoreKit purchases via RevenueCat, never the
 * RC-rendered native sheet (design decision 2026-06-11). The single paywall
 * surface is src/app/paywall.tsx; every gate and upsell routes there.
 *
 * Entitlement RULES are untouched: a successful purchase flows through the
 * same RC entitlement + webhook mirror as before.
 */

/** True only when RevenueCat is actually configured on this platform. */
function revenueCatConfigured(): boolean {
  return has('revenueCatIosKey') || has('revenueCatAndroidKey');
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
 * funnel events the native-sheet flow used to fire.
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
      // The milestone/reward burst — they just unlocked HALE+.
      haptics.celebrate();
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
    const active = customerInfo.entitlements.active[env.revenueCatEntitlement] != null;
    // Familiar win — welcome back.
    if (active) haptics.success();
    return active;
  } catch {
    return false;
  }
}
