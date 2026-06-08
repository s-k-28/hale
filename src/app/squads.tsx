import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { ChevronLeft, Flame, Plus, Trophy, Users } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';

/**
 * Squads (S3 hub) — the group layer above 1:1 buddies. Four jobs, all reactive
 * off Convex queries (Bold Momentum design system, logic-thin client):
 *   1. "Your squads" — the squads you're in, with a 6-week challenge progress bar.
 *   2. Create a squad — name + public toggle + optional 6-week challenge → share code.
 *   3. Join by code — paste an invite code.
 *   4. Discover — public squads anyone can join.
 *
 * Privacy/contract: queries return only sanitized squad metadata (name, counts,
 * challenge window, your role) — never member rosters or anyone's slip-ups.
 *
 * NOTE: depends on backend convex/squads.ts exporting mySquads / publicSquads
 * queries and createSquad / joinByCode mutations (see summary).
 */

const MS_PER_DAY = 86_400_000;
const CHALLENGE_WEEKS = 6;

/** Row shape the UI consumes from api.squads.mySquads (sanitized).
 *  Note: backend returns challengeEnd + challengeGoalDays (NOT challengeStart);
 *  the window start is derived as end - goalDays. */
type MySquad = {
  _id: string;
  name: string;
  memberCount: number;
  isPublic: boolean;
  inviteCode: string;
  role: 'owner' | 'member';
  challengeEnd: number | null;
  challengeGoalDays: number | null;
};

/** Row shape from api.squads.publicSquads (sanitized — carries inviteCode so the
 *  Discover "Join" can route through joinByCode). */
type PublicSquad = {
  _id: string;
  name: string;
  memberCount: number;
  inviteCode: string;
  challengeGoalDays: number | null;
};

/** Derive a 0..1 challenge progress fraction. Backend gives end + goalDays, so
 *  the window is [end - goalDays*day, end]. */
function challengeProgress(s: MySquad, now: number): number | null {
  if (!s.challengeEnd || !s.challengeGoalDays || s.challengeGoalDays <= 0) return null;
  const start = s.challengeEnd - s.challengeGoalDays * MS_PER_DAY;
  if (s.challengeEnd <= start) return null;
  const frac = (now - start) / (s.challengeEnd - start);
  return Math.max(0, Math.min(1, frac));
}

function daysLeft(end: number, now: number): number {
  return Math.max(0, Math.ceil((end - now) / MS_PER_DAY));
}

