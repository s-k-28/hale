import { Stack } from 'expo-router';
import { clean } from '@/theme/clean';

export default function OnboardingLayout() {
  // contentStyle pins the scene container to our near-black. Without it the
  // navigator paints React Navigation's default (WHITE) background behind every
  // onboarding screen, which strobes on each push. See the white-flash note in
  // src/app/_layout.tsx.
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: clean.bg } }}
    />
  );
}
