# HALE

**Quit nicotine. Together.**

HALE is a quit-nicotine app built around buddy accountability: you commit to a quit, pair with someone who keeps you honest, and beat cravings with tools that work in the moment. It tracks the things that make quitting feel real — clean days, money saved, your body's recovery — and pairs them with an AI cessation coach and a social layer (buddies, squads, leagues) for people who don't want to quit alone.

---

## Key Features

### Quit tracking
- **Streaks & daily check-ins** — one transactional check-in per local day advances your streak, with **2 streak freezes** that forgive a missed day. Timezone-correct streak math lives server-side (`convex/model/streak.ts`); the check-in mutation dedups by local date and updates the streak cache atomically.
- **Lapse vs. relapse, without shame** — a slip can be logged as a lapse (streak safe) or a relapse, which closes the attempt and opens a *fresh run*. Lifetime clean days and lifetime money saved are a **banked ledger that never resets** — the recovery screen leads with those, never a zero.
- **Money saved & body recovery** — savings are computed from your real usage profile (units/day × unit cost, clamped server-side against bad data) and tick up live. A 10-step health-recovery timeline runs from 20 minutes ("heart rate begins to normalize") to 1 year ("heart-disease risk roughly halved") — framed as commonly-reported effects, not medical advice.
- **Milestones & share cards** — landmark days (1, 3, 7, 14, 30, 60, 90, 180, 365) trigger a full-screen celebration with a custom Skia particle burst and a shareable proof card (huge day numeral, money saved, recovery bar) captured via `react-native-view-shot` and handed to the native share sheet. The share card is deliberately never paywalled — it's the acquisition loop.

