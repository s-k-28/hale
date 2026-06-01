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
import { ArrowUp, Wind } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Body, Display, Heading, Label } from '@/components/ui/Text';
import { colors } from '@/theme/colors';

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

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<SageMessage>>(null);

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
    track(Ev.COACH_MESSAGE_SENT);
    try {
      await send({ content });
    } catch {
      // Restore the draft so a transient failure never loses what they typed.
      setDraft((prev) => (prev.length > 0 ? prev : content));
    } finally {
      setSending(false);
    }
  }, [draft, sending, send]);

  const canSend = draft.trim().length > 0 && !sending;
  const loading = authLoading || (isAuthenticated && messages === undefined);

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
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerClassName="px-4 py-6"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Composer — pinned bar. Coal input, lime circular send. */}
        <View className="flex-row items-end gap-2.5 border-t border-line bg-void px-4 pb-2 pt-3">
          <View className="flex-1 justify-center rounded-3xl border border-line bg-coal px-4 py-3">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Talk to Sage…"
              placeholderTextColor={colors.ash}
              className="max-h-32 font-body text-base leading-5 text-chalk"
              multiline
              returnKeyType="default"
              editable={!sending}
            />
          </View>
          <Pressable
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message to Sage"
            className={`h-12 w-12 items-center justify-center rounded-full ${
              canSend ? 'bg-volt active:bg-volt-dim' : 'bg-coal border border-line'
            }`}
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
            : 'rounded-3xl rounded-bl-md border border-line bg-coal px-4 py-3'
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
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-volt">
        <Wind color={colors.voltInk} size={36} strokeWidth={2.5} />
      </View>
      <Display className="mt-7 text-center text-5xl text-chalk">HEY,{'\n'}I&apos;M SAGE</Display>
      <Body className="mt-4 max-w-[300px] text-center text-base leading-6 text-ash">
        Here the second a craving hits. Tell me what&apos;s going on — no judgment,
        just backup to ride it out. It peaks, then it passes.
      </Body>
      <Label className="mt-8 text-ash">Cravings pass · you don&apos;t quit on yourself</Label>
    </View>
  );
}