export default function Squads() {
  const mySquads = useQuery(api.squads.mySquads, {}) as MySquad[] | undefined;
  const publicSquads = useQuery(api.squads.publicSquads, {}) as PublicSquad[] | undefined;

  const loading = mySquads === undefined;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-20 pt-3"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — back chevron to the Squad tab + loud wordmark. */}
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="mb-4 h-10 w-10 items-center justify-center rounded-full border border-line bg-coal active:opacity-80"
        >
          <ChevronLeft color={colors.chalk} size={22} strokeWidth={2.5} />
        </Pressable>

        <Label className="text-volt">Quit together</Label>
        <Heading className="mt-1 text-5xl leading-[0.9]">SQUADS</Heading>
        <Body className="mt-2 text-base leading-6 text-ash">
          Pick a group going through the same thing. Start a 6-week challenge and stay clean
          together.
        </Body>

        {loading ? (
          <View className="mt-24 items-center">
            <ActivityIndicator color={colors.volt} />
          </View>
        ) : (
          <>
            <YourSquads squads={mySquads} />
            <CreateSquad />
            <JoinByCode />
            <Discover squads={publicSquads} mySquads={mySquads} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ── 1. YOUR SQUADS ──────────────────────────────────────────────── */

function YourSquads({ squads }: { squads: MySquad[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (squads.length === 0) {
    return (
      <View className="mt-7 rounded-3xl border border-dashed border-line bg-coal/40 px-5 py-7">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-volt/15">
          <Users color={colors.volt} size={24} strokeWidth={2.5} />
        </View>
        <Heading className="mt-4 text-xl">NO SQUADS YET</Heading>
        <Body className="mt-2 text-sm leading-5 text-ash">
          Create one and share the code, join a friend&apos;s with their code, or discover a public
          squad below.
        </Body>
      </View>
    );
  }

  return (
    <View className="mt-7">
      <Label className="mb-3">Your squads</Label>
      <View className="gap-3">
        {squads.map((s) => (
          <SquadCard
            key={s._id}
            squad={s}
            expanded={expandedId === s._id}
            onToggle={() => setExpandedId((cur) => (cur === s._id ? null : s._id))}
          />
        ))}
      </View>
    </View>
  );
}

function SquadCard({
  squad,
  expanded,
  onToggle,
}: {
  squad: MySquad;
  expanded: boolean;
  onToggle: () => void;
}) {
  const now = Date.now();
  const progress = challengeProgress(squad, now);
  const hasChallenge = progress !== null && squad.challengeEnd != null;
  const challengeEnd = squad.challengeEnd ?? 0;
  const isOwner = squad.role === 'owner';

  const onShareCode = useCallback(async () => {
    track(Ev.SQUAD_INVITED, { surface: 'squads_hub', squadId: squad._id });
    try {
      await Share.share({
        message: `Join my HALE squad "${squad.name}", we're quitting nicotine together. Use code ${squad.inviteCode} in the app.`,
      });
    } catch {
      // Share dismissed — no-op.
    }
  }, [squad._id, squad.name, squad.inviteCode]);

  return (
    <View className="overflow-hidden rounded-3xl border border-line bg-coal">
      {/* Tappable header + progress (the toggle). Kept separate from the detail
          so the inner Share button never collides with a nested Pressable. */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${squad.name}, ${squad.memberCount} members`}
        className={`px-5 pt-5 active:opacity-90 ${expanded ? 'pb-4' : 'pb-5'}`}
      >
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-volt">
            <Users color={colors.voltInk} size={22} strokeWidth={2.5} />
          </View>
          <View className="ml-3 flex-1 pr-2">
            <Heading className="text-xl normal-case" numberOfLines={1}>
              {squad.name}
            </Heading>
            <Body className="mt-0.5 text-sm text-ash">
              {squad.memberCount} {squad.memberCount === 1 ? 'member' : 'members'}
              {squad.isPublic ? ' · Public' : ' · Private'}
            </Body>
          </View>
          {isOwner ? (
            <Pill tone="volt">
              <Label className="text-volt">Owner</Label>
            </Pill>
          ) : null}
        </View>

        {/* Challenge progress bar (lime) */}
        {hasChallenge ? (
          <View className="pt-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Trophy color={colors.volt} size={13} strokeWidth={2.75} />
                <Label className="text-volt">6-week challenge</Label>
              </View>
              <Body className="font-body-semibold text-xs text-ash">
                {daysLeft(challengeEnd, now)} days left
              </Body>
            </View>
            <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-void">
              <View
                className="h-full rounded-full bg-volt"
                style={{ width: `${Math.round((progress as number) * 100)}%` }}
              />
            </View>
          </View>
        ) : null}
      </Pressable>

      {/* Inline detail — sibling of the toggle, so its Share button is independent. */}
      {expanded ? (
        <View className="border-t border-line px-5 py-5">
          <View className="flex-row gap-3">
            <StatTile label="Members" value={String(squad.memberCount)} accent />
            {hasChallenge ? (
              <StatTile label="Days left" value={String(daysLeft(challengeEnd, now))} />
            ) : (
              <StatTile label="Type" value={squad.isPublic ? 'Public' : 'Private'} />
            )}
          </View>

          <View className="mt-4 flex-row items-center rounded-2xl bg-void px-4 py-3">
            <View className="flex-1">
              <Label>Invite code</Label>
              <Display className="mt-0.5 text-2xl tracking-widest text-volt">
                {squad.inviteCode}
              </Display>
            </View>
          </View>

          <Button
            variant="surface"
            label="Share invite code"
            onPress={onShareCode}
            accessibilityLabel="Share invite code"
            className="mt-4"
          />
        </View>
      ) : null}
    </View>
  );
}

/* ── 2. CREATE SQUAD ─────────────────────────────────────────────── */

function CreateSquad() {
  const createSquad = useMutation(api.squads.createSquad);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [startChallenge, setStartChallenge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const canCreate = name.trim().length >= 2 && !busy;

  const onCreate = useCallback(async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const res = (await createSquad({
        name: name.trim(),
        isPublic,
        // Backend seeds the window from challengeWeeks; 0/undefined = no challenge.
        challengeWeeks: startChallenge ? CHALLENGE_WEEKS : undefined,
      })) as { squadId: string; inviteCode: string };
      track(Ev.SQUAD_CREATED, { isPublic, startChallenge });
      setCreatedCode(res.inviteCode);
      setName('');
    } catch {
      // Surface nothing destructive — allow retry.
    } finally {
      setBusy(false);
    }
  }, [canCreate, createSquad, name, isPublic, startChallenge]);

  const onShareCreated = useCallback(async () => {
    if (!createdCode) return;
    track(Ev.SQUAD_INVITED, { surface: 'squads_hub_create' });
    try {
      await Share.share({
        message: `Join my HALE squad, we're quitting nicotine together. Use code ${createdCode} in the app.`,
      });
    } catch {
      // Share dismissed — no-op.
    }
  }, [createdCode]);

  return (
    <View className="mt-8">
      <Label className="mb-3">Create a squad</Label>

      {createdCode ? (
        /* Success — show the shareable code. */
        <View className="overflow-hidden rounded-3xl border border-line bg-coal">
          <View className="h-1.5 bg-volt" />
          <View className="px-5 py-6">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-volt">
              <Users color={colors.voltInk} size={24} strokeWidth={2.5} />
            </View>
            <Heading className="mt-4 text-2xl">SQUAD CREATED</Heading>
            <Body className="mt-2 text-sm leading-5 text-ash">
              Share this code so your people can join.
            </Body>

            <View className="mt-4 items-center rounded-2xl bg-void px-4 py-5">
              <Label>Invite code</Label>
              <Display className="mt-1 text-4xl tracking-[0.2em] text-volt">{createdCode}</Display>
            </View>

            <Button
              variant="primary"
              label="Share invite code"
              onPress={onShareCreated}
              accessibilityLabel="Share invite code"
              className="mt-5"
            />
            <Button
              variant="ghost"
              label="Create another"
              onPress={() => setCreatedCode(null)}
              accessibilityLabel="Create another squad"
              className="mt-3"
            />
          </View>
        </View>
      ) : (
        <View className="rounded-3xl border border-line bg-coal px-5 py-5">
          <Label>Squad name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Quit Crew"
            placeholderTextColor={colors.ash}
            maxLength={32}
            autoCapitalize="words"
            returnKeyType="done"
            className="mt-2 rounded-2xl border border-line bg-void px-4 py-3.5 font-body text-base text-chalk"
          />

          {/* Public toggle */}
          <View className="mt-5 flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Body className="font-body-semibold text-base text-chalk">Make it public</Body>
              <Body className="mt-0.5 text-xs leading-4 text-ash">
                Discoverable by anyone in the app. Off = invite-only.
              </Body>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: colors.line, true: colors.volt }}
              thumbColor={colors.chalk}
              ios_backgroundColor={colors.line}
            />
          </View>

          {/* 6-week challenge toggle */}
          <View className="mt-5 flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <View className="flex-row items-center gap-1.5">
                <Trophy color={colors.volt} size={14} strokeWidth={2.75} />
                <Body className="font-body-semibold text-base text-chalk">
                  Start a {CHALLENGE_WEEKS}-week challenge
                </Body>
              </View>
              <Body className="mt-0.5 text-xs leading-4 text-ash">
                Everyone aims to stay clean for {CHALLENGE_WEEKS} weeks together.
              </Body>
            </View>
            <Switch
              value={startChallenge}
              onValueChange={setStartChallenge}
              trackColor={{ false: colors.line, true: colors.volt }}
              thumbColor={colors.chalk}
              ios_backgroundColor={colors.line}
            />
          </View>

          <Button
            variant="primary"
            label="Create squad"
            loading={busy}
            disabled={!canCreate}
            onPress={onCreate}
            accessibilityLabel="Create squad"
            className="mt-6"
          />
        </View>
      )}
    </View>
  );
}

