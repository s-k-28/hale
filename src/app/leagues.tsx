import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { Crown, Layers, Trophy } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import {
  Screen,
  Button,
  Display,
  Body,
  Badge,
  H2 as Heading,
  Eyebrow as Label,
} from '@/ui';
import { clean } from '@/theme/clean';

/**
 * Leagues (S4) — opt-in weekly, segmented by quit-stage, ranked by consistency.
 * Single reactive query (api.leagues.myLeague) drives two states: a join CTA
 * when not opted in, and the ranked leaderboard (lime "me" highlight) when in.
 * ALL scoring lives server-side; this screen is pure presentation + opt toggle.
 */

const BUCKET_LABEL: Record<string, string> = {
  d0_7: 'Days 0–7',
  d8_30: 'Days 8–30',
  d31_90: 'Days 31–90',
  d90plus: 'Day 90+',
};

function bucketLabel(bucket: string | null): string {
  return (bucket && BUCKET_LABEL[bucket]) || 'Your stage';
}

function monogram(name: string): string {
  const ch = name?.trim()?.[0];
  return ch ? ch.toUpperCase() : '★';
}

export default function Leagues() {
  const data = useQuery(api.leagues.myLeague);
  const optIn = useMutation(api.leagues.optIn);
  const leave = useMutation(api.leagues.leaveLeague);
  const [pending, setPending] = useState(false);

  const loading = data === undefined;
  const optedIn = data?.optedIn ?? false;
  const bucket = data?.bucket ?? null;
  const rank = data?.rank ?? null;
  const entries = data?.entries ?? [];
  const fieldSize = entries.length;

  const onJoin = useCallback(async () => {
    if (pending) return;
    setPending(true);
    track(Ev.LEAGUE_OPTIN, { action: 'join', bucket: bucket ?? 'unknown' });
    try {
      await optIn();
    } catch {
      // No active quit or transient failure — allow a retry.
    } finally {
      setPending(false);
    }
  }, [optIn, pending, bucket]);

  const onLeave = useCallback(async () => {
    if (pending) return;
    setPending(true);
    track(Ev.LEAGUE_OPTIN, { action: 'leave', bucket: bucket ?? 'unknown' });
    try {
      await leave();
    } catch {
      // ignore — reactive query will reconcile
    } finally {
      setPending(false);
    }
  }, [leave, pending, bucket]);

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center">
          <Trophy color={clean.accent} size={28} strokeWidth={2.5} />
          <Heading className="ml-2 text-4xl">LEAGUE</Heading>
        </View>
        <Body className="mt-1 text-base text-fg-2">
          A fresh leaderboard every week. Most clean days wins.
        </Body>

        {/* Segmented-by-stage note */}
        <View className="mt-4 flex-row items-center rounded-2xl border border-stroke bg-surface px-4 py-3">
          <Layers color={clean.fg2} size={16} strokeWidth={2.5} />
          <Body className="ml-2 flex-1 text-sm leading-5 text-fg-2">
            Segmented by your stage, you only race people at the same point in their quit.
          </Body>
        </View>

        {loading ? (
          <View className="mt-24 items-center">
            <ActivityIndicator color={clean.accent} />
          </View>
        ) : optedIn ? (
          <JoinedState
            bucket={bucket}
            rank={rank}
            fieldSize={fieldSize}
            entries={entries}
            onLeave={onLeave}
            pending={pending}
          />
        ) : (
          <OptInState bucket={bucket} onJoin={onJoin} pending={pending} />
        )}
      </ScrollView>
    </Screen>
  );
}

/* ── NOT opted in: join CTA + stage preview ──────────────────────────── */

