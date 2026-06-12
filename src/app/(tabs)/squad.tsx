import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import {
  Check,
  ChevronRight,
  Flame,
  Heart,
  HeartHandshake,
  Share2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner-native';
import { track, Ev } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { buddyLink, buddyShareText, inviteShareParams } from '@/lib/links';
import {
  Screen,
  Button,
  Display,
  Body,
  Card,
  Badge,
  H2 as Heading,
  Eyebrow as Label,
} from '@/ui';
import { ReferralCard } from '@/components/ReferralCard';
import { clean } from '@/theme/clean';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Squad (S1/S2) — the social wedge. Two states off a single reactive query.
 * Clean Dark v2 (warm buddy lane) — ALL logic preserved (Convex hooks, Share flow, events).
 */

function monogram(name: string | null): string {
  const ch = name?.trim()?.[0];
  return ch ? ch.toUpperCase() : '★';
}

function lastSeenLabel(localDate: string | null): string {
  if (!localDate) return 'Hasn’t checked in yet';
  const today = new Date();
  const tzDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  if (localDate === tzDate) return 'Checked in today';
  return `Last check-in ${localDate}`;
}

export default function Squad() {
  const data = useQuery(api.buddies.myBuddy);
  const invite = useMutation(api.buddies.invite);

  const loading = data === undefined;
  const buddy = data?.buddy ?? null;
  const sharedStreak = data?.link.sharedStreak ?? 0;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Heading className="text-4xl">Squad</Heading>
        <Body className="mt-1 text-base text-fg-2">Quitting sticks when you’re not doing it alone.</Body>

        {loading ? (
          <View className="mt-24 items-center">
            <ActivityIndicator color={clean.warm} />
          </View>
        ) : buddy ? (
          <PairedState
            name={buddy.name}
            currentStreak={buddy.currentStreak}
            lastCheckInLocalDate={buddy.lastCheckInLocalDate}
            sharedStreak={sharedStreak}
          />
        ) : (
          <SoloState invite={invite} />
        )}

        {/* Refer friends → unlock 7 days of HALE+ (install + buddy-pair trigger). */}
        {!loading ? <ReferralCard surface="squad_tab" /> : null}

        <Phase2Links />
      </ScrollView>
    </Screen>
  );
}

/* ── SOLO — no buddy yet: invite CTA ─────────────────────────────── */

function SoloState({ invite }: { invite: ReturnType<typeof useMutation> }) {
  const [sharing, setSharing] = useState(false);

  const onInvite = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const { userId } = await invite();
      const link = buddyLink(userId);
      track(Ev.BUDDY_INVITED, { method: 'share_sheet', invite_source: 'squad_tab', pairing_method: 'invite', link_id: userId });
      await Share.share(inviteShareParams(buddyShareText(), link));
    } catch {
      // Share dismissed or invite failed — silently allow a retry.
    } finally {
      setSharing(false);
    }
  }, [invite, sharing]);

  return (
    <View className="mt-6">
      {/* One focal hero: the invite is the single action, and the "why it works"
          proof sits INSIDE the card (not a competing second card) so the screen has
          one clear block instead of a stack of equal-weight brochure cards. */}
      <Card className="overflow-hidden px-6 py-8">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-warm">
          <Users color={clean.warmInk} size={26} strokeWidth={2.5} />
        </View>
        <Heading className="mt-5 text-2xl">Invite a buddy</Heading>
        <Body className="mt-2 text-base leading-6 text-fg-2">
          Pair with a friend who’s also quitting, or someone who’ll cheer you on. You’ll see each
          other’s streaks and send support when it’s hard.
        </Body>

        {/* Proof, folded in — supporting the action, not competing with it. */}
        <View className="mt-6 border-t border-stroke pt-5">
          <BenefitRow text="People with a buddy stay quit longer." />
          <BenefitRow text="A nudge at the right moment beats a craving." />
          <BenefitRow text="Private by design, they never see your slip-ups." />
        </View>

        <Button
          variant="primary"
          label="Share my invite link"
          loading={sharing}
          onPress={onInvite}
          accessibilityLabel="Invite a buddy"
          className="mt-7"
        />
      </Card>
    </View>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <View className="mt-3 flex-row items-start">
      <Check color={clean.warm} size={16} strokeWidth={3} style={{ marginTop: 2 }} />
      <Body className="ml-2 flex-1 text-sm leading-5 text-fg-2">{text}</Body>
    </View>
  );
}

