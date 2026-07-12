import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ChevronRight, Globe, Users } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner-native';
import { haptics } from '@/lib/haptics';
import { Screen, H1, H2 as Heading, Body, Eyebrow as Label } from '@/ui';
import { RiseIn } from '@/components/motion';
import { CommunityRulesGate } from '@/components/community/CommunityRulesGate';
import { clean } from '@/theme/clean';
import { COMMUNITY_GROUPS, COMMUNITY_TAB_TITLE } from '@/constants/communityCopy';

/**
 * Community — the group-browse tab. One card per seeded group (5 real groups +
 * the "Everyone" global feed up top), each routing into its feed at
 * /community/[groupId]. Joining is explicit here so the anonymous handle gets
 * its reveal moment ("You're in as steady-otter-47") — posting auto-joins
 * anyway, so tapping straight into a group is never blocked.
 *
 * Anonymity by design: the only identity this screen ever shows is the
 * caller's OWN per-group pseudonym (via api.community.myProfiles).
 */

/** Shaped group row from the server — no userId, no follower counts. */
type GroupRow = FunctionReturnType<typeof api.community.groups>[number];

/** Deterministic avatar hue from the profile's 6-char hex seed. */
function avatarColor(avatarSeed: string) {
  return `hsl(${parseInt(avatarSeed, 16) % 360}, 60%, 45%)`;
}

/** Member-ish count line. Never followers — just "people in the room". */
function memberLabel(n: number) {
  return `${n} member${n === 1 ? '' : 's'}`;
}

export default function Community() {
  const groups = useQuery(api.community.groups, {});
  const profiles = useQuery(api.community.myProfiles, {});
  const joinGroup = useMutation(api.community.joinGroup);

  // One join in flight at a time — the affordance shows a spinner meanwhile.
  const [joiningId, setJoiningId] = useState<Id<'communityGroups'> | null>(null);

  // groupId → my pseudonym there, for the "Joined as {handle}" state.
  const myProfileByGroup = useMemo(() => {
    const map = new Map<string, { handle: string; avatarSeed: string }>();
    for (const p of profiles ?? []) {
      map.set(p.groupId, { handle: p.handle, avatarSeed: p.avatarSeed });
    }
    return map;
  }, [profiles]);

  const onJoin = useCallback(
    async (groupId: Id<'communityGroups'>) => {
      if (joiningId) return;
      setJoiningId(groupId);
      haptics.press();
      try {
        // The delightful beat: the server mints a pseudonym and we reveal it
        // immediately — the card flips to "Joined as {handle}" reactively too.
        const res = await joinGroup({ groupId });
        haptics.success();
        toast(`You're in as ${res.handle}`);
      } catch {
        toast.error("Couldn't join. Please try again");
      } finally {
        setJoiningId(null);
      }
    },
    [joiningId, joinGroup],
  );

  // Loading — query in flight.
  if (groups === undefined) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={clean.accent} />
      </Screen>
    );
  }

  const globalGroup = groups.find((g) => g.isGlobal) ?? null;
  const realGroups = groups.filter((g) => !g.isGlobal);

  return (
    <CommunityRulesGate>
    <Screen edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pb-24 pt-3"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — matches the Today idiom: lime accent label over the title */}
        <View className="mb-7">
          <Label className="text-accent">Pseudonyms only, no one sees who you are</Label>
          <H1 className="mt-1 text-3xl">{COMMUNITY_TAB_TITLE}</H1>
        </View>

        {/* Global feed entry — everyone's posts in one stream, always first */}
        {globalGroup ? (
          <RiseIn index={0}>
            <Pressable
              // Href cast: /community/[groupId] is being added in this same
              // change set — expo's typed-route union regenerates on next start.
              onPress={() => router.push('/community/global' as Href)}
              accessibilityRole="button"
              accessibilityLabel={`Open the ${globalGroup.name} feed`}
              className="mb-3 rounded-2xl border border-accent-edge bg-accent-soft px-5 py-4 active:opacity-80"
            >
              <View className="flex-row items-center gap-3">
                <Globe color={clean.accent} size={22} strokeWidth={2.5} />
                <View className="flex-1">
                  <Heading className="text-base">{globalGroup.name}</Heading>
                  <Body className="mt-1 font-sora text-xs leading-4 text-fg-2">
                    {COMMUNITY_GROUPS[globalGroup.slug]?.description}
                  </Body>
                </View>
                <ChevronRight color={clean.accent} size={20} strokeWidth={2.5} />
              </View>
              <View className="mt-3 flex-row items-center gap-1.5">
                <Users color={clean.fg2} size={13} strokeWidth={2.5} />
                <Body className="font-sora text-xs text-fg-2">
                  {memberLabel(globalGroup.memberCount)}
                </Body>
              </View>
            </Pressable>
          </RiseIn>
        ) : null}

        {/* One card per real group */}
        {realGroups.map((group, i) => (
          <RiseIn key={group.groupId} index={i + 1}>
            <GroupCard
              group={group}
              myProfile={myProfileByGroup.get(group.groupId) ?? null}
              joining={joiningId === group.groupId}
              onJoin={() => onJoin(group.groupId)}
            />
          </RiseIn>
        ))}
      </ScrollView>
    </Screen>
    </CommunityRulesGate>
  );
}

/**
 * A browse card for one group: name + description, member-ish count, and
 * either the caller's pseudonym there ("Joined as …") or a volt Join
 * affordance. Tapping the card opens the feed either way — createPost
 * auto-joins, so Join is purely the up-front handle reveal.
 */
function GroupCard({
  group,
  myProfile,
  joining,
  onJoin,
}: {
  group: GroupRow;
  myProfile: { handle: string; avatarSeed: string } | null;
  joining: boolean;
  onJoin: () => void;
}) {
  const copy = COMMUNITY_GROUPS[group.slug];
  return (
    <Pressable
      onPress={() => router.push(`/community/${group.groupId}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${group.name}`}
      className="mb-3 rounded-2xl border border-stroke bg-surface px-5 py-4 active:opacity-80"
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-3">
          <Heading className="text-base">{group.name}</Heading>
          <Body className="mt-1 font-sora text-xs leading-4 text-fg-2">
            {copy?.description}
          </Body>
        </View>
        <ChevronRight color={clean.fg2} size={20} strokeWidth={2.5} />
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Users color={clean.fg2} size={13} strokeWidth={2.5} />
          <Body className="font-sora text-xs text-fg-2">{memberLabel(group.memberCount)}</Body>
        </View>

        {group.joined && myProfile ? (
          // The pseudonym lives on the card once joined — a tiny seeded-hue
          // avatar plus the handle, so your alias in each room stays familiar.
          <View className="flex-row items-center gap-2">
            <View
              className="h-5 w-5 items-center justify-center rounded-full"
              style={{ backgroundColor: avatarColor(myProfile.avatarSeed) }}
            >
              <Body className="font-sora-bold text-[10px] text-white">
                {myProfile.handle.charAt(0).toUpperCase()}
              </Body>
            </View>
            <Body className="font-sora text-xs text-fg-2">
              Joined as <Body className="font-sora-semibold text-xs text-fg">{myProfile.handle}</Body>
            </Body>
          </View>
        ) : (
          <Pressable
            onPress={onJoin}
            disabled={joining}
            accessibilityRole="button"
            accessibilityLabel={`Join ${group.name}`}
            className="rounded-full bg-accent px-4 py-2 active:opacity-90"
          >
            {joining ? (
              <ActivityIndicator size="small" color={clean.accentInk} />
            ) : (
              <Heading className="text-xs text-accent-ink">Join</Heading>
            )}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
