import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  View,
  type AlertButton,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useQuery } from 'convex/react';
import { Flag, Heart, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { CommunityFeedItem, CommunityCommentItem } from '@convex/communityPosts';
import { Body, Muted as Caption, Eyebrow as Label, Badge } from '@/ui';
import { RiseIn, PRESS_IN_SPRING, PRESS_OUT_SPRING } from '@/components/motion';
import { clean } from '@/theme/clean';
import {
  COMMUNITY_GROUPS,
  COMPOSER_COMMENT_PLACEHOLDER,
  COMPOSER_PENDING_LINE,
  MUTE_ACTION_LABEL,
  REACTION_LABEL,
  REPORT_ACTION_LABEL,
  REPORT_COMMENT_ACTION_LABEL,
  REPORT_REASONS,
} from '@/constants/communityCopy';
import { Composer } from './Composer';

/**
 * PostCard — one anonymous post in a community feed. Identity is the
 * pseudonym ONLY: handle + a deterministic avatar hue from avatarSeed + the
 * server's coarse time label. Nothing else about the author ever renders.
 *
 * The card stays dumb about mutations: reaction / report / mute are invoked
 * through callbacks and the screen owns the Convex calls. Comments are the
 * one piece of local state — an inline expansion with its own query and a
 * compact Composer in comment mode.
 */

export type PostCardProps = {
  item: CommunityFeedItem;
  index?: number; // RiseIn stagger position
  showGroupTag?: boolean; // global feed: show origin-group Badge (groupSlug)
  onToggleReaction: (postId: Id<'communityPosts'>) => void;
  onReport: (args: { targetType: 'post' | 'comment'; targetId: string; reason: string }) => void;
  onMuteAuthor: (args: { profileId: Id<'anonProfiles'>; handle: string }) => void;
};

/**
 * Report flow (Guideline 1.2): a reason picker so triage can prioritize
 * (self-harm reports jump the queue). The chosen key lands in
 * communityReports.reason.
 */
function openReportReasons(
  targetType: 'post' | 'comment',
  targetId: string,
  onReport: PostCardProps['onReport'],
) {
  Alert.alert("What's going on?", 'Your report is anonymous.', [
    ...REPORT_REASONS.map((r) => ({
      text: r.label,
      onPress: () => onReport({ targetType, targetId, reason: r.key }),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

// Pressable driven by Reanimated so the press transform runs on the UI thread.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Small pressable with the shared Button press physics (0.96 spring scale). */
function SpringPressable({
  className = '',
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableProps & { className?: string }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withSpring(0.96, PRESS_IN_SPRING);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withSpring(1, PRESS_OUT_SPRING);
    onPressOut?.(e);
  };
  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className={className}
      style={pressStyle}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Deterministic pseudonym avatar — no images, ever. avatarSeed (6-char hex)
 * picks a stable hue; the circle shows the handle's first letter.
 */
function AnonAvatar({ seed, handle, size = 36 }: { seed: string; handle: string; size?: number }) {
  const hue = (parseInt(seed, 16) || 0) % 360;
  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 60%, 45%)`,
      }}
    >
      <Body
        className="font-sora-bold text-fg"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {handle.charAt(0).toUpperCase()}
      </Body>
    </View>
  );
}

/** One comment row — same pseudonym-only identity rendering as the card. */
function CommentRow({
  comment,
  onReport,
  onMuteAuthor,
}: {
  comment: CommunityCommentItem;
  onReport: PostCardProps['onReport'];
  onMuteAuthor: PostCardProps['onMuteAuthor'];
}) {
  const isPending = comment.isMine && comment.status === 'pending';
  // Report + block both offered on others' comments (1.2 requires both
  // actions on every piece of UGC, not just top-level posts).
  const confirmReport = () => {
    const buttons: AlertButton[] = [
      {
        text: REPORT_COMMENT_ACTION_LABEL,
        onPress: () => openReportReasons('comment', comment.commentId, onReport),
      },
    ];
    if (!comment.isMine) {
      buttons.push({
        text: MUTE_ACTION_LABEL(comment.handle),
        onPress: () =>
          onMuteAuthor({ profileId: comment.authorProfileId, handle: comment.handle }),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(comment.handle, undefined, buttons);
  };
  return (
    <View className="flex-row gap-2.5">
      <AnonAvatar seed={comment.avatarSeed} handle={comment.handle} size={28} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Body className="font-sora-semibold text-[13px] text-fg">{comment.handle}</Body>
          <Body className="text-xs text-fg-2">{comment.timeLabel}</Body>
          <View className="flex-1" />
          {!comment.isMine && (
            <Pressable
              hitSlop={16}
              onPress={confirmReport}
              accessibilityRole="button"
              accessibilityLabel="Report this comment"
            >
              <Flag size={14} color={clean.fg2} />
            </Pressable>
          )}
        </View>
        <Body
          className={`mt-1 text-sm leading-5 ${isPending ? 'text-fg-3' : 'text-fg'}`}
        >
          {comment.body}
        </Body>
        {isPending && <Caption className="mt-1">{COMPOSER_PENDING_LINE}</Caption>}
      </View>
    </View>
  );
}

export function PostCard({
  item,
  index = 0,
  showGroupTag = false,
  onToggleReaction,
  onReport,
  onMuteAuthor,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Only fetch comments once the thread is opened — feeds stay one query.
  const comments = useQuery(
    api.communityPosts.comments,
    commentsOpen ? { postId: item.postId } : 'skip',
  );

  const isPending = item.isMine && item.status === 'pending';

  // Report always offered; block hidden on your own posts.
  const openOverflow = () => {
    const buttons: AlertButton[] = [
      {
        text: REPORT_ACTION_LABEL,
        onPress: () => openReportReasons('post', item.postId, onReport),
      },
    ];
    if (!item.isMine) {
      buttons.push({
        text: MUTE_ACTION_LABEL(item.handle),
        onPress: () =>
          onMuteAuthor({ profileId: item.authorProfileId, handle: item.handle }),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(item.handle, undefined, buttons);
  };

  // Origin-group tag on the global feed; skip it for global-native posts
  // (an "Everyone" tag on the Everyone feed says nothing).
  const groupTagName =
    showGroupTag && item.groupSlug !== 'global'
      ? (COMMUNITY_GROUPS[item.groupSlug]?.name ?? item.groupSlug)
      : null;

  return (
    <RiseIn index={index}>
      <View className="rounded-2xl border border-stroke bg-surface px-4 py-4">
        {/* Identity row — handle / avatarSeed / timeLabel and NOTHING else */}
        <View className="flex-row items-center gap-3">
          <AnonAvatar seed={item.avatarSeed} handle={item.handle} />
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Body className="font-sora-semibold text-[14px] text-fg">{item.handle}</Body>
              {item.isMine && <Label className="text-accent">you</Label>}
            </View>
            <Body className="text-xs text-fg-2">{item.timeLabel}</Body>
          </View>
          {groupTagName && <Badge label={groupTagName} />}
        </View>

        {/* Body — your own pending post sits dimmed with no-shame copy */}
        <Body
          className={`mt-3 text-[15px] leading-6 ${isPending ? 'text-fg-3' : 'text-fg'}`}
        >
          {item.body}
        </Body>
        {isPending && <Caption className="mt-2">{COMPOSER_PENDING_LINE}</Caption>}

        {/* Footer — "With you" reaction, comment toggle, overflow */}
        <View className="mt-3 flex-row items-center gap-5">
          <SpringPressable
            hitSlop={8}
            onPress={() => onToggleReaction(item.postId)}
            accessibilityRole="button"
            accessibilityState={{ selected: item.myReaction }}
            className="flex-row items-center gap-1.5"
          >
            <Heart
              size={18}
              strokeWidth={2.5}
              color={item.myReaction ? clean.accent : clean.fg2}
              fill={item.myReaction ? clean.accent : 'transparent'}
            />
            <Body
              className={`font-sora-semibold text-xs ${item.myReaction ? 'text-accent' : 'text-fg-2'}`}
            >
              {REACTION_LABEL}
              {item.reactionCount > 0 ? ` · ${item.reactionCount}` : ''}
            </Body>
          </SpringPressable>

          <SpringPressable
            hitSlop={8}
            onPress={() => setCommentsOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="View comments"
            accessibilityState={{ expanded: commentsOpen }}
            className="flex-row items-center gap-1.5"
          >
            <MessageCircle
              size={18}
              strokeWidth={2.5}
              color={commentsOpen ? clean.fg : clean.fg2}
            />
            {item.commentCount > 0 && (
              <Body
                className={`font-sora-semibold text-xs ${commentsOpen ? 'text-fg' : 'text-fg-2'}`}
              >
                {item.commentCount}
              </Body>
            )}
          </SpringPressable>

          <View className="flex-1" />

          <SpringPressable
            hitSlop={8}
            onPress={openOverflow}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MoreHorizontal size={18} color={clean.fg2} />
          </SpringPressable>
        </View>

        {/* Inline comment thread + compact comment composer */}
        {commentsOpen && (
          <View className="mt-4 gap-3 border-t border-stroke pt-4">
            {comments === undefined ? (
              <ActivityIndicator color={clean.accent} />
            ) : (
              comments.map((comment) => (
                <CommentRow
                  key={comment.commentId}
                  comment={comment}
                  onReport={onReport}
                  onMuteAuthor={onMuteAuthor}
                />
              ))
            )}
            <Composer
              groupId={item.groupId}
              postId={item.postId}
              placeholder={COMPOSER_COMMENT_PLACEHOLDER}
            />
          </View>
        )}
      </View>
    </RiseIn>
  );
}