/* ── PAIRED — has a buddy: streak + shared streak + cheer ─────────── */

function PairedState({
  name,
  currentStreak,
  lastCheckInLocalDate,
  sharedStreak,
}: {
  name: string | null;
  currentStreak: number;
  lastCheckInLocalDate: string | null;
  sharedStreak: number;
}) {
  const [cheered, setCheered] = useState(false);
  // Increments on a cheer tap to fire one floating-heart burst from the button.
  const [heartBurst, setHeartBurst] = useState(0);
  const displayName = useMemo(() => name?.trim() || 'Your buddy', [name]);
  const cheer = useMutation(api.nudges.cheer);
  const unpair = useMutation(api.buddies.unpair);

  // End the pairing (one-buddy model: this frees both sides to pair again).
  // Confirm first — it's reversible only if the other person re-accepts a link.
  const onUnpair = useCallback(() => {
    Alert.alert(
      `End pairing with ${displayName}?`,
      'You can pair with someone new afterwards. Completed referrals and rewards are never taken back.',
      [
        { text: 'Keep my buddy', style: 'cancel' },
        {
          text: 'End pairing',
          style: 'destructive',
          onPress: () => {
            // Gravity: the user confirmed a destructive action.
            haptics.warn();
            unpair()
              .then((res) => {
                if (res?.ended) {
                  track(Ev.BUDDY_UNPAIRED, { surface: 'squad' });
                  // Neutral close — not celebratory, just done.
                  haptics.tap();
                  toast.success('Pairing ended');
                }
              })
              .catch(() => toast.error("Couldn't end the pairing. Try again"));
          },
        },
      ],
    );
  }, [displayName, unpair]);

  const onCheer = useCallback(() => {
    if (cheered) return;
    setCheered(true);
    setHeartBurst((n) => n + 1);
    track(Ev.NUDGE_SENT, { type: 'cheer', surface: 'squad' });
    cheer({ type: 'cheer' })
      .then(() => {
        // The warm "support landed" beat — the outcome, not the tap.
        haptics.success();
        toast.success("Support sent");
      })
      .catch(() => {
        setCheered(false); // revert the optimistic state so they can retry
        toast.error("Couldn't send support. Try again");
      });
  }, [cheered, cheer]);

  return (
    <View className="mt-6">
      {/* Shared-streak banner */}
      <View className="flex-row items-center rounded-2xl border border-warm-edge/30 bg-warm/10 px-5 py-4">
        <PulsingFlame />
        <View className="ml-3">
          <Label className="text-warm">SHARED STREAK</Label>
          <Body className="font-sora-bold text-lg text-fg">
            {sharedStreak} {sharedStreak === 1 ? 'day' : 'days'} strong together
          </Body>
        </View>
      </View>

      {/* Buddy card — sanitized */}
      <Card className="mt-4 px-6 py-6">
        <View className="flex-row items-center">
          {/* Warmer avatar: an amber disc with a soft warm glow so the buddy reads as
              a person, not a flat form field. */}
          <View
            className="h-14 w-14 items-center justify-center rounded-full bg-warm"
            style={{ shadowColor: clean.warm, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }}
          >
            <Display className="text-2xl text-warm-ink">{monogram(name)}</Display>
          </View>
          <View className="ml-4 flex-1">
            <Heading className="text-xl normal-case">{displayName}</Heading>
            <Body className="mt-0.5 text-sm text-fg-2">{lastSeenLabel(lastCheckInLocalDate)}</Body>
          </View>
        </View>

        {/* Their clean time, framed as a person's progress — NOT a giant lime "0"
            that read like an alert. Number demoted to fg; a warm relational line
            carries the meaning. */}
        <View className="mt-5 rounded-2xl bg-bg px-5 py-4">
          <View className="flex-row items-baseline gap-1.5">
            <Display className="text-2xl text-fg">{currentStreak}</Display>
            <Body className="font-sora-semibold text-sm text-fg-2">
              {currentStreak === 1 ? 'day' : 'days'} clean
            </Body>
          </View>
          <Body className="mt-1.5 text-sm leading-5 text-fg-2">
            {currentStreak > 0
              ? `Cheer ${displayName} on, a nudge lands right when it's hardest.`
              : `${displayName} just started out. A little support right now goes a long way.`}
          </Body>
        </View>

        <View className="relative mt-5">
          <Button
            variant={cheered ? 'secondary' : 'primary'}
            label={cheered ? 'Support sent' : 'Send support'}
            disabled={cheered}
            onPress={onCheer}
            accessibilityLabel={cheered ? 'Support sent' : 'Send support to your buddy'}
          />
          {/* Lime heart scales up, floats up, and fades from the button on each
              cheer tap. Keyed on the burst counter so it re-fires; overlay only. */}
          {heartBurst > 0 ? <FloatingHeart key={heartBurst} /> : null}
        </View>

        <View className="mt-3 flex-row items-center justify-center">
          <HeartHandshake color={clean.fg2} size={13} />
          <Body className="ml-1.5 text-center text-xs text-fg-2">
            They’ll see your cheer, never your private details.
          </Body>
        </View>
      </Card>

      {/* Quiet escape hatch — one buddy at a time, so switching starts here. */}
      <Pressable
        onPress={onUnpair}
        accessibilityRole="button"
        accessibilityLabel={`End pairing with ${displayName}`}
        className="mt-4 items-center py-2 active:opacity-70"
      >
        <Body className="text-xs text-fg-2 underline">End pairing</Body>
      </Pressable>
    </View>
  );
}

