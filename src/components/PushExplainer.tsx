import { useEffect, useRef } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestPushPermission } from '@/lib/onesignal';

/**
 * PushExplainer — the help-framed pre-permission sheet (Decision 2: protect
 * opt-in). Category leaders that depend on re-engagement (Duolingo, Headspace,
 * Calm, Finch) never fire the raw OS permission prompt cold; they show a soft,
 * value-first explainer first, then trigger the real dialog only after the user
 * taps "Turn on". This preserves the single OS prompt for a moment of intent and
 * dramatically lifts grant rates vs. prompting on launch.
 *
 * Framing here is HELP, not marketing: we promise to reach the user at THEIR
 * hard times and to let their buddy reach them — and we promise restraint
 * (never spam, max 2/day). "Turn on" → requestPushPermission() (OS dialog).
 * "Not now" → dismiss with no penalty. The component owns no permission state of
 * its own; the parent decides when `visible` is true (e.g. after a check-in or
 * the first SOS) and tears it down via onDone() regardless of the choice.
 */

const HALE_500 = '#0f7a5a';

type Props = {
  visible: boolean;
  /** Called after either choice (turn on or not now) so the parent can dismiss. */
  onDone: () => void;
};

export default function PushExplainer({ visible, onDone }: Props) {
  // Guard against double-firing the OS prompt if the user double-taps "Turn on".
  const decidedRef = useRef(false);

  // Reset the guard whenever the sheet is (re)opened.
  useEffect(() => {
    if (visible) decidedRef.current = false;
  }, [visible]);

  const handleTurnOn = () => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    // Fire the real OS permission dialog. No-op when OneSignal is unconfigured.
    requestPushPermission();
    onDone();
  };

  const handleNotNow = () => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    onDone();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android hardware back / iOS swipe-down dismiss == "Not now" (no penalty).
      onRequestClose={handleNotNow}
      statusBarTranslucent
    >
      {/* Scrim — tapping outside the sheet is a soft dismiss. */}
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessibilityLabel="Dismiss"
        onPress={handleNotNow}
      >
        {/* Stop propagation so taps inside the sheet don't dismiss it. */}
        <Pressable
          onPress={() => {}}
          // Pressable swallows the scrim tap; it is not itself a button.
          accessibilityElementsHidden={false}
        >
          <SafeAreaView edges={['bottom']} className="rounded-t-3xl bg-white">
            <View className="px-6 pb-4 pt-7">
              {/* Grab handle */}
              <View className="mb-6 items-center">
                <View className="h-1.5 w-12 rounded-full bg-hale-900/10" />
              </View>

              {/* Icon mark */}
              <View
                className="mb-5 h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'rgba(15,122,90,0.10)' }}
              >
                <Text className="text-2xl" accessibilityElementsHidden>
                  🔔
                </Text>
              </View>

              <Text className="text-2xl font-extrabold leading-tight text-hale-900">
                We'll show up when it's hard.
              </Text>
              <Text className="mt-3 text-base leading-relaxed text-hale-900/70">
                We'll nudge you at your hard times and let your buddy reach you — never spam, max 2 a
                day.
              </Text>

              {/* Help bullets — concrete, restraint-forward */}
              <View className="mt-6">
                <Benefit
                  title="A nudge right before your hardest hour"
                  subtitle="The moment you're most likely to slip — not random pings."
                />
                <Benefit
                  title="Your buddy can reach you"
                  subtitle="A quiet rally when one of you needs backup."
                />
                <Benefit
                  title="Always in your control"
                  subtitle="Max 2 a day, and you can turn it off anytime in Settings."
                />
              </View>

              {/* Primary — fires the OS dialog */}
              <Pressable
                onPress={handleTurnOn}
                accessibilityRole="button"
                accessibilityLabel="Turn on notifications"
                className="mt-7 items-center rounded-2xl bg-hale-500 py-4 active:bg-hale-600"
              >
                <Text className="text-base font-bold text-white">Turn on notifications</Text>
              </Pressable>

              {/* Secondary — soft dismiss, no penalty */}
              <Pressable
                onPress={handleNotNow}
                accessibilityRole="button"
                accessibilityLabel="Not now"
                className="mt-2 items-center py-3 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-hale-900/50">Not now</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Benefit({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="mb-4 flex-row">
      <View
        className="mr-3 mt-0.5 h-5 w-5 items-center justify-center rounded-full"
        style={{ backgroundColor: 'rgba(15,122,90,0.12)' }}
      >
        <Text className="text-xs font-bold" style={{ color: HALE_500 }}>
          ✓
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-hale-900">{title}</Text>
        <Text className="mt-0.5 text-xs leading-relaxed text-hale-900/55">{subtitle}</Text>
      </View>
    </View>
  );
}
