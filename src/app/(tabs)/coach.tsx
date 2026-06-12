import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from 'sonner-native';
import { SageMark } from '@/components/SageMark';
import { ArrowUp, Wind, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { presentPaywall } from '@/lib/paywall';
import { Body, Caption, Display, Heading, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { PRIVACY_POLICY_URL } from '@/constants/legal';
import { Linking } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { RiseIn } from '@/components/motion';

type SageMessage = NonNullable<ReturnType<typeof useQuery<typeof api.sage.messages>>>[number];

/**
 * I2 — Sage coach chat. The whole transcript is a reactive useQuery; Sage's
 * replies are written by the Convex action (convex/sage.ts) and simply stream
 * in here as new rows. We never optimistic-render a fake Sage turn — the source
 * of truth is the DB. The user turn appears instantly because `send` writes it
 * synchronously before scheduling generation.
 *
 * Tone: warm, non-judgmental. Cravings peak and pass — every line of UI copy
 * here reinforces "you can ride this out", never "you failed".
 */
export default function Coach() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const messages = useQuery(api.sage.messages, isAuthenticated ? {} : 'skip');
  const send = useMutation(api.sage.send);
  // Guideline 5.1.2(i): chat content goes to third-party AI (Groq replies,
  // Google embeddings) — explicit consent gates the composer, and sage.send
  // enforces the same flag server-side.
  const aiConsent = useQuery(api.users.aiConsentStatus, isAuthenticated ? {} : 'skip');
  const setAiConsent = useMutation(api.users.setAiConsent);
  const consented = aiConsent?.consented === true;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Free-tier daily Sage cap reached — show an "unlock unlimited" CTA instead of
  // a dead-end (unlimited Sage is HALE+). Cleared on the next accepted message.
  const [capHit, setCapHit] = useState(false);
  const listRef = useRef<FlatList<SageMessage>>(null);

  const onUpgradeSage = useCallback(async () => {
    track(Ev.PAYWALL_FEATURE_TAPPED, { feature: 'unlimited_sage' });
    const result = await presentPaywall('unlimited_sage');
    if (result === PAYWALL_RESULT.NOT_PRESENTED) router.push('/paywall');
  }, []);

  // Coach efficacy north-star: one session event per screen mount.
  useEffect(() => {
    track(Ev.COACH_SESSION);
  }, []);

  const messageCount = messages?.length ?? 0;

  // Keep the newest turn in view as the transcript grows (incl. Sage's reply
  // arriving reactively a moment after send).
  useEffect(() => {
    if (messageCount > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messageCount]);

  const onSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      const res = await send({ content });
      const capState = res?.accepted === false ? 'blocked_quota' : 'under';
      // Enrich with tier + today's count + cap state (P3 — usage by tier).
      track(Ev.COACH_MESSAGE_SENT, {
        tier: res?.tier,
        messages_today_count: res?.dailyCount,
        cap_state: capState,
      });
      if (res?.accepted === false) {
        // Daily Sage quota reached (no compute spent) — restore draft + surface it.
        track(Ev.SAGE_CAP_HIT, {
          tier: res.tier,
          cap_type: res.capType,
          daily_count: res.dailyCount,
        });
        setDraft((prev) => (prev.length > 0 ? prev : content));
        if (res.tier === 'free') {
          // Free cap → convert the limit into an upgrade moment (HALE+ = unlimited).
          setCapHit(true);
          toast.error('Daily Sage limit reached. Unlock unlimited with HALE+.');
        } else {
          toast.error("You've reached today's Sage limit. Back tomorrow.");
        }
      } else {
        if (capHit) setCapHit(false);
        // first_sage_message ONCE per user (candidate activation event, q1 split).
        AsyncStorage.getItem('hale:firstSage').then((seen) => {
          if (!seen) {
            track(Ev.FIRST_SAGE_MESSAGE, {});
            AsyncStorage.setItem('hale:firstSage', '1').catch(() => {});
          }
        });
      }
    } catch {
      // Restore the draft so a transient failure never loses what they typed.
      setDraft((prev) => (prev.length > 0 ? prev : content));
    } finally {
      setSending(false);
    }
  }, [draft, sending, send, capHit]);

  const canSend = draft.trim().length > 0 && !sending && consented;
  const loading =
    authLoading || (isAuthenticated && (messages === undefined || aiConsent === undefined));

  // "Sage is thinking" — tied to REAL backend state: the user's turn is the last
  // message and Sage's reactive reply row hasn't landed yet (or the send mutation
  // is still in flight). Clears the instant the sage reply row arrives.
  const awaitingReply =
    sending || (!!messages && messages.length > 0 && messages[messages.length - 1].role === 'user');

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top', 'left', 'right']}>
      {/* Header — Sage's identity. Loud caps wordmark, lime presence dot. */}
      <View className="flex-row items-center justify-between border-b border-line px-6 pb-4 pt-1">
        <View>
          <Heading className="text-3xl text-chalk">SAGE</Heading>
          <Label className="mt-1 text-ash">Your quit coach · always on</Label>
        </View>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-volt">
          <Wind color={colors.voltInk} size={20} strokeWidth={2.75} />
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.volt} />
          </View>
        ) : messageCount === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m._id}
            // Sage's reply fade-rises in as it lands (its row arrives reactively);
            // the user's own turn appears instantly, no animation.
            renderItem={({ item }) =>
              item.role === 'sage' ? (
                <RiseIn>
                  <Bubble message={item} />
                </RiseIn>
              ) : (
                <Bubble message={item} />
              )
            }
            // The typing indicator sits at the tail while Sage composes — a Sage-
            // styled bubble with three stagger-bouncing dots, gone the moment the
            // reply row lands (awaitingReply flips false).
            ListFooterComponent={awaitingReply ? <TypingIndicator /> : null}
            // grow + justify-end bottom-anchors a short transcript just above the
            // composer (chat-natural headroom on top) instead of stranding it at
            // the top with a dead void below.
            contentContainerClassName="px-4 py-6 grow justify-end"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* AI-consent card (5.1.2(i)) — one explicit yes before any chat data
            leaves for third-party AI. Declining just leaves the composer
            locked; the rest of HALE works without Sage. */}
        {!loading && !consented ? (
          <View className="mx-4 mb-2 rounded-2xl border border-line bg-coal px-4 py-4">
            <Body className="font-body-semibold text-[15px] text-chalk">
              Before you chat with Sage
            </Body>
            <Body className="mt-2 text-[13px] leading-5 text-ash">
              Sage runs on third-party AI. Messages you send — plus your quit
              stats like streak, cravings, and triggers — are shared with Groq
              (which writes Sage&apos;s replies) and Google (which powers
              knowledge search). They process it only to run this feature,
              never for ads. Delete it all anytime in You ▸ Delete account.
            </Body>
            <Body
              className="mt-2 text-[13px] text-volt"
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
              accessibilityRole="link"
            >
              Read the privacy policy
            </Body>
            <Button
              label="I agree — start chatting"
              onPress={() => {
                void setAiConsent({}).catch(() => {
                  toast.error("Couldn't save that. Please try again.");
                });
              }}
              className="mt-3"
            />
          </View>
        ) : null}

        {/* Free-tier daily cap reached → unlock unlimited Sage with HALE+. */}
        {capHit ? (
          <Pressable
            onPress={onUpgradeSage}
            accessibilityRole="button"
            accessibilityLabel="Unlock unlimited Sage with HALE+"
            className="mx-4 mb-1 flex-row items-center rounded-2xl border border-volt/30 bg-volt/10 px-4 py-3 active:opacity-90"
          >
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-volt">
              <Sparkles color={colors.voltInk} size={18} strokeWidth={2.5} />
            </View>
            <View className="flex-1 pr-2">
              <Body className="font-body-semibold text-[15px] text-chalk">
                Unlock unlimited coaching
              </Body>
              <Body className="mt-0.5 text-xs text-ash">
                You’ve hit today’s free limit. HALE+ removes the cap.
              </Body>
            </View>
            <ArrowUp color={colors.volt} size={18} strokeWidth={2.75} style={{ transform: [{ rotate: '45deg' }] }} />
          </Pressable>
        ) : null}

        {/* Composer — pinned bar. Coal input, lime circular send. */}
        <View className="flex-row items-end gap-2.5 border-t border-line bg-void px-4 pb-2 pt-3">
          <View className="flex-1 justify-center rounded-3xl border border-line bg-coal px-4 py-3">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={consented ? 'Talk to Sage…' : 'Agree above to start chatting'}
              placeholderTextColor={colors.ash}
              className="max-h-32 font-body text-base leading-5 text-chalk"
              multiline
              returnKeyType="default"
              editable={!sending && consented}
            />
          </View>
          <Pressable
            // Remount across the disabled<->enabled boundary instead of an in-place
            // update: NativeWind's interop throws "navigation context" when it
            // upgrades an already-mounted Pressable to interactive (gaining
            // active: + a shadow style) in place — typing here crashed the whole
            // Coach screen. A keyed remount makes it a fresh mount, which works.
            // (Same root cause + fix as src/components/ui/Button.tsx.)
            key={canSend ? 'send-on' : 'send-off'}
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message to Sage"
            className={`h-12 w-12 items-center justify-center rounded-full ${
              canSend
                ? 'bg-volt border-b-[3px] border-volt-edge active:bg-volt-dim active:translate-y-0.5'
                : 'bg-coal border border-line'
            }`}
            style={
              canSend
                ? { shadowColor: colors.volt, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }
                : undefined
            }
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.voltInk} />
            ) : (
              <ArrowUp
                color={canSend ? colors.voltInk : colors.ash}
                size={22}
                strokeWidth={3}
              />
            )}
          </Pressable>
        </View>

        {/* Persistent medical disclaimer (Guideline 1.4.1) — on the chat
            surface itself, not just onboarding/SOS. */}
        <Caption className="px-5 pb-2 text-center">
          Sage is an AI coach, not a medical professional. Check with a doctor
          before medical decisions, including NRT or medication.
        </Caption>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A single chat turn. User bubbles are electric lime & right-aligned with
 *  near-black ink; Sage's are coal on the left — high-contrast, sticker energy. */
