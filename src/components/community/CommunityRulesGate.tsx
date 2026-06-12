import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';
import { api } from '@convex/_generated/api';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { RiseIn } from '@/components/motion';
import { colors } from '@/theme/colors';
import { COMMUNITY_RULES, POST_FAILED } from '@/constants/communityCopy';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/constants/legal';

/**
 * CommunityRulesGate — the affirmative zero-tolerance acceptance App Review
 * requires before any UGC surface (Guideline 1.2: terms accepted via explicit
 * action, not passive footer text). Wraps every community screen; children
 * render only once users.communityRulesAcceptedAt is set. The server enforces
 * the same gate on createPost/createComment, so this screen is the UX, not
 * the security boundary.
 */
export function CommunityRulesGate({ children }: { children: ReactNode }) {
  const status = useQuery(api.users.communityRulesStatus, {});
  const acceptRules = useMutation(api.users.acceptCommunityRules);
  const [accepting, setAccepting] = useState(false);

  if (status === undefined) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.volt} />
      </Screen>
    );
  }

  if (status.accepted) return <>{children}</>;

  const onAgree = async () => {
    if (accepting) return;
    setAccepting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await acceptRules({});
      // Reactive: communityRulesStatus flips and the children render.
    } catch {
      toast.error(POST_FAILED);
      setAccepting(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerClassName="flex-grow px-6 pb-10 pt-8"
        showsVerticalScrollIndicator={false}
      >
        <RiseIn>
          <ShieldCheck color={colors.volt} size={32} strokeWidth={2.5} />
          <Heading className="mt-4 text-3xl">{COMMUNITY_RULES.title}</Heading>
          <Body className="mt-3 text-[15px] leading-6 text-ash">
            {COMMUNITY_RULES.intro}
          </Body>

          <View className="mt-6 gap-3">
            {COMMUNITY_RULES.rules.map((rule) => (
              <View key={rule} className="flex-row gap-3 rounded-2xl border border-line bg-coal px-4 py-3">
                <Label className="text-volt">•</Label>
                <Body className="flex-1 text-sm leading-5 text-chalk">{rule}</Body>
              </View>
            ))}
          </View>

          <Body className="mt-6 text-sm leading-5 text-ash">
            {COMMUNITY_RULES.enforcement}
          </Body>
          <Body className="mt-3 text-sm leading-5 text-ash">
            {COMMUNITY_RULES.contactLine}
            <Body
              className="text-sm text-volt"
              onPress={() => Linking.openURL(SUPPORT_MAILTO).catch(() => {})}
            >
              {SUPPORT_EMAIL}
            </Body>
          </Body>
        </RiseIn>

        <View className="flex-1" />
        <Button
          label={COMMUNITY_RULES.agreeLabel}
          onPress={onAgree}
          disabled={accepting}
          className="mt-8"
        />
      </ScrollView>
    </Screen>
  );
}
