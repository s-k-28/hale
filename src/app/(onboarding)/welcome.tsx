import { Link } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Welcome → quiz. (The quiz screen is built grounded in Mobbin references.) */
export default function Welcome() {
  return (
    <SafeAreaView className="flex-1 bg-hale-900">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-hale-100 text-4xl font-bold">HALE</Text>
        <Text className="mt-3 text-center text-hale-100/80 text-lg">
          Quit nicotine — and don&apos;t do it alone.
        </Text>
      </View>
      <View className="px-6 pb-10">
        <Link href="/(onboarding)/quiz" asChild>
          <Pressable className="rounded-full bg-hale-500 py-4">
            <Text className="text-center text-white font-semibold text-base">Build my quit plan</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
