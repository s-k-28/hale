import { OneSignal, LogLevel } from 'react-native-onesignal';
import { env, has } from './config';

export function initOneSignal() {
  if (!has('oneSignalAppId')) return; // scaffold mode — no-op
  OneSignal.Debug.setLogLevel(LogLevel.Warn);
  OneSignal.initialize(env.oneSignalAppId);
}

/**
 * Link OneSignal user to the Convex user _id so server pushes can target them.
 * Returns true when the SDK login actually ran (OneSignal configured), false in
 * scaffold mode — callers use this to decide whether to persist the link
 * server-side (we must not flag an unreachable device as push-linked).
 */
export function loginOneSignal(externalId: string): boolean {
  if (!has('oneSignalAppId')) return false;
  OneSignal.login(externalId);
  return true;
}

/** Call AFTER the help-framed in-app explainer (Decision 2: protect opt-in). */
export function requestPushPermission() {
  if (!has('oneSignalAppId')) return;
  OneSignal.Notifications.requestPermission(true);
}

/** Tags power behavior-triggered segmentation (hardestHour, streak, hasBuddy). */
export function setUserTags(tags: Record<string, string>) {
  if (!has('oneSignalAppId')) return;
  OneSignal.User.addTags(tags);
}