function Bubble({ message }: { message: SageMessage }) {
  const isUser = message.role === 'user';
  return (
    <View className={`mb-3 max-w-[82%] ${isUser ? 'self-end' : 'self-start'}`}>
      <View
        className={
          isUser
            ? 'rounded-3xl rounded-br-md bg-volt px-4 py-3'
            : 'rounded-3xl rounded-bl-md border-l-2 border-volt/50 bg-raised px-4 py-3'
        }
        // Sage's reply is elevated onto the raised plane (lighter fill + soft
        // shadow) with a volt voice-rule on its leading edge, so the coach's
        // words read as the lit, prominent object — not the dimmest thing on
        // screen. The user's bubble keeps its lime identity.
        style={
          isUser
            ? undefined
            : {
                shadowColor: '#000000',
                shadowOpacity: 0.35,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
              }
        }
      >
        <Body
          className={`text-[15px] leading-[21px] ${isUser ? 'font-body-medium text-volt-ink' : 'text-chalk'}`}
        >
          {message.content}
        </Body>
      </View>
    </View>
  );
}

/** Warm, low-pressure first contact — no empty-screen anxiety, no judgment. */
function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-9">
      <BreathingSage />
      <Display className="mt-6 text-center text-5xl text-chalk">HEY,{'\n'}I&apos;M SAGE</Display>
      <Body className="mt-4 max-w-[300px] text-center text-base leading-6 text-ash">
        Here the second a craving hits. Tell me what&apos;s going on, no judgment,
        just backup to ride it out. It peaks, then it passes.
      </Body>
      <Label className="mt-8 text-ash">Cravings pass · you don&apos;t quit on yourself</Label>
    </View>
  );
}

