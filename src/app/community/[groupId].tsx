import { useCallback } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { FlashList } from '@shopify/flash-list';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { CommunityFeedItem } from '@convex/communityPosts';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { RiseIn } from '@/components/motion';
import { PostCard } from '@/components/community/PostCard';
import { Composer } from '@/components/community/Composer';
import { CommunityRulesGate } from '@/components/community/CommunityRulesGate';
import { CrisisCard } from '@/components/community/CrisisCard';
import { GroupEmptyState } from '@/components/community/GroupEmptyState';
import { MUTE_CONFIRMATION, REPORT_CONFIRMATION } from '@/constants/communityCopy';
import { colors } from '@/theme/colors';

/**
 * Group feed — the anonymous community wall for one group ('global' = every
 * group's posts in one stream). Reactive, paginated, newest first; PostCard
 * rows handle identity (pseudonym + avatar hue) and per-post actions, this
 * screen owns the mutations behind them (react / report / mute) plus the
 * crisis-resource card for the viewer's OWN flagged posts.
 *
 * Identity safety: everything rendered here comes pre-shaped from the server
 * (handle / avatarSeed / coarse timeLabel only) — no userId ever reaches this
 * screen, so there's nothing to leak.
 */

const PAGE_SIZE = 20;

export default function GroupFeed() {
  // 'global' is a real param value (the all-groups feed), not just an Id.
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const insets = useSafeAreaInsets();

  // Resolves the slug-or-id to a real group (name for the header, the real
  // Id for the Composer, the caller's own handle). null = bad/unknown key.
  const meta = useQuery(
    api.community.resolveGroup,
    groupId ? { groupKey: groupId } : 'skip',
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.communityPosts.feed,
    groupId ? { groupKey: groupId } : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  // Author-only crisis surface — survives scrolling/navigation, so the 988
  // card stays put until the author dismisses it (acked server-side).
  const alerts = useQuery(api.communityPosts.myCrisisAlerts, {});
  const ackCrisisCard = useMutation(api.communityPosts.ackCrisisCard);
  const toggleReaction = useMutation(api.communityPosts.toggleReaction);
  const reportContent = useMutation(api.communityModeration.reportContent);
  const muteProfile = useMutation(api.communityModeration.muteProfile);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/community');
  }, []);

  const onToggleReaction = useCallback(
    (postId: Id<'communityPosts'>) => {
      // Tactile beat lands on the tap; the reactive feed reflects the truth.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toggleReaction({ postId }).catch(() => {
        // Transient write failure — the query re-renders the real count.
      });
    },
    [toggleReaction],
  );

  const onReport = useCallback(
    async (args: { targetType: 'post' | 'comment'; targetId: string; reason: string }) => {
      try {
        await reportContent(args);
        toast(REPORT_CONFIRMATION);
      } catch {
        // Best-effort; never trap the user in an error for looking out.
      }
    },
    [reportContent],
  );

  const onMuteAuthor = useCallback(
    async (args: { profileId: Id<'anonProfiles'>; handle: string }) => {
      try {
        await muteProfile({ profileId: args.profileId });
        toast(MUTE_CONFIRMATION(args.handle));
      } catch {
        // Same — the mute either lands or the feed simply stays as-is.
      }
    },
    [muteProfile],
  );

  // Dismissing the crisis card acks every outstanding alert so it doesn't
  // pop right back for an older flagged post.
  const onDismissCrisis = useCallback(() => {
    for (const alert of alerts ?? []) {
      ackCrisisCard(alert).catch(() => {});
    }
  }, [alerts, ackCrisisCard]);

  const renderItem = useCallback(
    ({ item, index }: { item: CommunityFeedItem; index: number }) => (
      <PostCard
        item={item}
        index={index}
        showGroupTag={groupId === 'global'}
        onToggleReaction={onToggleReaction}
        onReport={onReport}
        onMuteAuthor={onMuteAuthor}
      />
    ),
    [groupId, onToggleReaction, onReport, onMuteAuthor],
  );

  // Resolving the group key — quiet spinner on the void.
  if (meta === undefined) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.volt} />
      </Screen>
    );
  }

  // Unknown group (stale link / mangled id) — a friendly dead end, no jargon.
  if (meta === null) {
    return (
      <Screen className="items-center justify-center px-8">
        <Heading className="text-center text-2xl">Can't find that space</Heading>
        <Body className="mt-3 text-center text-sm leading-relaxed text-ash">
          It may have moved. The rest of the community is still right where you
          left it.
        </Body>
        <Button label="Back to Community" variant="surface" onPress={goBack} className="mt-8 self-stretch" />
      </Screen>
    );
  }

  return (
    <CommunityRulesGate>
    <Screen edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        {/* Header — back chevron, group name, member-ish count */}
        <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-coal active:opacity-70"
          >
            <ChevronLeft color={colors.chalk} size={20} strokeWidth={2.5} />
          </Pressable>
          <View className="flex-1">
            <Heading className="text-xl" numberOfLines={1}>
              {meta.name}
            </Heading>
            <Label className="mt-0.5">
              {meta.memberCount.toLocaleString()}{' '}
              {meta.memberCount === 1 ? 'person' : 'people'} here
            </Label>
          </View>
        </View>

        {/* Crisis resources — pinned above the feed for the author's own
            flagged post, until they tell us they're okay. */}
        {alerts && alerts.length > 0 ? (
          <RiseIn style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <CrisisCard onDismiss={onDismissCrisis} />
          </RiseIn>
        ) : null}

        <FlashList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.postId}
          onEndReached={() => {
            if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
          }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListEmptyComponent={
            status === 'LoadingFirstPage' ? (
              <View className="items-center py-16">
                <ActivityIndicator color={colors.volt} />
              </View>
            ) : (
              <GroupEmptyState groupSlug={meta.slug} />
            )
          }
          ListFooterComponent={
            status === 'LoadingMore' ? (
              <View className="items-center py-4">
                <ActivityIndicator color={colors.volt} />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        />

        {/* Composer pinned at the bottom — posting from the global feed posts
            under the global pseudonym (the screen hands over the REAL id). */}
        <View
          className="border-t border-line bg-void px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <Composer groupId={meta.groupId} myHandle={meta.myHandle} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
    </CommunityRulesGate>
  );
}
