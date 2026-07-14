import { useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useMutation } from 'convex/react';
import { Send } from 'lucide-react-native';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { POST_MAX_CHARS } from '@convex/model/communityRules';
import { Body, Muted as Caption, Eyebrow as Label } from '@/ui';
import { PRESS_IN_SPRING, PRESS_OUT_SPRING } from '@/components/motion';
import { clean } from '@/theme/clean';
import {
  BANNED_MESSAGE,
  COMPOSER_PLACEHOLDER,
  COMPOSER_PENDING_LINE,
  POST_FAILED,
  RATE_LIMIT_MESSAGE,
  RULES_REQUIRED_MESSAGE,
} from '@/constants/communityCopy';

/**
 * Composer — the community text box. Two modes from one component:
 * post mode (default, writes to the group) and comment mode (when `postId`
 * is present). Text only, 500 chars, friendly counter past 400.
 *
 * Optimistic by design: submit clears the input immediately and shows the
 * draft in a dimmed "on its way" row while the mutation runs — once it
 * commits, the reactive feed renders the pending item (PostCard owns that
 * treatment) and the row disappears. Failures restore the draft: rate limits
 * toast the friendly copy, anything else surfaces POST_FAILED.
 */

export type ComposerProps = {
  groupId: Id<'communityGroups'>; // REAL id (screen resolves 'global' first)
  postId?: Id<'communityPosts'>; // present → comment mode (createComment)
  myHandle?: string | null; // shown as "posting as {handle}" when known
  placeholder?: string; // defaults to communityCopy.COMPOSER_PLACEHOLDER
};

// The live counter stays hidden until the draft gets long — no countdown
// anxiety on a two-line post.
const COUNTER_VISIBLE_AT = 400;

// Pressable driven by Reanimated so the press transform runs on the UI thread.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Composer({
  groupId,
  postId,
  myHandle,
  placeholder = COMPOSER_PLACEHOLDER,
}: ComposerProps) {
  const createPost = useMutation(api.communityPosts.createPost);
  const createComment = useMutation(api.communityPosts.createComment);

  const [draft, setDraft] = useState('');
  // The body in flight — non-null while the mutation runs (optimistic row).
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const overLimit = draft.length > POST_MAX_CHARS;
  const canSend = trimmed.length > 0 && !overLimit && pendingBody === null;

  // Same press physics as the shared Button: spring to 0.96 in, spring back out.
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePressIn = (_e: GestureResponderEvent) => {
    scale.value = withSpring(0.96, PRESS_IN_SPRING);
  };
  const handlePressOut = (_e: GestureResponderEvent) => {
    scale.value = withSpring(1, PRESS_OUT_SPRING);
  };

  const handleSend = async () => {
    if (!canSend) return;
    const body = trimmed;
    haptics.press();
    // Optimistic: clear right away — the dimmed pending row carries the copy
    // until the reactive feed picks the item up as status: 'pending'.
    setDraft('');
    setInlineError(null);
    setPendingBody(body);
    try {
      const res = postId
        ? await createComment({ postId, body })
        : await createPost({ groupId, body });
      if (!res.ok) {
        setDraft(body); // keep the draft — nothing the writer typed is lost
        if (res.reason === 'rate_limited') {
          toast(RATE_LIMIT_MESSAGE(res.retryAtMs));
        } else if (res.reason === 'banned') {
          // Ejected account (Guideline 1.2) — honest copy + the appeal path.
          setInlineError(BANNED_MESSAGE);
        } else if (res.reason === 'rules_not_accepted') {
          // Should be unreachable behind CommunityRulesGate; honest fallback.
          setInlineError(RULES_REQUIRED_MESSAGE);
        } else {
          // 'empty' / 'too_long' are guarded client-side, so reaching here is
          // a race (e.g. server rules tightened) — show the generic copy.
          setInlineError(POST_FAILED);
        }
      }
    } catch {
      setDraft(body);
      toast.error(POST_FAILED);
    } finally {
      setPendingBody(null);
    }
  };

  const showMetaRow =
    inlineError !== null || !!myHandle || draft.length >= COUNTER_VISIBLE_AT;

  return (
    <View className="gap-1.5">
      {pendingBody !== null && (
        <View className="rounded-2xl border border-stroke bg-surface px-4 py-3">
          <Body className="text-[15px] leading-5 text-fg-3" numberOfLines={2}>
            {pendingBody}
          </Body>
          <Caption className="mt-1">{COMPOSER_PENDING_LINE}</Caption>
        </View>
      )}

      <View className="flex-row items-end gap-2">
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            if (inlineError) setInlineError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={clean.fg2}
          multiline
          accessibilityLabel={placeholder}
          className={`flex-1 rounded-2xl border bg-surface px-4 py-3 font-sora text-[15px] leading-5 text-fg ${
            overLimit ? 'border-coral-edge' : 'border-stroke'
          }`}
          style={{ minHeight: postId ? 44 : 52, maxHeight: 120, textAlignVertical: 'top' }}
        />
        <AnimatedPressable
          // Keyed remount across the disabled<->enabled boundary — same NativeWind
          // interop workaround as the shared Button.
          key={canSend ? 'send-on' : 'send-off'}
          disabled={!canSend}
          onPress={handleSend}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={postId ? 'Send comment' : 'Post'}
          accessibilityState={{ disabled: !canSend }}
          className={`h-11 w-11 items-center justify-center rounded-full ${
            canSend ? 'bg-accent' : 'border border-stroke bg-surface-3'
          }`}
          style={pressStyle}
        >
          <Send
            size={18}
            color={canSend ? clean.accentInk : clean.fg2}
            strokeWidth={2.5}
          />
        </AnimatedPressable>
      </View>

      {showMetaRow && (
        <View className="flex-row items-center px-1">
          {inlineError !== null ? (
            <Caption className="text-coral">{inlineError}</Caption>
          ) : myHandle ? (
            <Caption className="text-[12px]">posting as {myHandle}</Caption>
          ) : null}
          <View className="flex-1" />
          {draft.length >= COUNTER_VISIBLE_AT && (
            <Caption className={overLimit ? 'text-coral' : ''}>
              {draft.length}/{POST_MAX_CHARS}
            </Caption>
          )}
        </View>
      )}
    </View>
  );
}
