import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { env, has } from './config';

export function initRevenueCat() {
  const key = Platform.OS === 'ios' ? env.revenueCatIosKey : env.revenueCatAndroidKey;
  if (!key) return; // scaffold mode — no-op until keys arrive
  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: key });
}

/** RC app_user_id == Convex user _id → unifies entitlements + webhook mirror. */
export async function identifyPurchaser(userId: string) {
  if (!has('revenueCatIosKey') && !has('revenueCatAndroidKey')) return;
  try {
    await Purchases.logIn(userId);
  } catch {
    /* preview/sandbox */
  }
}

/**
 * Detach the RC identity on account deletion so the entitlement isn't orphaned
 * onto the next account created on this device. RC switches back to an
 * anonymous app_user_id; this never cancels the App Store subscription itself.
 */
export async function logOutPurchaser() {
  if (!has('revenueCatIosKey') && !has('revenueCatAndroidKey')) return;
  try {
    await Purchases.logOut();
  } catch {
    // Already anonymous (logOut throws then) or scaffold mode — nothing to detach.
  }
}

export async function isPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[env.revenueCatEntitlement]?.isActive;
  } catch {
    return false;
  }
}
