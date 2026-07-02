# HALE — Native Swift/SwiftUI Migration Plan

**Status:** Approved plan, ready for execution.
**Author:** Claude Fable 5 (planning pass, July 2026). **Executor:** Claude Opus, phase by phase.
**Goal:** Rewrite the HALE iOS client as a native SwiftUI app at full feature/visual parity with the current Expo/React Native app, **keeping the Convex backend 100% unchanged**.

---

## 0. Instructions for the executing agent (read first)

1. Work **phase by phase, in order**. Each phase has an exit gate — do not start the next phase until the gate passes. Phase 0 is a go/no-go spike.
2. The RN app must keep building throughout. **Do not modify** `src/`, `ios/`, `app.json`, `package.json`, or anything under `convex/` (exception: Phase 0 fallback, which is explicitly scoped). The Swift app lives in a new top-level directory: **`apple/`**.
3. If you touch anything in `convex/`, read `convex/_generated/ai/guidelines.md` first (project rule from CLAUDE.md).
4. The backend contract is the source of truth. When this document names a Convex function, **read its validator in `convex/*.ts` to derive the exact arg/return shape** before writing the Swift mirror type. Do not guess shapes from this doc.
5. Pin dependency versions (SPM exact versions). `ConvexMobile` is pre-1.0 and has shipped breaking changes (0.8.0 broke the `AuthProvider` protocol) — pin to **0.8.1** (or latest at execution time after reading its release notes).
6. Visual fidelity bar: screenshots of RN vs Swift screens should be near-indistinguishable. The design system is small and token-driven — build tokens first, never hardcode colors/sizes in screens.
7. Verify on device/simulator per screen as you go (the flows are described in §7). Dev builds should point at a **dev Convex deployment**, never prod (`npx convex dev` deployment; prod is `agreeable-mongoose-741`).
8. Note: a subagent hit `ENOSPC` on this machine's temp volume — check free disk before Xcode builds.

---

## 1. What the app is (context)

HALE is a quit-vaping/nicotine app: onboarding quiz → personalized quit plan → daily check-in streak with money-saved math and health milestones, craving SOS tools, an AI coach ("Sage"), 1:1 buddy pairing + squads + referral loop, and a HALE+ subscription (RevenueCat). Dark-mode only, Sora font, emerald-accent design system ("Clean Dark v2"). ~25 screens, 5 tabs (community tab flag-gated OFF in v1), 2 full-screen modals. Shipped to ASC as build 9, bundle `com.ravipulavarthy.hale`, ASC app id `6781942293`.

**Backend:** Convex (prod deployment `agreeable-mongoose-741`). All AI (Groq chat completions, Gemini RAG embeddings, Anthropic moderation) runs **server-side in Convex actions** — the client never holds AI keys and never streams tokens; Sage replies arrive as new rows on a live query. Push (OneSignal REST), emails (Resend), and the RevenueCat entitlement webhook are also server-side. **None of this needs to change.**

---

