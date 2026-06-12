import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner-native';
import { Gift, Check, Clock } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { referralLink, referralShareText, inviteShareParams } from '@/lib/links';
import { Card, Button, Body, Muted as Caption, H2 as Heading, Eyebrow as Label } from '@/ui';
import { clean } from '@/theme/clean';

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
  // The link is the https universal link (src/lib/links.ts) — it survives the
  // no-app-installed case, which a hale:// scheme link does not.
  // A failed fetch is NOT terminal: the share button stays enabled and retries
  // the fetch inline, so a network blip never leaves a dead button.
  const [link, setLink] = useState<{ url: string; code: string } | null>(null);
  const linkRef = useRef<typeof link>(null);
  const ensureLink = useCallback(async () => {
    if (linkRef.current) return linkRef.current;
    try {
      const { code } = await getOrCreateCode();
      const next = { url: referralLink(code), code };
      linkRef.current = next;
      setLink(next);
      return next;
    } catch {
      return null; // caller decides how to surface it
    }
  }, [getOrCreateCode]);
  useEffect(() => {
    if (progress === undefined || progress === null) return;
    void ensureLink();
  }, [progress, ensureLink]);

  // Celebrate the reward unlock once per session (false -> true transition).
  const prevReward = useRef<boolean | null>(null);
  useEffect(() => {
    if (!progress) return;
    if (prevReward.current === false && progress.rewardActive) {
      // The 3-referrals reward unlock — the biggest social win.
      haptics.celebrate();
      toast.success('You unlocked 7 days of HALE+');
    }
    prevReward.current = progress.rewardActive;
  }, [progress]);

  const onShare = useCallback(async () => {
    const l = await ensureLink();
    if (!l) {
      toast.error("Couldn't load your invite link. Check your connection and try again.");
      return;
    }
    track(Ev.REFERRAL_LINK_SHARED, { surface });
    try {
      await Share.share(inviteShareParams(referralShareText(l.code), l.url));
    } catch {
      // Share dismissed — no-op.
    }
  }, [ensureLink, surface]);

  if (progress === undefined || progress === null) return null;

  const { completedCount, target, rewardActive, rewardDaysRemaining, invitees } = progress;
  const remaining = Math.max(0, target - completedCount);

  return (
    <View className="mt-8">
      <Label className="mb-3 ml-1">Earn free HALE+</Label>
      <Card className="overflow-hidden px-6 py-7">
        {rewardActive ? (
          /* ── Reward unlocked ───────────────────────────────────────── */
          <>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-warm">
              <Gift color={clean.warmInk} size={26} strokeWidth={2.2} />
            </View>
            <Heading className="mt-5 text-2xl">HALE+ unlocked</Heading>
            <View className="mt-2 flex-row items-center">
              <Clock color={clean.warm} size={15} strokeWidth={2.5} />
              <Body className="ml-1.5 text-base text-warm">
                {rewardDaysRemaining} {rewardDaysRemaining === 1 ? 'day' : 'days'} of full access left
              </Body>
            </View>
            <Body className="mt-3 text-base leading-6 text-fg-2">
              You brought {completedCount} friends onto HALE and paired up. Keep inviting: every
              buddy makes quitting stick.
            </Body>
            <Button
              variant="secondary"
              label="Share my invite link"
              onPress={onShare}
              className="mt-6"
            />
          </>
        ) : (
          /* ── In progress ───────────────────────────────────────────── */
          <>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-warm">
              <Gift color={clean.warmInk} size={26} strokeWidth={2.5} />
            </View>
            <Heading className="mt-5 text-2xl">Unlock 7 days of HALE+</Heading>
            <Body className="mt-2 text-base leading-6 text-fg-2">
              Invite 3 friends who join HALE and pair up with a buddy, and you’ll unlock a week
              of full access: analytics, unlimited Sage, and more.
            </Body>

            {/* Progress meter — "X of 3 friends joined & paired". */}
            <View className="mt-6">
              <View className="flex-row items-center justify-between">
                <Label className="text-warm">
                  {completedCount} of {target} friends joined & paired
                </Label>
                <Caption className="text-fg-2">
                  {remaining === 0 ? 'Complete!' : `${remaining} to go`}
                </Caption>
              </View>
              <View className="mt-2 flex-row gap-2">
                {Array.from({ length: target }).map((_, i) => (
                  <View
                    key={i}
                    className={`h-2 flex-1 rounded-full ${i < completedCount ? 'bg-warm' : 'bg-track'}`}
                  />
                ))}
              </View>
            </View>

            {/* Sanitized invitee list (only those who installed via the link). */}
            {invitees.length > 0 ? (
              <View className="mt-5 border-t border-stroke pt-4">
                {invitees.slice(0, 5).map((inv, i) => (
                  <View key={i} className="mt-2 flex-row items-center first:mt-0">
                    {inv.status === 'completed' ? (
                      <Check color={clean.warm} size={16} strokeWidth={3} />
                    ) : (
                      <Clock color={clean.fg2} size={15} strokeWidth={2.5} />
                    )}
                    <Body className="ml-2 flex-1 text-sm text-fg-2" numberOfLines={1}>
                      {inv.name?.trim() || 'A friend'}
                    </Body>
                    <Caption className="text-fg-2">
                      {inv.status === 'completed' ? 'Joined & paired' : 'Installed'}
                    </Caption>
                  </View>
                ))}
              </View>
            ) : null}

            <Button
              variant="primary"
              label="Share my invite link"
              onPress={onShare}
              accessibilityLabel="Share your referral link"
              className="mt-6"
            />
          </>
        )}
      </Card>
    </View>
  );
}