### Social accountability
- **Buddy pairing** — the core wedge. Invite a friend by link or get matched from a pool (matched on product type, quit stage, and timezone). One active buddy at a time, enforced server-side with symmetric-safe pairing (a deterministic pair key means invite/accept can't create duplicates). Buddies see each other's streak and check-in status — never cravings or money details — and can send support nudges.
- **Squads & leagues** — small "stay clean together" groups with invite codes and optional 6-week challenges, plus opt-in leagues. Free tier includes one squad; multiple squads are a HALE+ feature, gated server-side.

### Sage — the AI cessation coach
- A chat coach with a non-negotiable rule: **Sage never shames.** Built on the production Convex pattern for LLM calls — a mutation captures the message, an action calls the model (Llama 3.3 70B via Groq's OpenAI-compatible API), a mutation persists the reply. Chat history is windowed to 12 turns to bound input tokens.
- **Evidence-grounded via RAG** — a curated cessation corpus (23 sources, 224 chunks, allowlisted to 8 authoritative domains like CDC/NIH/WHO/Mayo) indexed with the Convex RAG component and Google `gemini-embedding-001` embeddings. Dosing/clinical chunks are stored as reference-only and filtered out of retrieval so Sage can never repeat them.
- **Safety routing** — crisis-flagged messages skip RAG and route to the 988 Suicide & Crisis Lifeline; medical questions route to a clinician/quitline. No API key or any API failure degrades to a warm fallback reply — the chat never errors at the user.
- **Cost-controlled** — per-tier daily caps (free 5 / trial 15 / paid 50 messages) enforced server-side *before* any compute, and every reply is stamped with token counts and a cost proxy rolled into a per-user month-to-date ledger.

### Craving SOS
A crisis toolkit one tap from the Today screen:
- **Ride it out** — a 5-minute countdown with reassurance copy that changes as the craving peaks and fades.
- **Breathe** — box breathing (4-4-4-4) with an animated guide.
- **Talk to Sage** — hands off to the coach.
- **Craving log** — after surviving, capture intensity (1–5), trigger, and context; fully skippable, feeds trigger-pattern analytics.
- **"I slipped"** — the lapse/relapse flow above, with a double-tap guard so a relapse is never committed twice.
- **Advanced toolkit** (HALE+) — urge-surfing, trigger insights, and a craving heatmap.

### Referral system
Invite friends, earn HALE+: every user has a referral code and an `https://…/r/<code>` universal link. A referral **attributes** when the invited friend installs via the link (or types the code at onboarding — the deferred-attribution fallback) and **completes** when that friend pairs up as someone's buddy. Install alone never counts. **3 completed referrals grant a one-time 7-day HALE+ window** — app-managed, no card, no auto-charge, granted exactly once. Completed referrals are never clawed back.

### HALE+ (premium)
$79.99/yr ($6.67/mo equivalent) with a 14-day free trial, plus an app-managed 14-day full-access window granted at onboarding. HALE+ gates: full health analytics, the advanced craving toolkit, multiple squads, home-screen widgets, and the highest Sage message cap. Locked features render *blurred but visible* behind one reusable `LockedFeature` treatment — free users see exactly what they're missing.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| App | [Expo](https://expo.dev) SDK 56 · React Native 0.85 · React 19 · TypeScript |
| Routing | `expo-router` (file-based) · scheme `hale://` · universal links on `go.haleapp.com` |
| Styling | NativeWind 4 (Tailwind for RN) · single-source design tokens (`src/theme/tokens.js`) |
| Backend | [Convex](https://convex.dev) — reactive database, mutations/queries/actions, scheduler, crons, HTTP endpoints |
| Auth | `@convex-dev/auth` — **anonymous-first** (no email gate to start a quit) |
| Subscriptions | [RevenueCat](https://revenuecat.com) (`react-native-purchases` 10) + server webhook mirror |
| AI | Llama 3.3 70B on Groq (Sage) · Convex RAG component + Google `gemini-embedding-001` (knowledge) |
| Analytics | PostHog (`posthog-react-native`) — typed event catalog in `docs/ANALYTICS_EVENTS.md` |
| Push | OneSignal (REST from Convex; external id = Convex user id; hard cap 2 pushes/user/local-day) |
| Email | Resend (lifecycle email from Convex actions) |
| Crash reporting | Sentry |
| Animation | Reanimated 4 · Skia (particles) · Lottie · Rive |
| Testing | Jest (`jest-expo`) — unit tests over the pure server model modules |

Bundle id / package: `com.haleapp.hale`.

---

## Architecture — the full cycle

**Frontend → Convex → frontend, reactively.** Screens are expo-router routes that read state with `useQuery` and write with `useMutation`. Convex queries are *live subscriptions*: when a mutation commits, every subscribed component re-renders with fresh data — there is no manual cache invalidation anywhere in the app.

**A check-in, end to end.** Tapping CHECK IN calls the `checkins.checkIn` mutation. In one ACID transaction it dedups against the user's *local* date (timezone-correct), computes the new streak through the pure model in `convex/model/streak.ts` (spending a streak freeze if a day was missed), inserts the check-in row, and updates the denormalized streak cache on the user. The mutation returns activation flags; the client mirrors them to PostHog. Every subscribed surface — the streak ring, the buddy's view of you, squad lists — updates in real time via Convex reactivity.

**Business logic lives in pure modules.** `convex/model/*` (streak, plan/money math, entitlement, trial, buddy invariants, webhook mapping) are pure TypeScript with no `ctx` — callable from queries and mutations, runnable client-side (onboarding computes your plan before an account exists), and unit-tested in `__tests__/`.

**Entitlements: one source of truth.** `resolveEntitlement` in `convex/model/entitlement.ts` is the single `hasHALEPlus` decision, OR-ing three grant paths: **paid** (RevenueCat), **trial** (app-managed 14-day window), and **referral reward** (7-day window). Every consumer reads this one function — server gates (Sage caps, squad limits), the reactive client mirror (`users.todayState`), and the `usePremium()` hook, which additionally OR's in the RevenueCat SDK's on-device entitlement so a fresh purchase unlocks instantly, before any webhook lands.

**RevenueCat + webhook mirror.** The RC SDK on device is the *runtime* source of truth for paid status (`Purchases.logIn` with the Convex user id as the app-user id). In parallel, RevenueCat posts events to a Convex HTTP endpoint (`POST /revenuecat/webhook`, shared-secret auth), which maps them through a pure, tested allowlist (`convex/model/rcWebhook.ts`) onto `users.premium` — grant on purchase/renewal, revoke on expiration or refund, transfer moves the mirror between accounts, ambiguous events deliberately ignored. The mirror exists so *server-side* gates and segmentation can see paid status; the device never waits on it.

**Deep links & referral attribution.** `hale://` scheme plus `https://go.haleapp.com` universal links map straight into expo-router routes: `/r/<code>` resolves a referral code to its owner and hands off to `/u/<id>`, the canonical buddy-invite handler. An onboarded user pairs immediately; a fresh install stashes the inviter id (`pendingBuddy`) and redeems it at onboarding commit — attribution (`referrals.attributeInstall`, set-once, self-referral blocked) then pairing (`buddies.pairWith`), whose server hook completes the referral and grants the 7-day reward when the count hits 3, exactly once. Since iOS can't carry a link through an App Store install, the share message and landing page carry the code in plain text, and a "Have an invite code?" entry at onboarding feeds the same stash — one redemption path, two doors.

**Analytics.** A typed event catalog (`src/lib/analytics.ts`, documented in `docs/ANALYTICS_EVENTS.md`) flows to PostHog from the client. Server mutations stay pure data — they *return* flags (e.g. `referralCompleted`, `rewardGranted`, activation signals) and the calling client fires the events, so no server-side analytics keys are needed. Critical funnels (activation, referral, monetization) are also written server-side to queryable Convex tables.

**Scheduled work.** Convex crons drive the retention loop: a daily streak-at-risk push sweep, an hourly "hardest hour" proactive nudge matched to each user's self-reported toughest time, and a daily trial-ending email sweep (Resend). All pushes funnel through one budget gate: at most 2 server pushes per user per local day.

---

## Project Structure

```
hale/
├── src/
│   ├── app/                  # expo-router screens (file-based routing)
│   │   ├── (onboarding)/     #   welcome → 7-question quiz → plan reveal → commit → buddy
│   │   ├── (tabs)/           #   Today · Squad · Coach (Sage) · You
│   │   ├── r/[code].tsx      #   referral deep link (code → referrer)
│   │   ├── u/[id].tsx        #   buddy-invite deep link (attribution + auto-pair)
│   │   ├── sos.tsx           #   craving SOS (ride/breathe/log/slip/recover)
│   │   ├── paywall.tsx       #   HALE+ upsell (+ analytics, goals, leagues, squads, toolkit)
│   │   └── _layout.tsx       #   providers: Convex, auth, PostHog, RevenueCat, fonts
│   ├── components/           # shared UI (LockedFeature, ReferralCard, TransformationCard,
│   │                         #   MilestoneCelebration, InviteCodeEntry, ui/ primitives)
│   ├── hooks/                # usePremium (the client hasHALEPlus mirror), push tags, …
│   ├── lib/                  # analytics, links (universal-link builders), revenuecat,
│   │                         #   pendingBuddy stash, config (env access)
│   └── theme/                # design tokens — single source for Tailwind + runtime hexes
├── convex/                   # backend: schema + functions
│   ├── schema.ts             #   users, quitAttempts, checkIns, cravings, buddyLinks,
│   │                         #   squads, referrals, matchRequests, activationEvents, …
│   ├── model/                #   PURE logic: entitlement, streak, plan, buddy, trial,
│   │                         #   rcWebhook, sage (unit-tested, no ctx)
│   ├── checkins.ts · buddies.ts · referrals.ts · squads.ts · sage.ts · relapse.ts …
│   ├── http.ts               #   RevenueCat webhook endpoint
│   ├── crons.ts              #   streak-at-risk · proactive nudge · trial reminder
│   └── rag.ts                #   Sage knowledge index (Convex RAG + Google embeddings)
├── knowledge/                # curated cessation corpus + build pipeline (RAG source)
├── web/                      # static link-domain site (AASA, assetlinks, store redirect)
├── docs/                     # analytics events contract, design specs, deliverables
└── __tests__/                # Jest unit tests (entitlement, streak/plan, buddy, webhook)
```

---

## Getting Started

### Prerequisites
- Node 18+ and npm
- Xcode (iOS simulator) and/or Android Studio
- A free [Convex](https://convex.dev) account

### Install & run

```bash
git clone https://github.com/s-k-28/hale.git
cd hale
npm install

# Start the Convex backend (first run provisions a dev deployment and
# writes EXPO_PUBLIC_CONVEX_URL / EXPO_PUBLIC_CONVEX_SITE_URL to .env.local)
npx convex dev

# In a second terminal — start the app
npm start          # Expo dev server (press i for iOS simulator, a for Android)
```

```bash
npm test           # Jest unit tests
npm run lint       # ESLint
npx tsc --noEmit   # typecheck
```

### Environment variables

Copy `.env.example` → `.env.local`. Client keys (bundled into the app, all optional — the app degrades gracefully in scaffold mode when keys are absent):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_CONVEX_URL` / `EXPO_PUBLIC_CONVEX_SITE_URL` | Convex deployment (written by `npx convex dev`) |
| `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` | PostHog analytics |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat public SDK keys |
| `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT` | Entitlement identifier (default `HALE+`) |
| `EXPO_PUBLIC_ONESIGNAL_APP_ID` | OneSignal app id |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry crash reporting |

Server-only keys live in the **Convex deployment env** (`npx convex env set NAME value`), never in the client bundle:

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | Sage coach LLM (Llama 3.3 70B on Groq) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | RAG embeddings (`gemini-embedding-001`) |
| `REVENUECAT_WEBHOOK_SECRET` | Authenticates the RevenueCat → Convex webhook |
| `ONESIGNAL_REST_API_KEY` | Server-triggered pushes |
| `RESEND_API_KEY` | Lifecycle email |

Without any optional keys the app still runs end-to-end: Sage answers with a warm fallback, the in-app paywall renders instead of RevenueCat's, and pushes/email become no-ops.

---

*Health-timeline and coaching content is supportive information, not medical advice. If you're in crisis, call or text 988 (US).*
