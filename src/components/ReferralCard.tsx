import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';
import { Gift, Sparkles, Check, Clock } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Surface } from '@/components/ui/Surface';
import { Heading, Body, Label, Caption } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';

/**
 * ReferralCard — the "Invite friends, unlock HALE+" surface.
 *
 * One-tap share of the user's referral deep link, a live "X of 3 friends joined
 * & paired" progress meter (so they see how close they are), the sanitized
 * invitee list, and the reward-unlocked state once 3 referrals complete (7 days
 * of HALE+). Reward is granted server-side the moment the 3rd invitee pairs; this
 * card just reflects it reactively and celebrates the transition once.
 *
 * The trigger that counts is INSTALL via the link + BUDDY-PAIR — so this lives on
 * the buddy surfaces, reinforcing HALE's accountability loop rather than being a
 * bolt-on growth gimmick.
 */
export function ReferralCard({ surface = 'squad_tab' }: { surface?: string }) {
  const progress = useQuery(api.referrals.myProgress);
  const getOrCreateCode = useMutation(api.referrals.getOrCreateMyCode);

  // Materialize the code + the share link (idempotent) once we're authed.
  const [link, setLink] = useState<{ url: string; code: string } | null>(null);
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (ensuredRef.current || progress === undefined || progress === null) return;
    ensuredRef.current = true;
    getOrCreateCode()
      .then(({ code, userId }) => setLink({ url: `hale://u/${userId}`, code }))
      .catch(() => {
        ensuredRef.current = false; // allow a retry on next render
      });
  }, [progress, getOrCreateCode]);

  // Celebrate the reward unlock once per session (false -> true transition).
  const prevReward = useRef<boolean | null>(null);
  useEffect(() => {
    if (!progress) return;
    if (prevReward.current === false && progress.rewardActive) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success('🎉 You unlocked 7 days of HALE+');
    }
    prevReward.current = progress.rewardActive;
  }, [progress]);

  const onShare = useCallback(async () => {
    if (!link) return;
    track(Ev.REFERRAL_LINK_SHARED, { surface });
    try {
      await Share.share({
        message: `I'm quitting nicotine with HALE — be my accountability buddy and we'll keep each other on streak. Join me: ${link.url}`,
        url: link.url,
      });
    } catch {
      // Share dismissed — no-op.
    }
  }, [link, surface]);

  if (progress === undefined || progress === null) return null;

  const { completedCount, target, rewardActive, rewardDaysRemaining, invitees } = progress;
  const remaining = Math.max(0, target - completedCount);

  return (
    <View className="mt-8">
      <Label className="mb-3 ml-1">Earn free HALE+</Label>
      <Surface level="raised" className="overflow-hidden px-6 py-7">
        {rewardActive ? (
          /* ── Reward unlocked ───────────────────────────────────────── */
          <>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-volt">
              <Sparkles color={colors.voltInk} size={26} strokeWidth={2.5} />
            </View>
            <Heading className="mt-5 text-2xl">HALE+ UNLOCKED</Heading>
            <View className="mt-2 flex-row items-center">
              <Clock color={colors.volt} size={15} strokeWidth={2.5} />
              <Body className="ml-1.5 text-base text-volt">
                {rewardDaysRemaining} {rewardDaysRemaining === 1 ? 'day' : 'days'} of full access left
              </Body>
            </View>
            <Body className="mt-3 text-base leading-6 text-ash">
              You brought {completedCount} friends onto HALE and paired up. Keep inviting — every
              buddy makes quitting stick.
            </Body>
            <Button
              variant="surface"
              label="SHARE MY INVITE LINK"
              onPress={onShare}
              disabled={!link}
              className="mt-6"
            />
          </>
        ) : (
          /* ── In progress ───────────────────────────────────────────── */
          <>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-volt">
              <Gift color={colors.voltInk} size={26} strokeWidth={2.5} />
            </View>
            <Heading className="mt-5 text-2xl">UNLOCK 7 DAYS OF HALE+</Heading>
            <Body className="mt-2 text-base leading-6 text-ash">
              Invite 3 friends who join HALE and pair up with a buddy, and you’ll unlock a week
              of full access — analytics, unlimited Sage, and more.
            </Body>

            {/* Progress meter — "X of 3 friends joined & paired". */}
            <View className="mt-6">
              <View className="flex-row items-center justify-between">
                <Label className="text-volt">
                  {completedCount} of {target} friends joined & paired
                </Label>
                <Caption className="text-ash">
                  {remaining === 0 ? 'Complete!' : `${remaining} to go`}
                </Caption>
              </View>
              <View className="mt-2 flex-row gap-2">
                {Array.from({ length: target }).map((_, i) => (
                  <View
                    key={i}
                    className={`h-2 flex-1 rounded-full ${i < completedCount ? 'bg-volt' : 'bg-line'}`}
                  />
                ))}
              </View>
            </View>

            {/* Sanitized invitee list (only those who installed via the link). */}
            {invitees.length > 0 ? (
              <View className="mt-5 border-t border-line pt-4">
                {invitees.slice(0, 5).map((inv, i) => (
                  <View key={i} className="mt-2 flex-row items-center first:mt-0">
                    {inv.status === 'completed' ? (
                      <Check color={colors.volt} size={16} strokeWidth={3} />
                    ) : (
                      <Clock color={colors.ash} size={15} strokeWidth={2.5} />
                    )}
                    <Body className="ml-2 flex-1 text-sm text-ash" numberOfLines={1}>
                      {inv.name?.trim() || 'A friend'}
                    </Body>
                    <Caption className="text-ash">
                      {inv.status === 'completed' ? 'Joined & paired' : 'Installed'}
                    </Caption>
                  </View>
                ))}
              </View>
            ) : null}

            <Button
              variant="primary"
              label="SHARE MY INVITE LINK"
              onPress={onShare}
              disabled={!link}
              accessibilityLabel="Share your referral link"
              className="mt-6"
            />
          </>
        )}
      </Surface>
    </View>
  );
}