/**
 * Sage's mascot, gently breathing (~4s scale cycle) so the empty state reads as a
 * calm presence waiting with you, not a frozen icon. Scale-only → no layout shift.
 */
function BreathingSage() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.045, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <SageMark size={112} />
    </Animated.View>
  );
}

/** One dot in the typing indicator — bounces up then settles, on a loop. */
function TypingDot({ delay }: { delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
          // Hold low so the three dots read as a travelling wave, not a buzz.
          withTiming(0, { duration: 360 }),
        ),
        -1,
        false,
      ),
    );
  }, [y, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: 0.45 + (-y.value / 5) * 0.45,
  }));
  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ash }, style]}
    />
  );
}

/**
 * "Sage is thinking" — three stagger-bouncing dots inside a Sage-styled bubble
 * (raised plane, volt voice-rule), so it reads as Sage composing a reply. Mounted
 * only while awaitingReply (real backend state); removed the instant the reply lands.
 */
function TypingIndicator() {
  return (
    <View className="mb-3 max-w-[82%] self-start">
      <View
        className="flex-row items-center gap-1.5 rounded-3xl rounded-bl-md border-l-2 border-volt/50 bg-raised px-4 py-4"
        style={{
          shadowColor: '#000000',
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <TypingDot delay={0} />
        <TypingDot delay={140} />
        <TypingDot delay={280} />
      </View>
    </View>
  );
}
