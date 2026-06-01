import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Profile / settings — stub (P3 milestone history + paywall upsell land here). */
export default function You() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-6 pt-4">
        <Text className="text-2xl font-bold text-hale-900">You</Text>
        <Text className="mt-2 text-hale-900/60">
          Milestone history, transformation card, and HALE+ — coming in Phase 1.
        </Text>
      </View>
    </SafeAreaView>
  );
}