/** Shared-streak flame, slow warm pulse — the bond reads as alive, not a static icon. */
function PulsingFlame() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Flame color={clean.warm} size={26} strokeWidth={2.5} />
    </Animated.View>
  );
}

/** A lime heart that pops in, floats up, and fades — the tactile "support sent" beat. */
function FloatingHeart() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) });
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 : Math.max(0, 1 - (p.value - 0.15) / 0.85),
    transform: [
      { translateY: -72 * p.value },
      // Quick pop past 1, settle back — a heartbeat, not a balloon.
      { scale: interpolate(p.value, [0, 0.25, 1], [0.4, 1.2, 1.0]) },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', alignSelf: 'center', top: 8, pointerEvents: 'none' },
        style,
      ]}
    >
      <Heart color={clean.warm} fill={clean.warm} size={30} strokeWidth={2} />
    </Animated.View>
  );
}

/* ── Post-launch placeholder ─────────────────────────────────────── */

function Phase2Links() {
  return (
    <View className="mt-8">
      {/* Metadata eyebrow groups the two RECESSED rows as a subordinate plane,
          clearly behind the elevated invite hero above. */}
      <Label className="mb-3 ml-1">More ways to connect</Label>
      <View className="gap-3">
        <NavRow
          icon={<Users color={clean.fg2} size={22} strokeWidth={2.5} />}
          title="Squads & challenges"
          sub="Quit alongside a group, start a 6-week challenge."
          onPress={() => router.push('/squads')}
        />
        <NavRow
          icon={<Trophy color={clean.fg2} size={22} strokeWidth={2.5} />}
          title="Weekly league"
          sub="Climb the consistency board for your stage."
          onPress={() => router.push('/leagues')}
        />
      </View>
    </View>
  );
}

function NavRow({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center rounded-2xl bg-surface/40 px-5 py-4 active:bg-surface"
    >
      {icon}
      <View className="ml-3 flex-1">
        <Body className="font-sora-semibold text-base text-fg">{title}</Body>
        <Body className="mt-0.5 text-sm text-fg-2">{sub}</Body>
      </View>
      <ChevronRight color={clean.fg2} size={20} />
    </Pressable>
  );
}
