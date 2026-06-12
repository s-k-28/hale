import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useConvex } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { api } from '@convex/_generated/api';
import { setPendingBuddy } from '@/lib/pendingBuddy';
import { track, Ev } from '@/lib/analytics';
import { Body } from '@/ui';
import { clean } from '@/theme/clean';

/**
 * InviteCodeEntry — the typed-code half of referral attribution through install.
 *
 * iOS has no first-party deferred deep linking: when a friend WITHOUT the app
 * taps a referral link, the App Store redirect can't carry the code through
 * install. The share message therefore includes the 6-char code in plain text,
 * and this affordance (on the pre-onboarding welcome screen) lets the fresh
 * installer type it. A valid code resolves to its referrer and feeds the SAME
 * pendingBuddy stash a tapped deep link uses — quiz commit then runs the
 * identical attributeInstall → pairWith redemption. One code path, two doors.
 */
export function InviteCodeEntry() {
  const convex = useConvex();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'applied' | 'notfound' | 'error'>(
    'idle',
  );

  const apply = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || state === 'checking') return;
    setState('checking');
    try {
      const resolved = await convex.query(api.referrals.resolveCode, { code: trimmed });
      if (resolved?.userId) {
        await setPendingBuddy(resolved.userId);
        track(Ev.REFERRAL_CODE_ENTERED, { found: true });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setState('applied');
      } else {
        track(Ev.REFERRAL_CODE_ENTERED, { found: false });
        setState('notfound');
      }
    } catch {
      // Network failure ≠ wrong code — say so, or users abandon a valid code.
      setState('error');
    }
  }, [code, state, convex]);

  if (state === 'applied') {
    return (
      <View className="mt-4 items-center">
        <Body className="text-center text-sm text-accent">
          Invite applied. We’ll credit your friend when you pair up.
        </Body>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Enter an invite code"
        className="mt-4 items-center py-1 active:opacity-70"
      >
        <Body className="text-center text-sm text-fg-3 underline">Have an invite code?</Body>
      </Pressable>
    );
  }

  return (
    <View className="mt-4">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            if (state === 'notfound' || state === 'error') setState('idle');
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={8}
          placeholder="CODE"
          placeholderTextColor={clean.fg3}
          accessibilityLabel="Invite code"
          onSubmitEditing={apply}
          className="flex-1 rounded-xl border border-stroke bg-surface-2 px-4 py-3 text-center font-sora-bold text-base tracking-[4px] text-fg"
        />
        <Pressable
          onPress={apply}
          disabled={!code.trim() || state === 'checking'}
          accessibilityRole="button"
          accessibilityLabel="Apply invite code"
          className="rounded-xl border border-stroke bg-surface-2 px-5 py-3 active:opacity-80 disabled:opacity-50"
        >
          <Body className="font-sora-bold text-sm text-accent">
            {state === 'checking' ? '…' : 'Apply'}
          </Body>
        </Pressable>
      </View>
      {state === 'notfound' ? (
        <Body className="mt-2 text-center text-xs text-fg-3">
          That code didn’t match. Double-check it and try again.
        </Body>
      ) : state === 'error' ? (
        <Body className="mt-2 text-center text-xs text-fg-3">
          Couldn’t check the code. Check your connection and try again.
        </Body>
      ) : null}
    </View>
  );
}
