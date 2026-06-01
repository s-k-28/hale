import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';

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
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      {/* Header — Sage's identity, calm and present */}
      <View className="border-b border-hale-50 px-6 pb-3 pt-1">
        <Text className="text-2xl font-bold text-hale-900">Sage</Text>
        <Text className="mt-0.5 text-sm text-hale-900/50">Your quit coach · always here</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0f7a5a" />
          </View>
        ) : messageCount === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m._id}
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerClassName="px-4 py-4"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Composer — pinned input bar with circular send */}
        <View className="flex-row items-end gap-2 border-t border-hale-50 px-4 pb-2 pt-2">
          <View className="flex-1 justify-center rounded-3xl bg-hale-50 px-4 py-2.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Talk to Sage…"
              placeholderTextColor="#0a2f2466"
              className="max-h-32 text-base leading-5 text-hale-900"
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
            className={`h-11 w-11 items-center justify-center rounded-full ${
              canSend ? 'bg-hale-500' : 'bg-hale-100'
            }`}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-lg font-bold leading-none text-white">↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A single chat turn. User bubbles are brand teal & right-aligned; Sage's are
 *  a soft neutral on the left — the familiar AI-chat rhythm. */
function Bubble({ message }: { message: SageMessage }) {
  const isUser = message.role === 'user';
  return (
    <View className={`mb-2.5 max-w-[82%] ${isUser ? 'self-end' : 'self-start'}`}>
      <View
        className={
          isUser
            ? 'rounded-3xl rounded-br-md bg-hale-500 px-4 py-2.5'
            : 'rounded-3xl rounded-bl-md bg-hale-50 px-4 py-2.5'
        }
      >
        <Text className={`text-base leading-5 ${isUser ? 'text-white' : 'text-hale-900'}`}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

/** Friendly, low-pressure first contact — no empty-screen anxiety. */
function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-hale-50">
        <Text className="text-3xl">🌿</Text>
      </View>
      <Text className="mt-5 text-center text-xl font-semibold text-hale-900">
        Hey, I&apos;m Sage
      </Text>
      <Text className="mt-2 text-center text-base leading-6 text-hale-900/60">
        Here whenever a craving hits. Tell me what&apos;s going on — no judgment, just
        support to ride it out.
      </Text>
    </View>
  );
}
