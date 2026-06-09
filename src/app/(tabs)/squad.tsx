import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, View } from 'react-native';
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
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Surface } from '@/components/ui/Surface';
import { ReferralCard } from '@/components/ReferralCard';
import { colors } from '@/theme/colors';
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
 * Bold Momentum re-skin — ALL logic preserved (Convex hooks, Share flow, events).
 */

const DEEP_LINK_SCHEME = 'hale://u/';

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
        <Heading className="text-4xl">SQUAD</Heading>
        <Body className="mt-1 text-base text-ash">Quitting sticks when you’re not doing it alone.</Body>

        {loading ? (
          <View className="mt-24 items-center">
            <ActivityIndicator color={colors.volt} />
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
      const link = `${DEEP_LINK_SCHEME}${userId}`;
      track(Ev.BUDDY_INVITED, { method: 'share_sheet', invite_source: 'squad_tab', pairing_method: 'invite', link_id: userId });
      await Share.share({
        message: `I’m quitting nicotine with HALE, be my accountability buddy? We’ll keep each other on streak. ${link}`,
        url: link,
      });
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
      <Surface level="raised" className="overflow-hidden px-6 py-8">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-volt">
          <Users color={colors.voltInk} size={26} strokeWidth={2.5} />
        </View>
        <Heading className="mt-5 text-2xl">INVITE A BUDDY</Heading>
        <Body className="mt-2 text-base leading-6 text-ash">
          Pair with a friend who’s also quitting, or someone who’ll cheer you on. You’ll see each
          other’s streaks and send support when it’s hard.
        </Body>

        {/* Proof, folded in — supporting the action, not competing with it. */}
        <View className="mt-6 border-t border-line pt-5">
          <BenefitRow text="People with a buddy stay quit longer." />
          <BenefitRow text="A nudge at the right moment beats a craving." />
          <BenefitRow text="Private by design, they never see your slip-ups." />
        </View>

        <Button
          variant="primary"
          label="SHARE MY INVITE LINK"
          loading={sharing}
          onPress={onInvite}
          accessibilityLabel="Invite a buddy"
          className="mt-7"
        />
      </Surface>
    </View>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <View className="mt-3 flex-row items-start">
      <Check color={colors.volt} size={16} strokeWidth={3} style={{ marginTop: 2 }} />
      <Body className="ml-2 flex-1 text-sm leading-5 text-ash">{text}</Body>
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

  const onCheer = useCallback(() => {
    if (cheered) return;
    setCheered(true);
    setHeartBurst((n) => n + 1);
    track(Ev.NUDGE_SENT, { type: 'cheer', surface: 'squad' });
    cheer({ type: 'cheer' })
      .then(() => toast.success("Support sent 💪"))
      .catch(() => {
        setCheered(false); // revert the optimistic state so they can retry
        toast.error("Couldn't send support. Try again");
      });
  }, [cheered, cheer]);

  return (
    <View className="mt-6">
      {/* Shared-streak banner */}
      <View className="flex-row items-center rounded-2xl border border-volt/30 bg-volt/10 px-5 py-4">
        <PulsingFlame />
        <View className="ml-3">
          <Label className="text-volt">SHARED STREAK</Label>
          <Body className="font-body-bold text-lg text-chalk">
            {sharedStreak} {sharedStreak === 1 ? 'day' : 'days'} strong together
          </Body>
        </View>
      </View>

      {/* Buddy card — sanitized */}
      <Surface level="raised" className="mt-4 px-6 py-6">
        <View className="flex-row items-center">
          {/* Warmer avatar: a lime disc with a soft volt glow so the buddy reads as
              a person, not a flat form field. */}
          <View
            className="h-14 w-14 items-center justify-center rounded-full bg-volt"
            style={{ shadowColor: colors.volt, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }}
          >
            <Display className="text-2xl text-volt-ink">{monogram(name)}</Display>
          </View>
          <View className="ml-4 flex-1">
            <Heading className="text-xl normal-case">{displayName}</Heading>
            <Body className="mt-0.5 text-sm text-ash">{lastSeenLabel(lastCheckInLocalDate)}</Body>
          </View>
        </View>

        {/* Their clean time, framed as a person's progress — NOT a giant lime "0"
            that read like an alert. Number demoted to chalk; a warm relational line
            carries the meaning. */}
        <View className="mt-5 rounded-2xl bg-void px-5 py-4">
          <View className="flex-row items-baseline gap-1.5">
            <Display className="text-2xl text-chalk">{currentStreak}</Display>
            <Body className="font-body-semibold text-sm text-ash">
              {currentStreak === 1 ? 'day' : 'days'} clean
            </Body>
          </View>
          <Body className="mt-1.5 text-sm leading-5 text-ash">
            {currentStreak > 0
              ? `Cheer ${displayName} on, a nudge lands right when it's hardest.`
              : `${displayName} just started out. A little support right now goes a long way.`}
          </Body>
        </View>

        <View className="relative mt-5">
          <Button
            variant={cheered ? 'surface' : 'primary'}
            label={cheered ? 'SUPPORT SENT' : 'SEND SUPPORT'}
            disabled={cheered}
            onPress={onCheer}
            accessibilityLabel={cheered ? 'Support sent' : 'Send support to your buddy'}
          />
          {/* Lime heart scales up, floats up, and fades from the button on each
              cheer tap. Keyed on the burst counter so it re-fires; overlay only. */}
          {heartBurst > 0 ? <FloatingHeart key={heartBurst} /> : null}
        </View>

        <View className="mt-3 flex-row items-center justify-center">
          <HeartHandshake color={colors.ash} size={13} />
          <Body className="ml-1.5 text-center text-xs text-ash">
            They’ll see your cheer, never your private details.
          </Body>
        </View>
      </Surface>
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
      <Flame color={colors.volt} size={26} strokeWidth={2.5} />
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
      <Heart color={colors.volt} fill={colors.volt} size={30} strokeWidth={2} />
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
          icon={<Users color={colors.ash} size={22} strokeWidth={2.5} />}
          title="Squads & challenges"
          sub="Quit alongside a group, start a 6-week challenge."
          onPress={() => router.push('/squads')}
        />
        <NavRow
          icon={<Trophy color={colors.ash} size={22} strokeWidth={2.5} />}
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
      className="flex-row items-center rounded-2xl bg-coal/40 px-5 py-4 active:bg-coal"
    >
      {icon}
      <View className="ml-3 flex-1">
        <Body className="font-body-semibold text-base text-chalk">{title}</Body>
        <Body className="mt-0.5 text-sm text-ash">{sub}</Body>
      </View>
      <ChevronRight color={colors.ash} size={20} />
    </Pressable>
  );
}
