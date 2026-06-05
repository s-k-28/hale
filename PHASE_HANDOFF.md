# HALE — Phase Handoff (pre-launch · relaunch v2)

_Last updated: 2026-06-04 (session 2). Read this FIRST in a fresh session, then:_
- _`RELAUNCH_PLAN.md` — the locked pricing/trial/paywall decisions + exact code state._
- _`MRR_STUDY.md` — the 22-app, $100k–$1M/mo teardown (revenue-audited) that drove the repricing._
- _`PHASE1_HANDOFF.md` — original architecture + locked decisions._

HALE = quit-nicotine social-health iOS app. Expo/React Native (New Arch, Hermes) · Convex backend (`good-canary-630`) · RevenueCat · PostHog · OneSignal · Sentry. Wedge = **buddy accountability**; AI coach **Sage**; streaks; craving **SOS**; shareable milestone card. Audience: Gen-Z quitting vaping/nicotine. Ethical guardrail: engagement serves the quit, never app-dependence.

---

## 0. WHERE WE ARE RIGHT NOW (the one thing to know)

**Mid-launch-chain. You are creating the two App Store Connect subscription products (Step 1 below).** Everything before that — the full app, the MRR study, the repricing decision, and the code changes (peak-intent paywall + reprice) — is **done, verified (tsc clean), and pushed to GitHub**. The very next action lives in App Store Connect. After the two products read **Ready to Submit**, report the Product IDs back and continue at Step 2.

---

## 1. CURRENT STATE — built, tested, animated, instrumented, pushed

The app is **functionally complete and verified end-to-end** (prior verdict: *shippable to TestFlight: YES*, modulo the real-world keys in §6).
- **All features built + live-verified** — onboarding, Today/streaks/check-in, Squad (solo + paired + matchmaking), Coach/Sage, SOS (ride/breathe/log/relapse), milestone celebration, paywall, You. Data integrity verified; crash-safe; idempotent onboarding.
- **Motion-design pass done + verified** — global transitions, Skia check-in + milestone particle systems, breathing Sage, paywall sheen, plan-reveal count-up, etc. (Reanimated 4 + react-native-skia, no Lottie).
- **Data instrumentation done + verified** — buddy-graph + activation + relapse signals + Sage cost ledger; cohort props on every event; PostHog delivery confirmed; `docs/ANALYTICS_EVENTS.md` is the event contract.
- **This session:** ran a 22-app MRR study → repriced + rebuilt the conversion engine → all pushed. **tsc clean; main builds from a fresh checkout.**

---

## 2. PRICING & TRIAL (locked this session — SUPERSEDES the old $39.99 plan)

- **Annual $79.99/yr** — the lead (≈ **$6.67/mo**). _[was $39.99]_
- **Monthly $12.99/mo** — the anchor (makes annual read as ~49% off). _[was $9.99]_
- **⚠️ TRIAL = 2 WEEKS (14 days).** Reverted from a brief 3-day experiment back to 14 days per research: **14+ day trials convert ~42.5% vs ~28% for short trials, and longer trials boost annual LTV in Health & Fitness.** The app-managed full-access window (`convex/model/trial.ts`, `TRIAL_LENGTH_DAYS = 14`) is also 14 days, so they now align. **Create the ASC intro offer as `2 Weeks`, NOT 3 Days.**
  - _Note for the record: this session's MRR study favored a **3-day** trial (Cal AI +31% trial-to-paid; long trials leak "forgot to cancel"); the H&F trial→LTV data favors **14-day**. The sources genuinely disagree → **trial length is the #1 post-launch A/B candidate.** Current shipped decision: **14 days / 2 weeks.**_
- **Paywall:** RevenueCat **native** (dashboard) is the primary surface; A/B via RevenueCat Experiments. Placement = **at the plan-reveal peak** in onboarding, **dismissible** (so the buddy-invite loop is never blocked). Full rationale in `RELAUNCH_PLAN.md`.
- Why the change: `MRR_STUDY.md` verdict — $100k MRR is reachable for this category, but odds were ~25–30% on the old plan → ~60–65% with: reprice ↑, conversion engine, buddy-as-retention-spine, paid-creator distribution.

---

## 3. CODE BUILD — done & verified this session (tsc EXIT=0)

- `convex/users.ts` — `completeOnboarding` now returns `{ attemptId, userId }` (both the idempotent and normal return).
- `src/lib/paywall.ts` — `presentPaywall(surface?)` tags `PAYWALL_VIEWED` + `PURCHASE_COMPLETED` with the surface (no double-firing).
- `src/app/(onboarding)/quiz.tsx` — in `commit()`, after onboarding: `identifyPurchaser(userId)` (onboarding runs before the tabs layer that normally identifies the RC purchaser) → `presentPaywall('onboarding_peak')` (dismissible) → fires `trial_started {trial_days:14, trial_type:'storekit'}` on purchase. Buddy/push routing unchanged.
- `src/app/paywall.tsx` — offline fallback `HalePlusUpsell` repriced $39.99→$79.99, "/yr · $6.67/mo", "14-day free trial" copy. **This fallback only renders when RC is unconfigured; the RC-native paywall is the real one.**
- **Verify:** `npx tsc --noEmit` = EXIT 0, 0 errors. Touched files lint-clean (2 pre-existing warnings in quiz.tsx are unrelated). ESLint 9 + eslint-config-expo were freshly installed by a lint run; the 29 "errors" are pre-existing baseline in untouched legacy files — NOT regressions.

