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

export async function isPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[env.revenueCatEntitlement]?.isActive;
  } catch {
    return false;
  }
}