## 2. Key architectural decisions (settled — do not relitigate)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **SwiftUI-first, no UIKit screens** (UIKit only where required: activity sheet, haptic generators, emitter layers if chosen) | App is a token-driven design system with spring animations — maps 1:1 to SwiftUI |
| D2 | **iOS 17.0 minimum**, `@Observable` macro, Swift 5.10+, strict concurrency where practical | Modern observation + `ImageRenderer`, `.sensoryFeedback`, Canvas/TimelineView all comfortably available |
| D3 | **Convex via official `ConvexMobile` SDK** (`get-convex/convex-swift`, pin 0.8.1) | Official, actively maintained; supports live subscriptions (Combine publisher), mutations, actions. Pre-1.0 — pin it |
| D4 | **Keep `@convex-dev/auth` on the server; implement a Swift `AuthProvider` that calls the existing public `auth:signIn` action** | `convex/auth.ts` exports `signIn`/`signOut` as public Convex actions. The only provider is **Anonymous** — no OAuth/password to port. Calling `auth:signIn {provider:"anonymous"}` returns JWT + refresh token; refresh by calling it again with `{refreshToken}`. Zero backend change. Fallback if the spike fails: custom JWT provider (§5, Phase 0B) |
| D5 | **Native SDKs:** RevenueCat `purchases-ios`, OneSignal iOS SDK (keep existing NSE target), PostHog `posthog-ios`, Sentry `sentry-cocoa` | All four have first-class iOS SDKs; server-side halves (webhook, push REST) already work |
| D6 | **Port the shared pure-TS model logic to Swift with golden-fixture tests** | The RN client imports `convex/model/{plan,streak,cohort,entitlement}` for client-side math (savings projections, milestone dates, local-date streak logic). Numbers must match exactly — generate JSON fixtures from the TS and assert Swift parity |
| D7 | **Same app record**: bundle id `com.ravipulavarthy.hale`, version bump (e.g. 2.0), buildNumber continues past 9. Ship as an update, not a new app | Keeps ratings, ASC id, RevenueCat app config, OneSignal app id, APNs |
| D8 | Feature flags preserved: community tab OFF, public squad discovery OFF (Swift build settings / a `FeatureFlags` struct) | Parity with v1 App Store build |
| D9 | Drop entirely: expo-updates (OTA JS — meaningless native), NativeWind/Tailwind, Reanimated/Skia/Rive/Lottie deps (Rive/Lottie were never used), `@rn-primitives/*`, expo-blur/glass (unused in source) | Native equivalents or dead weight |

**Auth alternatives considered and rejected:** Clerk (official convex-swift integration exists but Clerk has no anonymous-user mode — would force a sign-in gate, a product change); Auth0 (same problem + migration); Better Auth (has an anonymous plugin but requires replacing the server auth component + DIY Swift glue). D4 avoids all of that. If the product later adds "save your progress" (email/Apple linking), revisit — Convex Auth supports adding providers server-side, and the same Swift `AuthProvider` pattern extends to them.

---

## 3. Repo layout

```
apple/
  Hale.xcodeproj                (or XcodeGen project.yml — executor's choice, but commit whatever regenerates it)
  Hale/
    App/                        HaleApp.swift, RootRouter.swift, AppDelegate (OneSignal), Environment config
    DesignSystem/               Tokens.swift, Typography.swift, Components/ (Button, Card, Chip, …)
    Convex/                     ConvexService.swift, AuthProvider.swift, FunctionNames.swift, DTOs/
    Model/                      Ported pure logic: Plan.swift, Streak.swift, Cohort.swift, Entitlement.swift
    Services/                   PurchasesService, PushService, AnalyticsService, SentrySetup, HapticsService, Storage
    Features/                   One folder per screen group (Onboarding/, Today/, Squad/, Coach/, You/, SOS/, Paywall/, Referral/, Goals/, Insights/, Toolkit/, Squads/, Leagues/, Community/, Settings/)
    Resources/                  Sora fonts (7 weights), Assets.xcassets (icon, splash colors), PrivacyInfo.xcprivacy
  HaleTests/                    Model golden-fixture tests, DTO decode tests
  OneSignalNotificationServiceExtension/   (ported from ios/OneSignalNotificationServiceExtension)
scripts/gen-model-fixtures.ts   (new; small node script that dumps TS model outputs as JSON fixtures)
docs/SWIFT_MIGRATION_PLAN.md    (this file)
```

Fonts: download Sora static TTFs (300/400/500/600/700/800) — the RN app loads them via `@expo-google-fonts/sora`; the native app bundles them + `UIAppFonts` in Info.plist.

---

## 4. Design system port (tokens → SwiftUI)

Source of truth: `src/theme/tokens.js` (+ typed mirror `src/theme/clean.ts`, wiring in `tailwind.config.js`). Dark-only. Port verbatim into `Tokens.swift` as `enum T { static let bg = Color(hex: 0x0B0F0D) … }`.

**Colors** (full set in tokens.js — key ones): `bg #0B0F0D`, `bg2 #0E1311`, `surface #151B18`, `surface2 #1C2420`, `surface3 #25302A`, `stroke white@7%`, `stroke2 white@13%`, `fg #EAF1EC`, `fg2 #97A39B`, `fg3 #616B64`, `fg4 #424A45`, accent lane `#34D399` / `#5EE3B0` / `#1FA577` / ink `#052B1E` / soft 12% / edge 26% / glow 35%, warm lane `#F2B95C` (+soft/edge/ink), coral lane `#FF6B5C` (+soft/edge/ink), `track white@8%`. **Palette discipline (enforce in review): one emerald accent per screen; coral = SOS/danger only; warm amber = buddy/together/referral only.**

