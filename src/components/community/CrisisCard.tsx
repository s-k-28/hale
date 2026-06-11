import { Linking, Pressable, View } from 'react-native';
import { HeartHandshake, MessageCircle, Phone } from 'lucide-react-native';
import { Body, Heading } from '@/components/ui/Text';
import { RiseIn } from '@/components/motion';
import { colors } from '@/theme/colors';
import { CRISIS_CARD } from '@/constants/communityCopy';

/**
 * Crisis resource card — shown only to an author whose own post sounded like
 * they're in a dark place. Warm and prominent, never alarming: volt accents
 * (deliberately NOT sos red — this is a hand on the shoulder, not a siren).
 * All copy lives in communityCopy.CRISIS_CARD; each resource row deep-links
 * straight into the phone (tel:/sms:) so help is one tap away. Dismissal
 * persists server-side via ackCrisisCard — the screen owns that mutation and
 * just hands us onDismiss.
 */

export type CrisisCardProps = {
  onDismiss: () => void;
};

/** Pick the row icon from the deep-link scheme (call vs. text). */
function ResourceIcon({ url }: { url: string }) {
  return url.startsWith('tel:') ? (
    <Phone color={colors.volt} size={16} strokeWidth={2.5} />
  ) : (
    <MessageCircle color={colors.volt} size={16} strokeWidth={2.5} />
  );
}

export function CrisisCard({ onDismiss }: CrisisCardProps) {
  return (
    <RiseIn>
      <View className="rounded-2xl border border-volt/30 bg-volt/10 px-5 py-4">
        <View className="flex-row items-center gap-2.5">
          <HeartHandshake color={colors.volt} size={20} strokeWidth={2.5} />
          <Heading className="flex-1 text-base">{CRISIS_CARD.title}</Heading>
        </View>
        <Body className="mt-2 text-sm leading-5 text-ash">{CRISIS_CARD.body}</Body>

        <View className="mt-3 gap-2">
          {CRISIS_CARD.resources.map((r) => (
            <Pressable
              key={r.url}
              onPress={() => {
                // If the device can't open the scheme (e.g. simulator without a
                // dialer) just swallow it — never crash a card meant to help.
                Linking.openURL(r.url).catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}. ${r.detail}`}
              className="flex-row items-center gap-3 rounded-xl border border-volt/20 bg-coal px-4 py-3 active:opacity-80"
            >
              <ResourceIcon url={r.url} />
              <View className="flex-1">
                <Body className="font-body-semibold text-sm text-chalk">{r.name}</Body>
                <Body className="mt-0.5 text-xs text-ash">{r.detail}</Body>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Ghost dismiss — quiet on purpose; the resources are the loud part. */}
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={CRISIS_CARD.dismissLabel}
          className="mt-3 items-center rounded-xl px-4 py-2.5 active:opacity-70"
        >
          <Body className="font-body-semibold text-sm text-ash">{CRISIS_CARD.dismissLabel}</Body>
        </Pressable>
      </View>
    </RiseIn>
  );
}

export default CrisisCard;
