import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';

/**
 * Squad (S1/S2) — the social wedge. Two states off a single reactive query:
 *
 *  • SOLO  (myBuddy === null): a warm "invite a buddy" CTA. invite() returns the
 *    viewer's userId; we build a hale://u/<id> deep link and open the native
 *    share sheet. track(BUDDY_INVITED).
 *  • PAIRED (myBuddy != null): the buddy's name + their streak (SANITIZED by the
 *    server — no craving/money detail), a shared-streak badge, and a one-tap
 *    "Cheer" that fires a nudge (stubbed) + track(NUDGE_SENT).
 *
 * Plus a "Join a public squad" placeholder (post-launch).
 *
 * Tone: social, warm, never competitive-shaming. Brand teal (hale-*).
 */

/** Deep-link scheme for buddy invites — accepted by pairWith({ inviterId }). */
const DEEP_LINK_SCHEME = 'hale://u/';

/** First-letter monogram for a buddy avatar; falls back to a friendly glyph. */
function monogram(name: string | null): string {
  const ch = name?.trim()?.[0];
  return ch ? ch.toUpperCase() : '🌱';
}

/** Humanize the buddy's last check-in date (already a local "YYYY-MM-DD"). */
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
    <SafeAreaView className="flex-1 bg-hale-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-3xl font-bold text-hale-900">Squad</Text>
        <Text className="mt-1 text-base text-hale-900/60">
          Quitting sticks when you’re not doing it alone.
        </Text>

        {loading ? (
          <View className="mt-24 items-center">
            <ActivityIndicator color="#0f7a5a" />
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

        <PublicSquadCard />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* SOLO — no buddy yet: invite CTA                                     */
/* ------------------------------------------------------------------ */

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
        url: link, // iOS surfaces this as a rich link target
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
      <View className="rounded-3xl bg-hale-500 px-6 py-8 shadow-sm">
        <View className="flex-row -space-x-3">
          <AvatarBubble glyph="🫵" tone="light" />
          <AvatarBubble glyph="🤝" tone="lighter" />
        </View>
        <Text className="mt-5 text-2xl font-bold text-white">Invite a buddy</Text>
        <Text className="mt-2 text-base leading-6 text-white/85">
          Pair up with a friend who’s also quitting — or someone who’ll cheer you
          on. You’ll see each other’s streaks and send support when it’s hard.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invite a buddy"
          disabled={sharing}
          onPress={onInvite}
          className="mt-6 flex-row items-center justify-center rounded-2xl bg-white py-4 active:opacity-80"
          style={{ opacity: sharing ? 0.7 : 1 }}
        >
          {sharing ? (
            <ActivityIndicator color="#0f7a5a" />
          ) : (
            <Text className="text-base font-bold text-hale-600">
              Share my invite link
            </Text>
          )}
        </Pressable>
      </View>

      {/* Why it works — gentle social proof, no pressure */}
      <View className="mt-5 rounded-2xl bg-white px-5 py-4">
        <Text className="text-sm font-semibold text-hale-900">Why pair up?</Text>
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
      <Text className="mr-2 text-hale-500">✓</Text>
      <Text className="flex-1 text-sm leading-5 text-hale-900/70">{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* PAIRED — has a buddy: streak + shared streak + cheer                */
/* ------------------------------------------------------------------ */

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
  // Cheer is stubbed (no nudges API yet): optimistic UI + analytics only.
  const [cheered, setCheered] = useState(false);
  const displayName = useMemo(() => name?.trim() || 'Your buddy', [name]);

  const onCheer = useCallback(() => {
    if (cheered) return;
    setCheered(true);
    track(Ev.NUDGE_SENT, { type: 'cheer', surface: 'squad' });
    // TODO(S2): call api.nudges.send({ type: 'cheer' }) once the mutation lands.
  }, [cheered]);

  return (
    <View className="mt-6">
      {/* Shared-streak banner — the thing they build together */}
      <View className="flex-row items-center justify-center rounded-2xl bg-hale-900 px-5 py-4">
        <Text className="text-2xl">🔥</Text>
        <View className="ml-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-hale-100/80">
            Shared streak
          </Text>
          <Text className="text-lg font-bold text-white">
            {sharedStreak} {sharedStreak === 1 ? 'day' : 'days'} strong together
          </Text>
        </View>
      </View>

      {/* Buddy card — sanitized: name + streak + last seen only */}
      <View className="mt-4 rounded-3xl bg-white px-6 py-6 shadow-sm">
        <View className="flex-row items-center">
          <AvatarBubble glyph={monogram(name)} tone="brand" />
          <View className="ml-4 flex-1">
            <Text className="text-xl font-bold text-hale-900">{displayName}</Text>
            <Text className="mt-0.5 text-sm text-hale-900/55">
              {lastSeenLabel(lastCheckInLocalDate)}
            </Text>
          </View>
        </View>

        <View className="mt-5 flex-row items-center rounded-2xl bg-hale-50 px-5 py-4">
          <Text className="text-3xl font-extrabold text-hale-500">
            {currentStreak}
          </Text>
          <Text className="ml-2 flex-1 text-sm leading-5 text-hale-900/70">
            {currentStreak === 1 ? 'day' : 'days'} clean.{' '}
            {currentStreak > 0 ? 'Cheer them on.' : 'Send some support.'}
          </Text>
        </View>

        {/* One-tap cheer / send support */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cheered ? 'Support sent' : 'Send support to your buddy'}
          disabled={cheered}
          onPress={onCheer}
          className="mt-5 flex-row items-center justify-center rounded-2xl py-4 active:opacity-80"
          style={{ backgroundColor: cheered ? '#e7f3ee' : '#0f7a5a' }}
        >
          <Text className="mr-2 text-lg">{cheered ? '✅' : '👏'}</Text>
          <Text
            className="text-base font-bold"
            style={{ color: cheered ? '#0c624a' : '#ffffff' }}
          >
            {cheered ? 'Support sent' : 'Send support'}
          </Text>
        </Pressable>

        <Text className="mt-3 text-center text-xs text-hale-900/45">
          They’ll see your cheer — never your private details.
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function AvatarBubble({
  glyph,
  tone,
}: {
  glyph: string;
  tone: 'brand' | 'light' | 'lighter';
}) {
  const bg =
    tone === 'brand' ? '#0f7a5a' : tone === 'light' ? '#ffffff' : '#c5e3d6';
  const fg = tone === 'brand' ? '#ffffff' : '#0a2f24';
  return (
    <View
      className="h-12 w-12 items-center justify-center rounded-full border-2 border-white"
      style={{ backgroundColor: bg }}
    >
      <Text className="text-xl font-bold" style={{ color: fg }}>
        {glyph}
      </Text>
    </View>
  );
}

/** Post-launch placeholder — public squads (league/leaderboard) come later. */
function PublicSquadCard() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Join a public squad — coming soon"
      disabled
      className="mt-6 rounded-2xl border border-dashed border-hale-400/50 bg-white/60 px-5 py-5"
    >
      <View className="flex-row items-center">
        <Text className="text-2xl">🌍</Text>
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-hale-900">
            Join a public squad
          </Text>
          <Text className="mt-0.5 text-sm text-hale-900/55">
            Quit alongside a group going through the same thing.
          </Text>
        </View>
        <View className="ml-2 rounded-full bg-hale-100 px-3 py-1">
          <Text className="text-xs font-semibold text-hale-600">Soon</Text>
        </View>
      </View>
    </Pressable>
  );
}