**Type ramp** → `Typography.swift` view modifiers / `Font` statics (Sora only):
`hero` 88/92/−2.6 · `h1` 30/36/−0.75 · `h2` 23/28/−0.46 · `h3` 18/23/−0.18 · `lead` 16/25 · `body` 15/23 · `eyebrow` 12/16/+1.56 uppercase. Components also use display numerals (56, 132, 54 pt) — keep as local constants where the RN code does.

**Spacing/radii:** 4-pt grid; screen gutter **24**; radii `pill 999`, `panel 22`, `tile 16`, `inset 9`, `xl2 26`, default card inner 12 (RN `rounded-xl`).

**Component map** (RN `src/ui/*` → SwiftUI, same names where sensible):

| RN component | SwiftUI port notes |
|---|---|
| `Text.tsx` ramp (Hero/H1/H2/H3/Lead/Body/Eyebrow/Muted/Display) | `Text` extensions/modifiers; drop RN baseline hacks — native text metrics fix them |
| `Button.tsx` | 56pt (sm 46, ghost 50), r16, Sora-bold; variants primary/secondary/ghost/coral/warm; press scale 0.98 spring (damping 20, stiffness 400 → `.spring(response/dampingFraction` equivalent); emerald glow = `.shadow(color: accent.opacity(0.35), radius: 15)`; per-variant haptics; distinct disabled vs loading |
| `Card/Card2/CardHero/CardInk` | `RoundedRectangle` fills + hairline `.strokeBorder`; CardHero uses accentEdge ring |
| `Tile`, `Chip` (44pt pill, selected = solid accent + ink text), `Badge`, `IconBtn` (44pt circle) | direct ports; press scales 0.94–0.96 |
| `OptRow` | quiz select row: icon chip, label+sub, custom radio; selected = accentSoft fill + accent ring |
| `Input` / `UnderlineInput` | native `TextField` (placeholder overlay hack unnecessary); UnderlineInput = 56pt bold numeral over 2px underline, accent when filled, `$`/unit affixes |
| `Track` | 8pt capsule progress, 600ms `.timingCurve(0.22, 1, 0.36, 1)` width animation |
| `Steps` | segmented quiz progress (done accentDeep / current 32pt accent / upcoming track) |
| `Screen/ScreenHead/ScreenBody/CtaDock` | screen scaffold; CtaDock = bottom-pinned dock with 22pt gradient fade cap (LinearGradient) |
| `Ring.tsx` (SVG progress ring) | `Circle().trim()` + `AngularGradient`(accentDeep→accent2) + emerald shadow; progress spring (damping 18, stiffness 80); `surge` = brightness/scale pop sequence |
| `SageNote` | typography-only coach voice block |
| `LockedFeature` | premium gate — in SwiftUI use real `RadialGradient`/`.blur()` instead of RN's stacked-disc fake glow; near-opaque scrim + lock badge; taps route to paywall |
| `motion.tsx` `RiseIn` | reusable entrance modifier: opacity 0→1 + y 12→0 spring, 40ms×index stagger |
| `PostCard/Composer/CrisisCard/CommunityRulesGate/GroupEmptyState` | community set (Phase 4b, flag off) — AnonAvatar = deterministic HSL hue from seed + initial |
| `ReferralCard`, `InviteCodeEntry` | warm-lane referral surfaces; InviteCodeEntry = idle/checking/applied/notfound/error state machine |
| `TransformationCard` | share card: 3 stacked LinearGradients, 132pt day numeral, money stat, recovery bar; export via **`ImageRenderer`** + share sheet (replaces view-shot + expo-sharing) |
| `MilestoneCelebration`, `RingBurst`, SOS `CoralGlow` | see §8 animations |