function OptInState({
  bucket,
  onJoin,
  pending,
}: {
  bucket: string | null;
  onJoin: () => void;
  pending: boolean;
}) {
  return (
    <View className="mt-6">
      <View className="overflow-hidden rounded-3xl border border-stroke bg-surface px-6 py-8">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-accent">
          <Trophy color={clean.accentInk} size={26} strokeWidth={2.5} />
        </View>
        <Heading className="mt-5 text-2xl">Join this week</Heading>
        <Body className="mt-2 text-base leading-6 text-fg-2">
          Opt in to land in a friendly weekly league with others at your stage. Every clean check-in
          this week earns a point. Climb the board, stay quit.
        </Body>

        <View className="mt-5 flex-row items-center">
          <Label className="text-fg">Your segment</Label>
          <Badge label={bucketLabel(bucket)} tone="soft" className="ml-3" />
        </View>

        <Button
          variant="primary"
          label="Join the league"
          loading={pending}
          onPress={onJoin}
          accessibilityLabel="Join this week's league"
          className="mt-6"
        />
      </View>

      <View className="mt-5 rounded-2xl border border-stroke bg-surface px-5 py-4">
        <Label className="text-fg">HOW IT WORKS</Label>
        <Rule text="One point for every clean day you check in this week." />
        <Rule text="You only compete with people at your stage of quitting." />
        <Rule text="The board resets every Monday, a clean slate, always." />
        <Rule text="Opt out anytime. No streaks lost, no pressure." />
      </View>
    </View>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View className="mt-3 flex-row items-start">
      <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
      <Body className="ml-2.5 flex-1 text-sm leading-5 text-fg-2">{text}</Body>
    </View>
  );
}

/* ── Opted in: ranked leaderboard ────────────────────────────────────── */

function JoinedState({
  bucket,
  rank,
  fieldSize,
  entries,
  onLeave,
  pending,
}: {
  bucket: string | null;
  rank: number | null;
  fieldSize: number;
  entries: { name: string; score: number; isMe: boolean }[];
  onLeave: () => void;
  pending: boolean;
}) {
  const rankLabel = useMemo(() => (rank ? `#${rank}` : '—'), [rank]);

  return (
    <View className="mt-6">
      {/* My standing banner */}
      <View className="flex-row items-center rounded-2xl border border-accent-edge/30 bg-accent/10 px-5 py-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-accent">
          <Display className="text-2xl text-accent-ink">{rankLabel}</Display>
        </View>
        <View className="ml-4 flex-1">
          <Label className="text-accent">YOUR RANK · {bucketLabel(bucket)}</Label>
          <Body className="font-sora-bold text-base text-fg">
            {rank ? `${rank} of ${fieldSize}` : 'You’re in'} this week
          </Body>
        </View>
      </View>

      {/* Leaderboard */}
      <View className="mt-4 rounded-3xl border border-stroke bg-surface px-3 py-3">
        <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
          <Label className="text-fg">LEADERBOARD</Label>
          <Label>{fieldSize} {fieldSize === 1 ? 'PLAYER' : 'PLAYERS'}</Label>
        </View>
        {entries.map((e, i) => (
          <Row key={`${e.name}-${i}`} place={i + 1} entry={e} />
        ))}
      </View>

      <Button
        variant="ghost"
        label="Leave this week"
        loading={pending}
        onPress={onLeave}
        accessibilityLabel="Leave this week's league"
        className="mt-5"
      />
      <Body className="mt-3 text-center text-xs text-fg-2">
        Leaving won’t affect your streak or progress.
      </Body>
    </View>
  );
}

function Row({ place, entry }: { place: number; entry: { name: string; score: number; isMe: boolean } }) {
  const me = entry.isMe;
  const top = place === 1;
  return (
    <View
      className={`mt-1.5 flex-row items-center rounded-2xl px-3 py-3 ${
        me ? 'border border-accent-edge/40 bg-accent/10' : 'bg-bg'
      }`}
    >
      {/* Place */}
      <View className="w-7 items-center">
        {top ? (
          <Crown color={clean.accent} size={18} strokeWidth={2.5} />
        ) : (
          <Body className={`font-sora-bold text-base ${me ? 'text-accent' : 'text-fg-2'}`}>{place}</Body>
        )}
      </View>

      {/* Avatar */}
      <View
        className={`ml-1 h-9 w-9 items-center justify-center rounded-full ${
          me ? 'bg-accent' : 'bg-surface-2'
        }`}
      >
        <Body className={`font-sora-bold text-sm ${me ? 'text-accent-ink' : 'text-fg'}`}>
          {monogram(entry.name)}
        </Body>
      </View>

      {/* Name */}
      <Body
        className={`ml-3 flex-1 font-sora-semibold text-base ${me ? 'text-accent' : 'text-fg'}`}
        numberOfLines={1}
      >
        {me ? 'You' : entry.name}
      </Body>

      {/* Score */}
      <View className="flex-row items-baseline">
        <Display className={`text-2xl ${me ? 'text-accent' : 'text-fg'}`}>{entry.score}</Display>
        <Body className="ml-1 text-xs text-fg-2">{entry.score === 1 ? 'day' : 'days'}</Body>
      </View>
    </View>
  );
}
