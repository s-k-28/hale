import { OneSignal, LogLevel } from 'react-native-onesignal';
import { env, has } from './config';

export function initOneSignal() {
  if (!has('oneSignalAppId')) return; // scaffold mode — no-op
  OneSignal.Debug.setLogLevel(LogLevel.Warn);
  OneSignal.initialize(env.oneSignalAppId);
}

/** Link OneSignal user to the Convex user _id so server pushes can target them. */
export function loginOneSignal(externalId: string) {
  if (!has('oneSignalAppId')) return;
  OneSignal.login(externalId);
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