Icons: RN uses `lucide-react-native` (Heart, MessageCircle, Gift, Send, ShieldCheck, House, Users, User, HeartHandshake, …). Options: SF Symbols nearest-equivalents (fine for chrome) **or** bundle Lucide SVGs as template PDF assets for exact parity. Default: SF Symbols where visually equivalent, Lucide assets where the mark is distinctive (heart-handshake, gift).

Haptics: port `src/lib/haptics.ts` semantics (`tap`, `select`, `press`, `celebrate`, `breath(in/out)`) to a `HapticsService` over `UIImpactFeedbackGenerator`/`UINotificationFeedbackGenerator`/CoreHaptics; respect the `hale:hapticsEnabled` toggle (→ `UserDefaults`).

Toasts: `sonner-native` → small custom toast overlay (top-inserted, auto-dismiss 2.5s, swipe-to-dismiss). Keep API `Toast.success/error(_:)`.

---

## 5. Convex data layer

### 5.1 Client

- Global `ConvexService` wrapping `ConvexClientWithAuth(deploymentUrl: Env.convexURL, authProvider: HaleAuthProvider())`.
- Subscriptions: `client.subscribe(to:with:yielding:)` → Combine publisher → expose as `AsyncSequence` (`.values`) consumed in `.task {}` per screen, or as `@Observable` stores for cross-screen state (`todayState`, `myBuddy`).
- Function names are strings `"module:function"` (e.g. `"users:todayState"`). Centralize every name in `FunctionNames.swift` — no string literals at call sites.
- Type mapping gotchas (docs.convex.dev/client/swift/data-types): Convex numbers are float64 — Swift `Int` fields need `@ConvexInt` (and `@OptionalConvexInt`) property wrappers, `Double` uses `@ConvexFloat`; wrapped properties must be `var`. Decode failures **throw** (0.8.0+) — surface, don't swallow.
- No codegen: DTOs are hand-written `Decodable` structs. **Derive each from the validators/return shape in the convex source file**, and add a decode unit test per DTO using captured JSON (run the function once via `npx convex run` on the dev deployment to capture real payloads).

### 5.2 Auth (`HaleAuthProvider`) — the Phase 0 spike

