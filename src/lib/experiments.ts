import { useFeatureFlag } from 'posthog-react-native';
import { posthog } from './analytics';

/**
 * True only when a PostHog client exists — and therefore only when
 * <PostHogProvider> is actually mounted (src/app/_layout.tsx mounts it
 * conditionally: `posthog ? <PostHogProvider…> : tree`).
 *
 * This is a MODULE constant: the client is created once at import time and can
 * never change at runtime, so branching on it below cannot change hook order
 * between renders.
 */
const HAS_POSTHOG = posthog != null;

/**
 * Experiments — a thin, type-safe wrapper over PostHog feature flags.
 *
 * PostHog's `useFeatureFlag(key)` returns `string | boolean | undefined`:
 *   • boolean        → a simple on/off flag
 *   • string         → the variant key of a multivariate A/B test
 *   • undefined      → flags not loaded yet, OR PostHog is unconfigured
 *                      (scaffold mode — the provider isn't mounted, so every
 *                      flag is undefined and we fall back to the default).
 *
 * `useFlag(key, defaultValue)` resolves that into a single, stable value of the
 * same type as `defaultValue`, so callers can branch without null-checks. Must
 * be called from within the <PostHogProvider> tree (the whole app, see
 * src/app/_layout.tsx) — which it always is for screens.
 *
 * The flag KEYS for the PRD A/Bs live here as the single source of truth so
 * analysis (PostHog) and code never drift on string literals.
 */

/** PRD A/B test flag keys. Keep in sync with the PostHog feature-flag config. */
export const Flag = {
  /** Onboarding commitment-step copy variant (e.g. 'control' | 'streak_pledge'). */
  ONBOARDING_COMMIT_COPY: 'onboarding_commit_copy',
  /** Paywall posture / aggressiveness (e.g. 'soft' | 'hard'). */
  PAYWALL_POSTURE: 'paywall_posture',
  /** Onboarding quiz length (e.g. 'short' | 'long'). */
  QUIZ_LENGTH: 'quiz_length',
} as const;

export type FlagKey = (typeof Flag)[keyof typeof Flag];

/**
 * Read a feature flag with a typed fallback.
 *
 * Returns `defaultValue` until the flag resolves (or forever, in scaffold mode),
 * otherwise the live flag value coerced to the default's type:
 *   • boolean default → the flag's boolean state.
 *   • string  default → the matched variant key.
 *
 * @example
 *   const posture = useFlag(Flag.PAYWALL_POSTURE, 'soft'); // 'soft' | 'hard'
 *   const longQuiz = useFlag(Flag.QUIZ_LENGTH, false);     // boolean
 */
export function useFlag<T extends string | boolean>(key: string, defaultValue: T): T {
  // useFeatureFlag ERRORS loudly ("called without a PostHog client") whenever no
  // <PostHogProvider> is mounted, which is exactly the case when PostHog is
  // unconfigured — dev/scaffold builds, and production if the key is ever missing.
  // Every screen that read a flag would log an error on mount. HAS_POSTHOG is a
  // module constant, so this branch is fixed for the life of the process and hook
  // order is stable; the rules-of-hooks disable below is safe and deliberate.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const value = HAS_POSTHOG ? useFeatureFlag(key) : undefined;
  if (value === undefined) return defaultValue;
  // Coerce to the shape the caller asked for so the return type stays `T`.
  if (typeof defaultValue === 'boolean') {
    return (value === true || value === 'true') as T;
  }
  return String(value) as T;
}