/* ── 3. JOIN BY CODE ─────────────────────────────────────────────── */

function JoinByCode() {
  const joinByCode = useMutation(api.squads.joinByCode);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canJoin = code.trim().length >= 4 && !busy;

  const onJoin = useCallback(async () => {
    if (!canJoin) return;
    setBusy(true);
    setError(null);
    try {
      await joinByCode({ code: code.trim().toUpperCase() });
      track(Ev.SQUAD_JOINED, { method: 'code' });
      setCode('');
    } catch {
      setError('That code didn’t work. Double-check it and try again.');
    } finally {
      setBusy(false);
    }
  }, [canJoin, joinByCode, code]);

  return (
    <View className="mt-8">
      <Label className="mb-3">Join by code</Label>
      <View className="rounded-3xl border border-line bg-coal px-5 py-5">
        <View className="flex-row items-center gap-3">
          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(t);
              if (error) setError(null);
            }}
            placeholder="CODE"
            placeholderTextColor={colors.ash}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            returnKeyType="go"
            onSubmitEditing={onJoin}
            className="flex-1 rounded-2xl border border-line bg-void px-4 py-3.5 font-display text-xl uppercase tracking-[0.18em] text-chalk"
          />
          <View className="w-28">
            <Button
              variant="primary"
              label="Join"
              loading={busy}
              disabled={!canJoin}
              onPress={onJoin}
              accessibilityLabel="Join squad by code"
            />
          </View>
        </View>
        {error ? <Body className="mt-3 text-sm text-sos">{error}</Body> : null}
      </View>
    </View>
  );
}

