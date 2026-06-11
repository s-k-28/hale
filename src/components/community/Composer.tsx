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
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { POST_MAX_CHARS } from '@convex/model/communityRules';
import { Body, Caption, Label } from '@/components/ui/Text';
import { PRESS_IN_SPRING, PRESS_OUT_SPRING } from '@/components/motion';
import { colors } from '@/theme/colors';
import {
  COMPOSER_PLACEHOLDER,
  COMPOSER_PENDING_LINE,
  POST_FAILED,
  RATE_LIMIT_MESSAGE,
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        <View className="rounded-2xl border border-line bg-coal/60 px-4 py-3">
          <Body className="text-[15px] leading-5 text-chalk/50" numberOfLines={2}>
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
          placeholderTextColor={colors.ash}
          multiline
          accessibilityLabel={placeholder}
          className={`flex-1 rounded-2xl border bg-coal px-4 py-3 font-body text-[15px] leading-5 text-chalk ${
            overLimit ? 'border-sos/60' : 'border-line'
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
          accessibilityState={{ disabled: !canSend }}
          className={`h-11 w-11 items-center justify-center rounded-full ${
            canSend ? 'bg-volt' : 'border border-line bg-inactive'
          }`}
          style={pressStyle}
        >
          <Send
            size={18}
            color={canSend ? colors.voltInk : colors.ash}
            strokeWidth={2.5}
          />
        </AnimatedPressable>
      </View>

      {showMetaRow && (
        <View className="flex-row items-center px-1">
          {inlineError !== null ? (
            <Caption className="text-sos">{inlineError}</Caption>
          ) : myHandle ? (
            <Label>posting as {myHandle}</Label>
          ) : null}
          <View className="flex-1" />
          {draft.length >= COUNTER_VISIBLE_AT && (
            <Caption className={overLimit ? 'text-sos' : ''}>
              {draft.length}/{POST_MAX_CHARS}
            </Caption>
          )}
        </View>
      )}
    </View>
  );
}
