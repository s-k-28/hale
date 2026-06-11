# HALE Conventions — shared source of truth (namespace: hale-conventions)

Every agent working on the community feature MUST follow these. Read this file fully before writing code.

## Stack
- Expo SDK 56 (`expo ~56.0.8`), React Native 0.85, expo-router ~56 (file-based routing under `src/app/`).
  **Expo APIs changed in v56** — if unsure about an Expo API, consult https://docs.expo.dev/versions/v56.0.0/ before writing code.
- Convex 1.39 + `@convex-dev/auth` (anonymous auth). Functions live in `convex/*.ts`; pure helpers in `convex/model/*.ts`.
- TypeScript strict. Path aliases: `@/*` → `src/*`, `@convex/*` → `convex/*`.
- Jest via `jest-expo`; tests in `__tests__/*.test.ts` and they test PURE functions exported from `convex/model/*` (see `__tests__/plan.test.ts` for style).
- Reanimated 4.3 (`react-native-reanimated`), FlashList 2 (`@shopify/flash-list`), lucide-react-native icons, sonner-native toasts.

## UI idiom (IMPORTANT — match this, do not invent)
Despite `tamagui.config.ts` existing, **screens are built with NativeWind classNames + shared UI components**, not raw Tamagui. Match `src/app/(tabs)/today.tsx` and `src/components/ui/*`:
- Wrap screens in `Screen` from `@/components/ui/Screen` (dark `bg-void` SafeAreaView).
- Typography: `Display`, `Heading`, `Body`, `Label` from `@/components/ui/Text`.
- `Button` from `@/components/ui/Button` (variants: primary | ghost | surface | danger).
- `Pill`, `Surface`, `StatTile` from `@/components/ui/*` where applicable.
- Colors via tailwind classes (`bg-void`, `bg-coal`, `border-line`, `text-chalk`, `text-ash`, `text-volt`, etc. — see `tailwind.config.js`) and via `colors` from `@/theme/colors` when a JS value is needed (icons, RN style props).
- Theme: dark-only "Bold Momentum". Palette: void `#0A0C0B` (bg), coal `#12161A` (cards), line `#1F2723` / hairline `#2A332D` (borders), volt `#C6FF3D` (accent, near-black `voltInk` text on volt), chalk `#F4F7F2` (text), ash `#8A938C` / ashDim `#5A625B` (muted), sos `#FF5A4D`, success `#6BE38A`.
- Motion: use `RiseIn` from `@/components/motion` for card/list entrances (pass `index` for 40ms stagger). Press feedback uses `PRESS_IN_SPRING`/`PRESS_OUT_SPRING`. No Lottie/Rive for new work; code-driven motion only. Mount-driven shared values, not `entering=` layout animations.
- Tabs: registered in `src/app/(tabs)/_layout.tsx` via `<Tabs.Screen name="..." options={{ title, tabBarIcon }} />` with lucide icons and `colors` from `@/theme/colors`.
- Toasts via `toast` from `sonner-native`. Haptics via `expo-haptics` where the app already uses them.

## Convex conventions
- Auth in every public query/mutation:
  ```ts
  import { getAuthUserId } from '@convex-dev/auth/server';
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated'); // queries may instead return [] / null
  ```
- Schema: `defineTable` with `v` validators, explicit named indexes (`.index('by_x_y', ['x','y'])`), heavy doc comments explaining intent (match existing `convex/schema.ts` voice).
- Mutations stay deterministic — **no fetch in mutations/queries**. Network calls live in an `internalAction` scheduled via `ctx.scheduler.runAfter(0, internal.file.fn, args)`. Actions use `ctx.runQuery`/`ctx.runMutation` against `internalQuery`/`internalMutation` helpers (see `convex/sage.ts` for the full pattern: mutation → schedule action → action fetches → writes via internalMutation).
- Timestamps stored as epoch ms `ts: v.number()`.

## Moderation via Claude API (the one external call)
- Raw `fetch` from a Convex `internalAction` — NO SDK, no new npm deps (mirrors the existing `convex/sage.ts` fetch-to-Groq pattern).
- Endpoint `https://api.anthropic.com/v1/messages`, headers: `x-api-key: process.env.ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Model: `claude-opus-4-8` (exact string; no date suffix). Do NOT send `temperature`/`top_p`/`top_k` or `thinking` (removed params on this model — they 400).
- Force valid JSON with structured outputs: `output_config: { format: { type: 'json_schema', schema: {...} } }` where the schema is `{ type:'object', properties:{ pii:{type:'boolean'}, crisis:{type:'boolean'}, glamorizing:{type:'boolean'}, harassment:{type:'boolean'} }, required:[all four], additionalProperties:false }`. `max_tokens: 256`.
- Parse `JSON.parse(data.content[0].text)`. If `ANTHROPIC_API_KEY` is unset or the call fails: post STAYS `pending` and the action schedules a retry (runAfter with backoff, max 3 tries); never auto-publish on failure. Log with a `[moderation]` prefix like sage logs.

## SECURITY INVARIANT (non-negotiable)
`anonProfiles` maps `userId → (groupId, handle, avatarSeed)`. That mapping is SERVER-ONLY.
- **No public (client-facing) query/mutation return value may ever include `userId`** (or any `Id<'users'>`) on community content — posts, comments, reactions, reports, profiles of OTHER users.
- Shape every return explicitly (pick fields); never return raw docs from `communityPosts`/`communityComments`/`anonProfiles` tables — raw docs carry `userId`/foreign keys.
- The only allowed self-reference is a boolean like `isMine` / `isAuthor`, computed server-side.
- Coarse timestamps only: the server returns a precomputed coarse label (e.g. "2h ago") or a bucketed ts — never expose exact `_creationTime`/`ts` to other users' clients.

## Product constraints (enforced server-side, mirrored in UI)
- 5 seeded groups ONLY (Day One Club, Cravings Right Now, Milestones, Vaping & Zyn, Relapse & Restart) + a global feed. No user-created groups, no DMs, no images. Text only, 500 chars max (validate server-side AND in composer).
- Posts start `status: 'pending'` → moderation action sets `published` | `shadowed` (pii/glamorizing/harassment) | `published` + crisis card event (crisis).
- Shadowed posts remain visible TO THEIR AUTHOR as if published (shadow ban semantics) but excluded for everyone else.
- Rate limit: 3 posts/hour per anonProfile (server-enforced; composer shows friendly copy when hit).
- Report + mute per anonProfile. Muting hides that anonProfile's content for the muter only. No follower counts anywhere.

## Voice (copy)
Supportive, zero shame, no clinical jargon. Plain human language. Never "violation", "infraction", "flagged", "user". Think: a friend who quit before you. All user-facing community copy lives in `src/constants/communityCopy.ts` (single source).

## Build checks
- `npx tsc --noEmit` must pass from repo root.
- Only the schema agent and the final integrator run `npx convex codegen` (avoid concurrent codegen).
- New deps are FORBIDDEN unless listed and approved in `.claude/memory/hale-deps.md`.