/* ── 4. DISCOVER PUBLIC SQUADS ───────────────────────────────────── */

function Discover({
  squads,
  mySquads,
}: {
  squads: PublicSquad[] | undefined;
  mySquads: MySquad[];
}) {
  const joinedIds = useMemo(() => new Set(mySquads.map((s) => s._id)), [mySquads]);

  return (
    <View className="mt-8">
      <Label className="mb-3">Discover</Label>

      {squads === undefined ? (
        <View className="items-center rounded-3xl border border-line bg-coal py-8">
          <ActivityIndicator color={colors.volt} />
        </View>
      ) : squads.length === 0 ? (
        <View className="rounded-3xl border border-line bg-coal px-5 py-6">
          <Flame color={colors.volt} size={22} strokeWidth={2.5} />
          <Body className="mt-3 text-sm leading-5 text-ash">
            No public squads yet. Create one above and make it public to lead the pack.
          </Body>
        </View>
      ) : (
        <View className="overflow-hidden rounded-3xl border border-line bg-coal">
          {squads.map((s, i) => (
            <DiscoverRow
              key={s._id}
              squad={s}
              alreadyIn={joinedIds.has(s._id)}
              first={i === 0}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function DiscoverRow({
  squad,
  alreadyIn,
  first,
}: {
  squad: PublicSquad;
  alreadyIn: boolean;
  first: boolean;
}) {
  // Public squads join through the same code path — publicSquads returns the
  // inviteCode, so there's one membership mutation to maintain (joinByCode).
  const joinByCode = useMutation(api.squads.joinByCode);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onJoin = useCallback(async () => {
    if (busy || done || alreadyIn) return;
    setBusy(true);
    try {
      await joinByCode({ code: squad.inviteCode });
      track(Ev.SQUAD_JOINED, { method: 'discover', squadId: squad._id });
      setDone(true);
    } catch {
      // Allow retry (e.g. already a member from another device).
    } finally {
      setBusy(false);
    }
  }, [busy, done, alreadyIn, joinByCode, squad.inviteCode, squad._id]);

  const joined = alreadyIn || done;

  return (
    <View className={`flex-row items-center px-5 py-4 ${first ? '' : 'border-t border-line'}`}>
      <View className="h-10 w-10 items-center justify-center rounded-2xl bg-volt/15">
        <Users color={colors.volt} size={20} strokeWidth={2.5} />
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Body className="font-body-semibold text-base text-chalk" numberOfLines={1}>
          {squad.name}
        </Body>
        <Body className="mt-0.5 text-xs text-ash">
          {squad.memberCount} {squad.memberCount === 1 ? 'member' : 'members'}
        </Body>
      </View>
      {joined ? (
        <Pill tone="volt">
          <Label className="text-volt">Joined</Label>
        </Pill>
      ) : (
        <Pressable
          onPress={onJoin}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Join ${squad.name}`}
          className={`h-10 items-center justify-center rounded-full bg-volt px-5 active:bg-volt-dim ${
            busy ? 'opacity-40' : ''
          }`}
        >
          {busy ? (
            <ActivityIndicator color={colors.voltInk} size="small" />
          ) : (
            <View className="flex-row items-center gap-1">
              <Plus color={colors.voltInk} size={15} strokeWidth={3} />
              <Display className="text-sm uppercase text-volt-ink">Join</Display>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}
