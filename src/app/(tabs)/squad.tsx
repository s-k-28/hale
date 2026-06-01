import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import {
  Check,
  ChevronRight,
  Flame,
  HeartHandshake,
  Share2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';

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
        contentContainerClassName="px-6 pb-16 pt-4"
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
      track(Ev.BUDDY_INVITED, { method: 'share_sheet' });
      await Share.share({
        message: `I’m quitting nicotine with HALE — be my accountability buddy? We’ll keep each other on streak. ${link}`,
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
      {/* Hero invite card */}
      <View className="overflow-hidden rounded-3xl border border-line bg-coal px-6 py-8">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-volt">
          <Users color={colors.voltInk} size={26} strokeWidth={2.5} />
        </View>
        <Heading className="mt-5 text-2xl">INVITE A BUDDY</Heading>
        <Body className="mt-2 text-base leading-6 text-ash">
          Pair with a friend who’s also quitting — or someone who’ll cheer you on. You’ll see each
          other’s streaks and send support when it’s hard.
        </Body>

        <Button
          variant="primary"
          label="SHARE MY INVITE LINK"
          loading={sharing}
          onPress={onInvite}
          accessibilityLabel="Invite a buddy"
          className="mt-6"
        />
      </View>

      {/* Why it works */}
      <View className="mt-5 rounded-2xl border border-line bg-coal px-5 py-4">
        <Label className="text-chalk">WHY PAIR UP?</Label>
        <BenefitRow text="People with a buddy stay quit longer." />
        <BenefitRow text="A nudge at the right moment beats a craving." />
        <BenefitRow text="Private by design — they never see your slip-ups." />
      </View>
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
  const displayName = useMemo(() => name?.trim() || 'Your buddy', [name]);
  const cheer = useMutation(api.nudges.cheer);

  const onCheer = useCallback(() => {
    if (cheered) return;
    setCheered(true);
    track(Ev.NUDGE_SENT, { type: 'cheer', surface: 'squad' });
    // Fire-and-forget — swallow errors so the optimistic UI never breaks.
    cheer({ type: 'cheer' }).catch(() => {});
  }, [cheered, cheer]);

  return (
    <View className="mt-6">
      {/* Shared-streak banner */}
      <View className="flex-row items-center rounded-2xl border border-volt/30 bg-volt/10 px-5 py-4">
        <Flame color={colors.volt} size={26} strokeWidth={2.5} />
        <View className="ml-3">
          <Label className="text-volt">SHARED STREAK</Label>
          <Body className="font-body-bold text-lg text-chalk">
            {sharedStreak} {sharedStreak === 1 ? 'day' : 'days'} strong together
          </Body>
        </View>
      </View>

      {/* Buddy card — sanitized */}
      <View className="mt-4 rounded-3xl border border-line bg-coal px-6 py-6">
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-volt">
            <Display className="text-xl text-volt-ink">{monogram(name)}</Display>
          </View>
          <View className="ml-4 flex-1">
            <Heading className="text-xl normal-case">{displayName}</Heading>
            <Body className="mt-0.5 text-sm text-ash">{lastSeenLabel(lastCheckInLocalDate)}</Body>
          </View>
        </View>

        <View className="mt-5 flex-row items-center rounded-2xl bg-void px-5 py-4">
          <Display className="text-4xl text-volt">{currentStreak}</Display>
          <Body className="ml-3 flex-1 text-sm leading-5 text-ash">
            {currentStreak === 1 ? 'day' : 'days'} clean.{' '}
            {currentStreak > 0 ? 'Cheer them on.' : 'Send some support.'}
          </Body>
        </View>

        <Button
          variant={cheered ? 'surface' : 'primary'}
          label={cheered ? 'SUPPORT SENT' : 'SEND SUPPORT'}
          disabled={cheered}
          onPress={onCheer}
          accessibilityLabel={cheered ? 'Support sent' : 'Send support to your buddy'}
          className="mt-5"
        />

        <View className="mt-3 flex-row items-center justify-center">
          <HeartHandshake color={colors.ash} size={13} />
          <Body className="ml-1.5 text-center text-xs text-ash">
            They’ll see your cheer — never your private details.
          </Body>
        </View>
      </View>
    </View>
  );
}

/* ── Post-launch placeholder ─────────────────────────────────────── */

function Phase2Links() {
  return (
    <View className="mt-6 gap-3">
      <NavRow
        icon={<Users color={colors.volt} size={22} strokeWidth={2.5} />}
        title="Squads & challenges"
        sub="Quit alongside a group — start a 6-week challenge."
        onPress={() => router.push('/squads')}
      />
      <NavRow
        icon={<Trophy color={colors.volt} size={22} strokeWidth={2.5} />}
        title="Weekly league"
        sub="Climb the consistency board for your stage."
        onPress={() => router.push('/leagues')}
      />
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
      className="flex-row items-center rounded-2xl border border-line bg-coal px-5 py-4 active:bg-card"
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
