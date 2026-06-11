# hale-deps — dependency decisions for the community feature

Rule: NO new npm dependencies may be added unless listed here as APPROVED.

| Dependency | Status | Rationale |
|---|---|---|
| `@anthropic-ai/sdk` | REJECTED (not needed) | Moderation calls the Claude API via raw `fetch` from a Convex `internalAction`, matching the existing `convex/sage.ts` fetch pattern. Avoids `"use node"` runtime and a new dep. |
| (none else) | — | Everything required (FlashList, Reanimated, lucide, sonner-native, expo-haptics, convex, @convex-dev/auth) is already installed. |

Environment requirement (not a dep): Convex deployment env var `ANTHROPIC_API_KEY` must be set for moderation to classify; without it posts stay `pending` (fail-safe). Listed in SHIP_CHECKLIST.md.