---

## 4. THE LAUNCH CHAIN (exact order · current position = Step 1)

### ▶ STEP 1 — [IN PROGRESS] Create the two ASC subscription products
One subscription group → **Reference Name `HALE Plus`**, **group display name `HALE+`**. Both products at the **same Level (1)** so monthly↔annual is a clean crossgrade. _(There is no "entitlement" field in ASC — that's a RevenueCat concept, mapped in Step 2.)_

**Annual:**
| Field | Value |
|---|---|
| Reference Name | `HALE+ Annual` |
| Product ID | `hale_plus_annual` |
| Duration | 1 Year |
| Price | **$79.99** |
| Level | 1 |
| Display Name | `HALE+ Yearly` |
| Description | `Unlimited Sage coaching, full health analytics, multiple squads, and home-screen widgets. Billed yearly.` |

**Monthly:**
| Field | Value |
|---|---|
| Reference Name | `HALE+ Monthly` |
| Product ID | `hale_plus_monthly` |
| Duration | 1 Month |
| Price | **$12.99** |
| Level | 1 |
| Display Name | `HALE+ Monthly` |
| Description | `Unlimited Sage coaching, full health analytics, multiple squads, and home-screen widgets. Billed monthly.` |

**Free trial on BOTH (Introductory Offer):** Type **Free** · Duration **2 Weeks** · All countries/regions · New subscribers. Then clear Missing Metadata + add a review screenshot (the paywall screenshot) until each reads **Ready to Submit**.

### STEP 2 — RevenueCat
Import both products → attach both to the **`HALE+` entitlement** (already exists) → create an **Offering** with **annual as the default/highlighted** package, monthly second → design the native two-plan **Paywall** (annual highlighted "Best value · $6.67/mo", show the **2-week** free trial + a no-surprise charge timeline) → **finish the webhook** (§6).

### STEP 3 — Two-plan paywall UI
Primary = the **RC-native** paywall from Step 2 (it reads the offering; A/B via RC Experiments). The in-app `src/app/paywall.tsx` `HalePlusUpsell` is the **offline fallback** and is already repriced to $79.99 (single-plan). _Optional:_ if you want the fallback to also show both plans, update it to read `Purchases.getOfferings()` — but the native paywall is the real conversion surface, so this is low priority.

### STEP 4 — Remove the dev-only test file (CRITICAL, pre-prod)
```bash
rm convex/_devtest.ts && npx convex deploy
```
Un-deploys the dev mutations so they're not callable in prod. (See §7 for the git caveat.)

### STEP 5 — EAS production build → TestFlight
```bash
eas build -p ios
```
Ensure the `EXPO_PUBLIC_*` keys are present in the build env (EAS secrets or `.env`), then submit to TestFlight.

---

## 5. AFTER PRODUCTS ARE "READY TO SUBMIT" — the immediate next actions
1. **Report the two Product IDs** back (`hale_plus_annual` / `hale_plus_monthly` or whatever you used) + confirm same group / $79.99 + $12.99 / **2-week** trial on each.
2. Build the **RevenueCat Offering** (annual highlighted) + native paywall + webhook.
3. Confirm the two-plan paywall (RC-native primary; fallback already repriced).
4. `rm convex/_devtest.ts && npx convex deploy`.
5. `eas build -p ios` → TestFlight.

---

## 6. KEYS STILL OWED (and where each goes)

| Key | Where | Status / action |
|---|---|---|
| **Anthropic credits** | Anthropic billing | Key set, **$0 — FUND IT** (Sage serves the warm fallback until funded; cost ledger logs 0). |
| **RevenueCat iOS SDK key** | `.env.local` → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | ✅ **DONE** (`appl_…`). |
| **RevenueCat entitlement `HALE+`** | code default (`config.ts`) | ✅ exists; no env needed. |
| **RevenueCat webhook secret** | `npx convex env set REVENUECAT_WEBHOOK_SECRET <secret>` | **PENDING** — RC → Integrations → Webhooks, URL `https://good-canary-630.convex.site/revenuecat/webhook`, set an Authorization-header secret, then mirror the same value into Convex env. |
| **Sentry DSN** | `.env.local` → `EXPO_PUBLIC_SENTRY_DSN` | Optional, recommended. |
| **Resend API key** | `npx convex env set RESEND_API_KEY <key>` | Optional (trial-ending reminder email). |
| **RevenueCat Android key** | `.env.local` → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Skip for iOS launch. |
| **APNs `.p8`** | OneSignal dashboard | Needs Apple acct; for real push. |

Already set ✅: Convex URL/site URL, PostHog key (delivering), OneSignal app id + REST key, Convex auth keys (auto).

---

## 7. `_devtest.ts` REMOVAL + GIT CAVEATS (critical)

`convex/_devtest.ts` is **dev-only, untracked, on disk, deployed to the DEV deployment**. Exports: `uncheckIn`, `backdateQuit`, `seedCoach`, `seedBuddy`, `clearSage`, `seedUserTurn`, `seedSageReply`, `resetAll`, `seedWaitingPeer`, `setSageCount`.

**Before the prod Convex deploy:** `rm convex/_devtest.ts && npx convex deploy`.

⚠️ **Git caveats (learned this session):**
- Running `npx convex codegen`/`dev` with `_devtest.ts` on disk regenerates `convex/_generated/api.d.ts` to **INCLUDE `_devtest`**. The **committed** `api.d.ts` is clean of `_devtest` — **do NOT stage `convex/_generated/*` changes.** The committed clean `api.d.ts` still typechecks the app on a fresh checkout (return types flow from source, e.g. the new `completeOnboarding` userId). This session's commit deliberately staged only **source + docs**, never `_generated`.
- A lint run installed `eslint` + `eslint-config-expo` into `package.json`/`package-lock.json` (228 packages). **Left UNSTAGED** on purpose — decide later whether to keep a lint setup.

---

## 8. DEV / TEST STATE (for resuming)

- **Metro:** `nohup npx expo start --port 8081 > /tmp/metro.log`. First bundle ~40s; reconnect via `hale://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
- **Simulator:** iPhone 17 Pro, UDID `755B55D9-8E4B-431C-9D1D-A635F38CFF5F` (cached `/tmp/hale_udid`). 402×874 pt = 1206×2622 px (÷3).
- **Sage:** on fallback (Anthropic $0). Test user trial-tier; `sageMsgCount` reset to 0.
- **Reset to clean:** `npx convex run _devtest:resetAll` + `xcrun simctl keychain <udid> reset` + relaunch deep link.
- **Other dev helpers:** `uncheckIn`, `backdateQuit '{"days":N}'`, `seedWaitingPeer`, `setSageCount '{"userId":"…","count":N,"localDate":"YYYY-MM-DD"}'`, `seedBuddy`, `seedCoach`.
- **Driver stack:** AXe (`axe tap/type/swipe/describe-ui`), simctl, Convex CLI (`data`/`run`/`dev --once`/`env`), PostHog MCP, RevenueCat MCP (use to verify the Offering import in Step 2).
- **Deploy gotcha:** `process` typecheck fixed via `convex/globals.d.ts`; normal `npx convex dev --once` typechecks + deploys (to DEV).

---

## 9. KEY FILES

- **Paywall (RC-native primary; fallback repriced):** `src/app/paywall.tsx`. RC SDK: `src/lib/revenuecat.ts` (`identifyPurchaser`), present: `src/lib/paywall.ts` (`presentPaywall(surface?)`). Entitlement default `HALE+` in `src/lib/config.ts`.
- **Onboarding + peak-intent paywall:** `src/app/(onboarding)/quiz.tsx` (`commit()` inserts the paywall; `InviteBuddyStep` activation).
- **Trial model:** `convex/model/trial.ts` (`TRIAL_LENGTH_DAYS = 14`). Onboarding grant: `convex/users.ts` `completeOnboarding`.
- **A/B flags:** `src/lib/experiments.ts` (`PAYWALL_POSTURE`, `QUIZ_LENGTH`, …) over PostHog.
- **Analytics:** `src/lib/analytics.ts` (`Ev`, `track`, cohort props).
- **Docs:** `MRR_STUDY.md`, `RELAUNCH_PLAN.md`, `docs/ANALYTICS_EVENTS.md`, `PHASE1_HANDOFF.md`.

---

## 10. STRATEGY CONTEXT (informs the roadmap)

North Star = **Weekly Active Paired Quitters**. `MRR_STUDY.md` verdict: $100k MRR reachable (~60–65% with the four moves; ~25–30% on the old plan). The single biggest **threat** = distribution dependence on unproven free TikTok + the graduation paradox (single-substance, finite). The single biggest **unlock** = the **buddy/squad wedge rebuilt as the retention spine** (graduate→mentor), which also lowers CAC via invite loops. **Fast-follow (post-TestFlight):** (1) buddy-as-graduation-escape, (2) paid/embedded-creator distribution engine, (3) RC Experiments on the paywall + **trial-length A/B (3-day vs 14-day)**, (4) ARPU-expansion / B2B2C layer.
