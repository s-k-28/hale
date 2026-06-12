import { OneSignal, LogLevel, type NotificationClickEvent } from 'react-native-onesignal';
import { router } from 'expo-router';
import { env, has } from './config';
import { track, Ev } from './analytics';

/** Route a tapped push to the right screen by its server-set data.kind. */
function routeForPush(kind?: string) {
  switch (kind) {
    case 'proactive':
      router.navigate('/(tabs)/coach'); // get ahead of the hardest hour with Sage
      break;
    case 'nudge':
      router.navigate('/(tabs)/today'); // buddy nudge inbox lives on Today (S2)
      break;
    case 'buddy_relapse':
      router.navigate('/(tabs)/squad'); // a buddy needs support
      break;
    case 'streak_at_risk':
    default:
      router.navigate('/(tabs)/today'); // one-tap check-in saves the streak
  }
}

export function initOneSignal() {
  if (!has('oneSignalAppId')) return; // scaffold mode — no-op
  OneSignal.Debug.setLogLevel(LogLevel.Warn);
  OneSignal.initialize(env.oneSignalAppId);
  // Deep-link a tapped notification to the relevant screen + record the open.
  OneSignal.Notifications.addEventListener('click', (event: NotificationClickEvent) => {
    const kind = (event.notification.additionalData as { kind?: string } | undefined)?.kind;
    track(Ev.PUSH_OPENED, { kind: kind ?? 'unknown' });
    routeForPush(kind);
  });
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

/** Account-deletion cleanup: detach this device from the deleted identity. */
export function logoutOneSignal() {
  if (!has('oneSignalAppId')) return;
  OneSignal.logout();
}
