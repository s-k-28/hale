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
export function revenueCatConfigured(): boolean {
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
  /** Localized price string from the store (e.g. "$49.99", "49,99 €"). DISPLAY ONLY. */
  price: string;
  /**
   * The price as a NUMBER, straight from StoreKit. Never parse `price` to get
   * this. The paywall used to, with `replace(/[^0-9.]/g, '')`, which deletes the
   * decimal COMMA that most non-US stores use: "49,99 €" parsed to 4999, and the
   * per-week line (annual / 52) then read "$96.13/week" next to a "49,99 €" price
   * badge. RevenueCat hands us the number; use it.
   */
  priceNum: number;
  /** ISO currency of the store (e.g. "USD", "EUR"). The price is NOT always dollars. */
  currencyCode: string;
  /**
   * The store's OWN localized per-week price (e.g. "$0.96", "0,96 €"), formatted
   * by the SDK in the store's currency and locale.
   *
   * Prefer this over formatting a number ourselves. It needs no Intl — which
   * Hermes does not reliably support and which this app polyfills nowhere, so a
   * hand-rolled `style: 'currency'` risks rendering a bare "0.96" with no symbol
   * on the money screen — and it cannot disagree with the price badge beside it.
   */
  pricePerWeek: string | null;
  /**
   * Length of the FREE StoreKit intro trial in days, read from the store, or
   * null when this plan has no free trial. NEVER hardcode this: App Store
   * Connect is the source of truth and it has drifted from the copy before
   * (the app once advertised 3 days while ASC granted 14). Deriving it here
   * means the paywall copy can't lie about the offer.
   */
  trialDays: number | null;
  /** The RC package to purchase. */
  pkg: import('react-native-purchases').PurchasesPackage;
};

/** Free-trial length in days from a product's intro offer (null when not a free trial). */
function introTrialDays(product: import('react-native-purchases').PurchasesStoreProduct): number | null {
  const intro = product.introPrice;
  // Only a ZERO-price intro offer is a free trial. A discounted intro (pay-up-front
  // or pay-as-you-go) is not, and must never be called "free".
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  switch (intro.periodUnit) {
    case 'DAY':
      return n;
    case 'WEEK':
      return n * 7;
    case 'MONTH':
      return n * 30;
    case 'YEAR':
      return n * 365;
    default:
      return null;
  }
}

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
    if (annual)
      offers.push({
        plan: 'annual',
        price: annual.product.priceString,
        priceNum: annual.product.price,
        currencyCode: annual.product.currencyCode,
        pricePerWeek: annual.product.pricePerWeekString ?? null,
        trialDays: introTrialDays(annual.product),
        pkg: annual,
      });
    if (monthly)
      offers.push({
        plan: 'monthly',
        price: monthly.product.priceString,
        priceNum: monthly.product.price,
        currencyCode: monthly.product.currencyCode,
        pricePerWeek: monthly.product.pricePerWeekString ?? null,
        trialDays: introTrialDays(monthly.product),
        pkg: monthly,
      });
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
