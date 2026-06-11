import { View } from 'react-native';
import { MessagesSquare } from 'lucide-react-native';
import { Body, Heading } from '@/components/ui/Text';
import { RiseIn } from '@/components/motion';
import { colors } from '@/theme/colors';
import { COMMUNITY_GROUPS } from '@/constants/communityCopy';

/**
 * Per-group empty feed state — purely typographic (no illustration), an
 * invitation rather than a void. Copy is keyed by group slug in communityCopy
 * so each room's first-post nudge sounds like that room. Unknown slugs fall
 * back to the global entry so a copy/seed mismatch can never blank the screen.
 * The composer pinned below the list is the call to action — this just points
 * at it.
 */

export type GroupEmptyStateProps = {
  groupSlug: string; // 'global' included
};

export function GroupEmptyState({ groupSlug }: GroupEmptyStateProps) {
  const copy = COMMUNITY_GROUPS[groupSlug] ?? COMMUNITY_GROUPS['global'];
  return (
    <RiseIn>
      <View className="items-center px-8 py-16">
        <View className="h-14 w-14 items-center justify-center rounded-2xl border border-line bg-coal">
          <MessagesSquare color={colors.ash} size={24} strokeWidth={2} />
        </View>
        <Heading className="mt-5 text-center text-base">{copy.emptyTitle}</Heading>
        <Body className="mt-2 text-center text-sm leading-5 text-ash">{copy.emptyBody}</Body>
      </View>
    </RiseIn>
  );
}

export default GroupEmptyState;
