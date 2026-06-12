import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ChevronLeft, TriangleAlert } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { logOutPurchaser } from '@/lib/revenuecat';
import { Screen, IconBtn, H1, Lead, Body, Muted, Button, Card2 } from '@/ui';
import { clean } from '@/theme/clean';

/**
 * Account deletion (Guideline 5.1.1(v)) — permanent, server-side hard delete of
 * the account and all user-generated content (convex/account.ts).
 *
 * Deliberately two-step: the first coral CTA only ARMS the final confirmation,
 * which uses different wording, so a single accidental tap can never delete.
 * Deletion does NOT cancel an App Store subscription (Apple owns that billing
 * relationship) — the copy says so and points at Apple Settings.
 */
export default function DeleteAccount() {
  const deleteAccount = useMutation(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // SYNCHRONOUS double-fire guard. `busy` state alone can't stop two presses in
  // the same frame (setState is async, both reads see false) — the racing second
  // deleteAccount then hits "Not authenticated" (the first already destroyed the
  // session) and painted a false "didn't go through" error over a SUCCESSFUL
  // deletion. Caught live in the design audit via rapid double-tap.
  const busyRef = useRef(false);

  /** Shared success path: detach RC, clear the local token, land on welcome. */
  const finishDeleted = async () => {
    track(Ev.ACCOUNT_DELETED);
    // Detach the RC identity so the entitlement doesn't orphan onto the next
    // account on this device. Never cancels the App Store subscription.
    await logOutPurchaser();
    // Server rows (incl. auth sessions) are already gone; signOut clears the
    // LOCAL token so the next launch starts signed out. The server half of
    // signOut may no-op/fail against the deleted session — that's expected.
    try {
      await signOut();
    } catch {
      // Session already deleted server-side by deleteAccount.
    }
    router.replace('/(onboarding)/welcome');
  };

  const onDelete = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await deleteAccount();
      await finishDeleted();
    } catch (e) {
      // "Not authenticated" here means the session is ALREADY gone — i.e. the
      // deletion (this press or a racing one) succeeded and destroyed it. That
      // is a success, not a failure: showing an error while the account is
      // deleted would be terrifyingly wrong. Finish the sign-out path instead.
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Not authenticated')) {
        await finishDeleted();
        return;
      }
      // A genuine failure (not the already-deleted race) — the SYSTEM failed the
      // user, so an error beat is warranted (this is never about a slip).
      haptics.error();
      busyRef.current = false;
      setBusy(false);
      setNotice("Deletion didn't go through. Check your connection and try again.");
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-1">
        <IconBtn onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft color={clean.fg} size={22} strokeWidth={2.2} />
        </IconBtn>
      </View>

      <View className="flex-1 px-gutter pt-4">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-coral">
          <TriangleAlert color={clean.coralInk} size={26} strokeWidth={2.2} />
        </View>

        <H1 className="mt-5">Delete your{'\n'}account</H1>
        <Lead className="mt-4">
          This permanently deletes your account and everything in it: your quit history,
          check-ins, cravings, Sage conversations, goals, squads you own, and your buddy
          pairing. It cannot be undone.
        </Lead>

        <Card2 pad className="mt-6">
          <Body className="leading-6 text-fg">
            Deleting your account does not cancel an App Store subscription. Manage that in
            Settings, then Apple ID, then Subscriptions.
          </Body>
        </Card2>

        {armed ? (
          <Body className="mt-6 leading-6 text-coral">
            Last check: this is permanent. Your data cannot be recovered after this.
          </Body>
        ) : null}
      </View>

      <View className="gap-2 px-gutter pb-[30px] pt-4">
        {notice ? <Body className="mb-1 text-center text-sm text-fg-2">{notice}</Body> : null}
        {busy ? (
          <View className="items-center py-4">
            <ActivityIndicator color={clean.coral} />
            <Muted className="mt-3">Deleting your account…</Muted>
          </View>
        ) : armed ? (
          <>
            <Button
              variant="coral"
              label="Yes, permanently delete everything"
              onPress={onDelete}
            />
            <Button variant="ghost" label="Keep my account" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Button
              variant="coral"
              label="Delete my account"
              onPress={() => {
                // Gravity: the user is about to arm a permanent destructive action.
                haptics.warn();
                setArmed(true);
              }}
            />
            <Button variant="ghost" label="Keep my account" onPress={() => router.back()} />
          </>
        )}
      </View>
    </Screen>
  );
}
