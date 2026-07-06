<div align="center">

# HALE

**Quit nicotine for good, one checked-in day at a time.**

HALE is a nicotine cessation app that pairs a personalized quit plan with an AI coach, a craving SOS toolkit, and real social accountability: buddies, squads, and streak leagues. Everything runs on a realtime Convex backend, so your streak, your buddy's nudge, and your squad's feed update live on every device.

[![Expo](https://img.shields.io/badge/Expo-56-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.85-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Convex](https://img.shields.io/badge/Convex-realtime%20backend-EE342F?style=flat-square)](https://convex.dev)
[![RevenueCat](https://img.shields.io/badge/RevenueCat-subscriptions-F25A5A?style=flat-square)](https://www.revenuecat.com)
[![OneSignal](https://img.shields.io/badge/OneSignal-push-E54B4D?style=flat-square)](https://onesignal.com)
[![PostHog](https://img.shields.io/badge/PostHog-analytics-F9BD2B?style=flat-square)](https://posthog.com)
[![Sentry](https://img.shields.io/badge/Sentry-crash%20tracking-362D59?style=flat-square&logo=sentry&logoColor=white)](https://sentry.io)
[![Jest](https://img.shields.io/badge/Jest-tested-C21325?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io)

</div>

---

## What it does

HALE takes you from "I want to quit" to a daily ritual that sticks:

- You onboard with an age gate and a quiz that builds your quit profile: what you use, how much it costs, and when cravings hit.
- Every day you check in. Check-ins are transactional, deduped by your local calendar date, and advance a streak with bounded freeze forgiveness so one rough day does not erase a month of progress.
- When a craving hits, the SOS screen and craving toolkit give you something to do in the next 90 seconds instead of relapsing.
- Sage, the AI quit coach, answers in context: it knows your streak, your quit stage, and your savings, and it retrieves from a curated, source-allowlisted knowledge corpus before it speaks.
- Buddies keep you honest. You pair with an accountability buddy by invite code, nudge each other, and climb streak leagues together. Squads give small groups a shared home.
- A moderated community feed (topic groups, anonymous handles, reactions, reports) is built in, gated behind a feature flag for staged rollout.

HALE+ is the paid tier: unlimited AI coaching, the advanced craving toolkit, and health analytics, sold as an auto-renewable subscription through RevenueCat. Three activated buddy referrals earn a 7 day HALE+ reward without paying.

## Why it's different

| | Typical quit app | HALE |
|---|---|---|
| Streak math | Server UTC day, breaks at midnight for half the world | Computed in the user's own IANA timezone, with bounded freeze forgiveness |
| AI coach | Generic chatbot wrapper | Sage: RAG over an allowlisted knowledge corpus, per-user context line, medical dosing questions detected and redirected, daily cap enforced server side |
| Accountability | A leaderboard of strangers | Buddy pairing with nudges, invite-code squads, and streak leagues |
| Community safety | Post first, moderate never | Every post and comment is classified by Claude before it goes live, plus reports, mutes, and bans |
| Monetization state | Scattered "isPro" booleans | One server-side entitlement resolver: paid via RevenueCat webhook mirror, or earned via referrals |
| Backend | REST plus polling | Convex: reactive queries, scheduled actions, crons, all in TypeScript |

## Architecture

```
┌────────────────────────────────────────────┐
│           HALE app (Expo / React Native)   │
│  expo-router screens · NativeWind · Skia   │
│  Reanimated · Rive · Lottie · FlashList    │
└───────┬───────────────┬────────────────────┘
        │ reactive       │ native SDKs
        │ queries and    │
        │ mutations      ▼
        │        ┌─────────────────────────────┐
        │        │ RevenueCat (purchases + UI) │
        │        │ OneSignal (push)            │
        │        │ PostHog (analytics)         │
        │        │ Sentry (crash tracking)     │
        │        └──────────┬──────────────────┘
        ▼                   │ webhook (RC)
┌────────────────────────────────────────────┐
│              Convex backend                │
│  22 tables · auth · crons · http routes    │
│  checkins · buddies · squads · leagues     │
│  sage · rag · communityModeration · pushes │
└───┬──────────┬─────────────┬──────────┬────┘
    │          │             │          │
    ▼          ▼             ▼          ▼
 Groq API   Anthropic    Google AI    Resend
 (Sage      (feed        (RAG         (lifecycle
 replies)   moderation)  embeddings)  email)
```

The client never talks to an LLM directly. Every AI call runs inside a Convex action with server-held keys.

### Sage, the AI coach pipeline

```
user sends message
      │
      ▼
send (mutation) ── daily cap check (free tier) ── writes user turn
      │ schedules
      ▼
generate (internalAction)
      │
      ├─ contextFor: streak, quit stage, money saved, last turns
      ├─ detectRouteFlag: crisis or medical dosing? ──▶ safe redirect reply
      ├─ searchKnowledge: RAG retrieval (gemini-embedding-001 vectors,
      │     referenceOnly clinical chunks filtered out of replies)
      ▼
Groq · Llama 3.3 70B ──▶ writeReply (internalMutation) ──▶ live query updates UI
```

### Streak check-in flow

```
user taps "Check in"
      │
      ▼
checkIn (one transactional mutation)
      ├─ localDateOf(now, user.timezone)      day boundaries in YOUR timezone
      ├─ dedupe: already checked in today? ─▶ no-op
      ├─ computeStreakOnCheckIn               missed a day? bounded freeze
      │                                       forgiveness may save the streak
      ├─ write checkIns row (source of truth)
      ├─ update users.currentStreak (cache, updated only here)
      └─ day 3 streak? completes any pending referral activation
      │
      ▼ (daily cron)
streak-at-risk push: "you have not checked in today" via OneSignal,
evaluated against each user's own timezone
```

### Subscription and entitlement flow

```
Paywall screen ──▶ RevenueCat Paywalls UI ──▶ StoreKit purchase
                                                    │
                              RevenueCat webhook ◀──┘
                                    │  verified secret
                                    ▼
                     Convex /revenuecat/webhook (http route)
                                    │ event to mirror mapping
                                    ▼
                            users.premium mirror
                                    │
                                    ▼
              resolveEntitlement: paid | referral_reward | none
               (single source of truth for server gates and
                the usePremium client hook)
```

## Features

- **Today tab**: streak ring, daily check-in with mood, money saved, milestone celebrations rendered with Skia, Reanimated, Lottie, and Rive.
- **Coach tab (Sage)**: contextual AI coaching backed by a RAG corpus of allowlisted sources, crisis and medical-dosing detection with safe redirects, server-enforced daily cap on the free tier.
- **SOS and toolkit**: dedicated craving SOS screen plus an advanced craving toolkit, with craving and relapse logging that feeds your analytics.
- **Squad tab**: accountability buddy pairing by 6 character invite code, nudges, invite-only squads, and streak leagues.
- **Community tab**: topic groups, anonymous handles, posts, comments, reactions. Every piece of content is classified by Claude before publishing; users can report and mute; moderators can remove content and ban. Feature-flagged for staged rollout.
- **Referrals**: share your code, and when 3 invited friends activate (reach a 3 day streak), you unlock 7 days of HALE+.
- **You tab**: profile, savings goals, health analytics, account deletion, disclaimers.
- **Onboarding**: welcome, age gate, quit quiz, and health notice before anything else.
- **Lifecycle infra**: behavior-triggered OneSignal pushes, Resend lifecycle email, PostHog product analytics with experiments, Sentry crash reporting.

## Quickstart

```bash
# 1. Install
npm install

# 2. Configure the client (copy and fill EXPO_PUBLIC_* keys)
cp .env.example .env.local

# 3. Start the backend (writes EXPO_PUBLIC_CONVEX_URL for you)
npx convex dev

# 4. Set server-only secrets in Convex, not in .env
npx convex env set GROQ_API_KEY <key>
npx convex env set GOOGLE_GENERATIVE_AI_API_KEY <key>
npx convex env set ONESIGNAL_REST_API_KEY <key>
npx convex env set RESEND_API_KEY <key>
npx convex env set REVENUECAT_WEBHOOK_SECRET <key>

# 5. Run the app
npm run ios        # or: npm run android, npm run web, npm start

# Verify
npm test           # jest-expo unit tests
npm run lint       # expo lint
```

Production builds ship through EAS (`eas.json`: development, preview, and production profiles with auto-incrementing build numbers) and submit to App Store Connect with a preconfigured ASC app id.

## Tech stack

| Layer | Tech |
|---|---|
| App | Expo SDK 56, React Native 0.85, React 19, expo-router, TypeScript |
| UI | NativeWind (Tailwind), rn-primitives, React Native Skia, Reanimated 4, Rive, Lottie, FlashList, Gorhom bottom sheet, custom `src/ui` kit |
| Backend | Convex (reactive database, actions, crons, http routes), Convex Auth |
| AI coach | Llama 3.3 70B on Groq, @convex-dev/rag with gemini-embedding-001 embeddings, curated knowledge corpus in `knowledge/` |
| Moderation | Anthropic Claude classification pipeline for all community content |
| Payments | RevenueCat (react-native-purchases + Paywalls UI), StoreKit intro offer, webhook mirror |
| Push | OneSignal (client SDK + server REST from Convex) |
| Analytics | PostHog (events + experiments), first-party activation events in Convex |
| Crashes | Sentry React Native |
| Email | Resend, sent from Convex |
| Testing | Jest with jest-expo: streaks, entitlements, buddy logic, RC webhook mapping, community rules |
| Delivery | EAS Build + Submit, expo-updates OTA channels |

## Project structure

```
hale/
├── src/
│   ├── app/                  expo-router routes
│   │   ├── (onboarding)/     welcome, age gate, quiz, health notice
│   │   ├── (tabs)/           today, coach, community, squad, you
│   │   ├── sos.tsx           craving SOS
│   │   ├── toolkit.tsx       craving toolkit
│   │   ├── paywall.tsx       HALE+ purchase
│   │   ├── leagues.tsx       streak leagues
│   │   ├── goals.tsx         savings goals
│   │   ├── analytics.tsx     health analytics
│   │   └── referral/, r/, u/  referral flow, code links, profiles
│   ├── components/           milestone celebrations, referral cards, community UI
│   ├── ui/                   design system: Button, Card, Ring, Screen, ...
│   ├── hooks/                usePremium, usePushTags
│   └── lib/                  analytics, revenuecat, onesignal, sentry, links, haptics
├── convex/                   backend: schema (22 tables), checkins, buddies,
│   │                         squads, leagues, sage, rag, communityModeration,
│   │                         referrals, pushes, crons, http (RC webhook)
│   └── model/                pure, unit-tested domain logic: streak, entitlement,
│                             plan, communityRules, sage prompt, rcWebhook
├── knowledge/                Sage RAG corpus + source allowlist config
├── web/                      universal-links kit (AASA, privacy, terms), ready
│                             to deploy; v1 ships code-first sharing instead
├── __tests__/                jest unit tests for the domain models
├── app.json                  Expo config, privacy manifests, OneSignal plugin
└── eas.json                  EAS build profiles + App Store submit config
```

## Design decisions worth stealing

- **Streaks live in the user's timezone, never UTC.** `localDateOf` uses `Intl` with the user's IANA zone, so a 11:50 pm check-in in Mumbai counts for the right day.
- **One mutation owns the streak.** `checkIns` is the source of truth; `users.currentStreak` is a cache written only inside the check-in mutation. No drift.
- **Entitlement is resolved in exactly one function.** Paid (RevenueCat mirror) and earned (referral reward window) both flow through `resolveEntitlement`, which gates Sage caps on the server and the `usePremium` hook on the client.
- **Moderation is pre-publish, not post-hoc.** Content is written as pending, classified by Claude in a scheduled action, then flipped by a pure state machine. A requeue job catches anything that stalls.
- **Pure domain logic is separated and tested.** Everything in `convex/model/` is side-effect free and covered by Jest: streak math, entitlement windows, plan calculations, webhook event mapping.

## License

MIT. See [LICENSE](LICENSE).