Mechanism (mirrors what `@convex-dev/auth/react`'s `ConvexAuthProvider` does internally):

1. **Sign in:** call the public action `"auth:signIn"` with `{provider: "anonymous"}` (unauthenticated call). Response contains `tokens: {token, refreshToken}` — read the exact response shape from `node_modules/@convex-dev/auth/src` (client half) before coding.
2. Store both tokens in **Keychain**.
3. `AuthProvider.login(onIdToken:)` → perform (1) if no cached tokens, else validate/refresh; push the JWT through `onIdToken`. `loginFromCache` (also called on WS reconnect) → return cached JWT, refreshing if near expiry.
4. **Refresh:** call `"auth:signIn"` with `{refreshToken}` → new token pair. Convex Auth rotates refresh tokens — always persist the new pair atomically.
5. **Sign out:** `"auth:signOut"` action + wipe Keychain (used by delete-account flow).
6. Timing note: after the very first sign-in, `users:todayState` is null until `completeOnboarding` runs — same as RN (`waitForAuth` then commit). Replicate that sequencing in the quiz commit step.

**Exit gate for Phase 0:** a scratch SwiftUI app on a **dev deployment** that (a) signs in anonymously, (b) subscribes to `users:todayState` live, (c) calls `users:completeOnboarding` and sees the subscription update reactively, (d) survives token refresh (shorten JWT lifetime on dev to force it) and app relaunch (cached session), (e) reconnects after airplane-mode toggle.

**Phase 0B fallback (only if the spike fails):** add a custom-JWT auth path server-side — Convex HTTP action `/auth/anon` that creates the user + mints an RS256 JWT, JWKS served from another HTTP route, registered in `convex/auth.config.ts` as a second provider (Custom JWT, docs.convex.dev/auth/advanced/custom-jwt). This is additive (RN app untouched) but requires backend work — read `convex/_generated/ai/guidelines.md` first.

**Existing-user continuity (spike, best-effort):** current users' Convex Auth tokens live in iOS Keychain via `expo-secure-store` (see `src/app/_layout.tsx` `secureStorage`). Same bundle id + team ⇒ same default keychain access group, so the native app can likely read them: check `node_modules/expo-secure-store/ios` for the exact `kSecAttrService`/account conventions and `node_modules/@convex-dev/auth` for the storage key names (JWT + refresh token keys are namespaced by deployment URL). If readable → migrate the session silently and **existing users keep their streaks**. If not readable, decide with the user before shipping: accept identity reset for updaters (bad — streak loss) or add a small server-side device-migration route. **Treat "updaters keep their data" as a launch requirement unless the user explicitly waives it.**

### 5.3 Convex function surface to mirror (~50 functions; shapes from source)

- `users`: `todayState` (the backbone live query — streak, money, milestone, premium/trial/referral entitlement, timezone, userId, hardestHour), `completeOnboarding`, `linkOneSignal`, `aiConsentStatus`/`setAiConsent`/`revokeAiConsent`, `communityRulesStatus`/`acceptCommunityRules`
- `checkins.checkIn` · `cravings.logCraving`/`recent` · `relapse.logRelapse`/`noteRelapseTrigger`
- `buddies`: `myBuddy`, `pairWith`, `unpair`, `requestMatch`, `invite`
- `referrals`: `getOrCreateMyCode`, `resolveCode`, `attributeInstall`, `myProgress`
- `nudges`: `myNudges`, `markRead`, `cheer`, `send` · `feed`: `buddyFeed`, `sendStrength`
- `sage`: `messages` (live transcript), `send` (returns accepted/capType)
- `goals`: `myGoals`, `setGoal`, `deleteGoal` · `leagues`: `myLeague`, `optIn`, `leaveLeague`
- `squads`: `mySquads`, `squadDetail`, `publicSquads`, `createSquad`, `joinByCode`, `leaveSquad`
- `analytics`: `cravingTrend`, `cravingPatterns`, `recoverySummary`
- `community`: `groups`, `resolveGroup`, `joinGroup`, `myProfiles` (Phase 4b)
- `communityPosts`: `feed` (paginated — implement Convex pagination cursor handling), `createPost`, `createComment`, `comments`, `toggleReaction`, `myCrisisAlerts`, `ackCrisisCard` (Phase 4b)
- `communityModeration`: `reportContent`, `muteProfile`, `unmuteProfile`, `myMutes`
- `account.deleteAccount` · auth actions `auth:signIn`, `auth:signOut`

**Live vs one-shot:** every `useQuery` in RN is a live subscription — preserve that. Critical live ones: `todayState` (entry gate, Today, premium hook, push-tag sync), `sage:messages` (chat reply arrives as a new row — show typing indicator while last row is the user's), `buddies:myBuddy`, `nudges:myNudges`, `communityPosts:feed`. All writes are plain async mutations.

### 5.4 Ported pure model logic (D6)

Port from `convex/model/`: `plan.ts` (`projectedAnnualSavings`, `moneySaved`, `HEALTH_MILESTONES`, `LANDMARK_DAYS`, `recoveryFraction`, `reachedHealthMilestones`, `QuitProfile`), `streak.ts` (`localDateOf` — timezone-aware local date), `cohort.ts` (`quitStage`), `entitlement.ts` (`REFERRAL_REWARD_DAYS`). Write `scripts/gen-model-fixtures.ts` to evaluate the TS functions over a grid of inputs (product types, rates, timezones incl. DST edges, day counts) → JSON fixtures → Swift XCTests assert exact equality. **Gate: fixtures pass before any screen that shows money/streak numbers.**

---

## 6. Native services

| Service | Port |
|---|---|
| **RevenueCat** (`purchases-ios`, SPM) | `Purchases.configure(apiKey: Env.revenueCatKey)`; `logIn(convexUserId)` after auth (join key for the existing webhook mirror — `convex/http.ts` `/revenuecat/webhook` keeps working untouched); entitlement **`HALE+`**; **custom paywall UI** (not RC's) — load `offerings.current`, `annual`/`monthly` packages, `purchase(package:)`, `restorePurchases()` (App Review requirement); `logOut()` on account deletion. Premium truth = `usePremium` logic ported: RC entitlement **OR** `todayState.premium` mirror **OR** `todayState` referral-reward-active — recheck RC on scene-foreground/screen-appear |
| **OneSignal** (iOS SDK) | `initialize(appId)`; `login(externalId: convexUserId)` then `users:linkOneSignal` mutation; tags `streak` / `has_buddy` / `hardest_hour` (dedupe on change, port `usePushTags`); click handler routes by `additionalData.kind`: `proactive`→Coach, `nudge`/`streak_at_risk`→Today, `buddy_relapse`→Squad; permission prompt **only after** the in-app explainer step in onboarding. **Keep the existing NSE target** (`com.ravipulavarthy.hale.OneSignalNotificationServiceExtension`, app group `group.com.ravipulavarthy.hale.onesignal`) — port `ios/OneSignalNotificationServiceExtension/NotificationService.swift` as-is |
| **PostHog** (`posthog-ios`) | Port `src/lib/analytics.ts` **verbatim**: the ~70-event `Ev` taxonomy (string-identical event names — analytics continuity), `identify(convexUserId)`, cohort snapshot props (`paired_solo_status`, `tier`, `quit_stage`, `timezone`) merged into every capture, `disableGeoip`, autocapture off, opt-out flag `hale_analytics_opt_out` (→ UserDefaults) honored at init and toggleable in You/settings |
| **Sentry** (`sentry-cocoa`) | `tracesSampleRate 0.2`, `sendDefaultPii false`, and **port the privacy scrubbers** from `src/lib/sentry.ts` (drop network/console breadcrumbs, strip request bodies/headers) — health data and Sage chat must never reach crash payloads |
| **Storage** | SecureStore → **Keychain** (auth tokens only). AsyncStorage → **UserDefaults**, same keys: `hale:ageConfirmed21`, `hale:disclaimerAck`, `hale:hapticsEnabled`, `hale_analytics_opt_out`, `hale:pendingBuddyId`, `hale:lastCelebratedLandmark`, `hale:firstSage`, `hale:firstSos`. Delete-account clears all + Keychain |
| **Deep links** | URL schemes `hale` + `com.ravipulavarthy.hale` via `.onOpenURL`: `hale://r/<code>` → resolve → `/u/<id>`; `hale://u/<id>` → pair or stash `pendingBuddyId` + onboarding. No universal links / AASA in v1 (deliberate — sharing is code-first; see `src/lib/links.ts`). Share sheets: text invites (`ShareLink`/`UIActivityViewController`, message text from `links.ts` `inviteShareParams`), TransformationCard PNG via `ImageRenderer` |
| **Env config** | xcconfig or a generated `Env.swift` per configuration: dev vs prod `CONVEX_URL`, RevenueCat key, OneSignal app id, PostHog key/host, Sentry DSN (all client-public today in `eas.json`/`.env.example`) |

---

## 7. Screens — build order, specs, gates

Navigation: replace Expo Router with a `RootRouter` observable — an enum-driven root switch (Gate → Onboarding → Tabs) + `NavigationStack` path per tab + `fullScreenCover` for SOS and Paywall (both non-swipe-dismissible with explicit close chrome). Tab bar: 5 items (community hidden by flag), haptic on switch. Read each RN file before porting — the specs below are orientation, not the contract.

**Entry gate** (`src/app/index.tsx`): spinner while auth/`todayState` load; unauthenticated OR `todayState == null` → Onboarding; else Tabs.

### Phase 4a — core loop (build in this order)

1. **Onboarding** (`(onboarding)/age, notice, welcome, quiz`): age 21+ gate (Guideline 2.18; "under 21" block screen), medical-disclaimer ack (1.4.1), welcome hero + `InviteCodeEntry` fallback. **Quiz** is the big one — phase machine `questions → building → reveal → commit → push → invitebuddy`; 7 steps (productType, perDay presets/free-entry, unitCost normalization per product, triggers multi-select + custom, hardestHour, motivation, name-optional); local state only until **commit**: anonymous sign-in → wait for auth → `completeOnboarding{timezone, productType, baselinePerDay, unitCost, triggers, hardestHour, motivation, name}` → `identifyPurchaser` → pending-buddy redemption (`attributeInstall` + `pairWith`) → paywall push; then push-permission explainer step; then invite-buddy step (invite / `requestMatch` / solo; skipped if already paired). Port the full analytics funnel events.
2. **Today** tab: live clean-time counter (client timer over `todayState.quitStartAt` — tick every second), progress Ring, next-health-milestone strip, money-saved + recovery tiles, one-tap `checkIn` (fires Ring surge + RingBurst), SOS card, buddy row, nudge inbox (`myNudges`/`markRead`), milestone celebration overlay once per landmark (`hale:lastCelebratedLandmark` dedupe).
3. **SOS** modal: state machine `home → ride(5-min countdown ring) | breathe(4-4-4-4 box breathing + breath haptics) | log(intensity 1–5 + trigger + context → logCraving) | slip-choose(lapse vs relapse → logRelapse) → recover(kind screen: lifetime stats, noteRelapseTrigger, "Reflect with Sage")`; 988 crisis link; CoralGlow backdrop.
4. **Paywall** modal: `from` param → surface analytics; annual/monthly selector, purchase, restore, animated CTA sheen (masked moving gradient); dismiss → back or Today.
5. **Coach** tab: live `sage:messages` transcript, AI-consent gate locking composer (`aiConsentStatus`/`setAiConsent`), send → typing indicator (3 staggered bouncing dots) until sage row lands; daily-cap response → HALE+ upsell; breathing idle animation.
6. **You** tab: TransformationCard + share, lifetime stats, milestone history, HALE+ upsell, settings (haptics toggle, analytics consent, AI consent revoke, blocked members via `myMutes`/`unmuteProfile`, links to goals/insights/disclaimers, privacy/terms in `SFSafariViewController`, support mailto, delete account).
7. **Squad** tab: solo state (invite CTA → code + share) vs paired state (shared streak, cheer, unpair) + `ReferralCard`; links to Squads and Leagues.

**Phase 4a gate:** full loop on dev deployment — onboard → check in → SOS log → Sage reply arrives live → purchase in sandbox flips `usePremium` → share card exports.

### Phase 4b — secondary + growth

8. **Referral** (`referral/index, share, reward`): hub with `myProgress`, dedicated share screen (6-char code), 7-day reward celebration.
9. **Deep-link routes** `r/[code]`, `u/[id]` with all error states (caller_paired / inviter_paired / generic).
10. **Goals** (create with quick-picks, progress bars, delete), **Insights/analytics** (bar + line charts — SwiftUI `Canvas` or Swift Charts styled to tokens; data fetched for everyone, blurred behind `LockedFeature` for free), **Toolkit** (urge-surf 4-step machine, trigger insight, 24h heatmap; premium-gated), **Leagues** (opt-in → leaderboard), **Squads** (create/join by code, 6-week challenge progress, 1-squad free limit with `LockedFeature`, public discovery behind flag), **Disclaimers** (static, 1.4.1), **Delete account** (arm→confirm; cascade + external detach + local wipe + sign-out; 5.1.1(v)).
11. **Community** (flag OFF, still implement or explicitly defer with user sign-off): rules gate, group browse + pseudonyms, FlashList feed → `LazyVStack`/`List` with Convex pagination, PostCard (react/report/mute), Composer (optimistic pending row, 500-char counter), crisis card pinning.

---

## 8. Animations & effects (the only genuinely custom work)

| Effect | RN implementation | Swift approach |
|---|---|---|
| RiseIn entrances | Reanimated spring, 40ms stagger | shared modifier, `.spring` + per-index delay |
| Ring progress + surge | SVG + Reanimated springs | `Circle().trim` + spring; surge = `withAnimation` sequence (scale/brightness pop) |
| **RingBurst** (check-in) | Skia, 20 particles, easeOutCubic 820ms, deterministic per-index physics | **`Canvas` + `TimelineView(.animation)`**, same deterministic math (port the per-index formulas from `RingBurst.tsx`), retrigger by identity/key on surge counter |
| **MilestoneCelebration** | Skia, 60 flakes/sparks, gravity burst, single-picture-per-frame | same Canvas/TimelineView pattern; celebration haptic |
| SOS CoralGlow | Skia radial gradient breathing 2.6s | `RadialGradient` + `.blur` + repeatForever scale/opacity |
| Box breathing | expanding circle synced 4-4-4-4 + breath haptics | phase-driven `withAnimation` + CoreHaptics |
| Paywall CTA sheen | translateX loop over gradient band | masked moving `LinearGradient`, repeat with pause |
| Typing indicator | 3 dots translateY stagger loop | trivial |
| Button/Chip presses | scale springs | `.scaleEffect` on pressed state |

Match the exact curves where specified: `(0.22, 1, 0.36, 1)` bezier (Track), spring params noted in §4. Test particle effects on a real device for frame pacing.

---

## 9. iOS project config parity

- Bundle `com.ravipulavarthy.hale`; version 2.0; buildNumber > 9 (check ASC for latest). Portrait only, `UIUserInterfaceStyle Dark`, bg `#0B0F0D`, no iPad.
- Entitlements: `aps-environment production`, app group `group.com.ravipulavarthy.hale.onesignal`. No associated domains, no Sign in with Apple (not used).
- Info.plist: URL schemes `hale` + bundle id; `UIBackgroundModes remote-notification`; `ITSAppUsesNonExemptEncryption false`; drop `NSFaceIDUsageDescription` (was for expo-secure-store; plain Keychain doesn't need it — **but keep it if the keychain-continuity migration reads biometric-protected items**).
- **PrivacyInfo.xcprivacy**: port from `app.json` `privacyManifests` — tracking false; API reasons FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1; collected types Health, OtherUserContent, UserID, DeviceID, ProductInteraction, PurchaseHistory, CrashData (all linked, none tracking). Also include SDK-required manifest entries (RevenueCat/OneSignal/PostHog/Sentry ship their own).
- Splash: static dark screen with the 120pt splash icon (from `assets/images/splash-icon.png`), matching current.
- Distribution: EAS is gone for the native app — set up **Xcode Cloud or fastlane** (executor: propose in Phase 6; fastlane gym+pilot is the default).

---

## 10. Phase summary, gates, rough effort

| Phase | Deliverable | Exit gate | Rough size |
|---|---|---|---|
| **0** | Auth + client spike (scratch target, dev deployment) + keychain-continuity spike | §5.2 gate all green; continuity verdict documented | 1–2 sessions |
| **1** | Project scaffold, tokens, typography, all §4 components in a debug gallery screen | Gallery screenshot review vs RN | 1–2 |
| **2** | ConvexService, AuthProvider, all DTOs + FunctionNames, model port + fixtures | DTO decode tests + fixture tests pass | 2–3 |
| **3** | Services (RC, OneSignal+NSE, PostHog, Sentry, storage, deep links, env) | sandbox purchase flips entitlement; test push routes correctly; events land in PostHog dev | 1–2 |
| **4a** | Core screens 1–7 | full-loop gate (§7) | 3–5 |
| **4b** | Screens 8–11 | per-screen manual QA vs RN side-by-side | 2–4 |
| **5** | Animations/effects polish, share card, milestone celebration | device-recorded comparisons | 1–2 |
| **6** | Compliance sweep + release: privacy manifest, App Review parity checklist (age gate, disclaimers, restore purchases, delete account, AI consent, community rules, 988 link), TestFlight, staged rollout | TestFlight build approved internally; submission checklist done | 1–2 |

Ship as a phased App Store rollout; keep the RN codebase on `main` untouched until the native build is stable in production, then archive it.

## 11. Top risks

1. **ConvexMobile pre-1.0 / undocumented Convex Auth wire protocol** — mitigated by Phase 0 spike + pinning + reading `@convex-dev/auth` client source; fallback 0B defined.
2. **Updater identity loss (anonymous accounts)** — the keychain-continuity spike is a launch requirement; escalate to the user immediately if it fails.
3. **Hand-maintained DTO drift** vs backend evolution — mitigate with decode tests fed by `npx convex run` captures; document that backend changes must update `apple/` mirrors.
4. **Number parity** (money/streak math) — golden fixtures (D6) are non-negotiable before Phase 4a.
5. **Convex pagination + optimistic UX** (community feed, composer pending rows) — RN got optimistic updates from the React client; Swift needs hand-rolled optimistic state. Scoped to Phase 4b and flag-gated.
