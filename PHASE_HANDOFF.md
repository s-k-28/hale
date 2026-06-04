# HALE — Phase Handoff (pre-launch)

_Last updated: 2026-06-04. Read this first in a fresh session, then `PHASE1_HANDOFF.md` for the original architecture + locked decisions._

HALE = quit-nicotine social-health iOS app. Expo/React Native (New Arch, Hermes) · Convex backend (`good-canary-630`) · RevenueCat · PostHog · OneSignal · Sentry. Wedge = **buddy accountability**; AI coach **Sage**; streaks; craving **SOS**; shareable milestone card. Audience: Gen-Z quitting vaping/nicotine. Ethical guardrail: engagement serves the quit, never app-dependence.

---

## 1. CURRENT STATE — everything is built, tested, animated, and instrumented

**The app is functionally complete and was verified end-to-end** (prior session verdict: *shippable to TestFlight: YES*, modulo the real-world keys below). Across recent sessions:

- **All features built + live-verified** — onboarding, Today/streaks/check-in, Squad (solo + paired + matchmaking), Coach/Sage, SOS (ride/breathe/log/relapse), milestone celebration, paywall, You. Data integrity verified (no dup/orphan/half-written rows); crash-safe (force-quit/relaunch, rapid nav); idempotent onboarding (user+attempt created exactly once).
- **Motion-design pass done + verified** — global screen transitions + tab cross-fade, universal button press physics, Skia check-in particle burst, **custom Skia milestone particle system**, Coach breathing-Sage + typing indicator + reply fade-rise, Squad flame pulse + heart float, SOS coral breathing glow, paywall sheen sweep, plan-reveal $ count-up + row stagger. Reanimated 4 + react-native-skia only (no Lottie).
- **Data instrumentation done + verified (this session — 6 commits, pushed)** — see §3.

**Git:** branch `main`. Latest pushed commit `3ca5614`. tsc clean; main builds from a fresh checkout. The handoff commit sits on top of this.

---

## 2. PRICING DECISION (locked, data-backed) — two plans, annual-lead

Decided from RevenueCat SOSA 2026 + Adapty SOIS 2026 (Health & Fitness cut):

- **Annual $39.99/yr — the lead.** Pre-selected, "Best value", framed as **"$3.33/mo"** (~67% cheaper than paying monthly).
- **Monthly $9.99/mo — the anchor/on-ramp.** Low-commitment entry + makes annual look like a deal.
- **Skip weekly.** Even though weekly is 55% of all app revenue globally, **H&F is the one category where annual dominates (60.6%, growing)**; annual earns ~2× monthly / ~5× weekly RPI; weekly Day-380 retention is 5.5% (vs annual ~20%). Weekly also reads predatory for a vulnerable quit audience (brand + App Store risk) and is the opposite of what HALE needs given the **graduation paradox** (success = the user quits & leaves → capture value upfront via annual).
- **14-day free trial on both** (in H&F, trials *boost* annual LTV).
- **If a 3rd plan is ever wanted → Lifetime (~$79–99), NOT weekly.** Post-launch only.
- **Post-launch test:** annual at **$49.99–59.99** (price is the #1 LTV lever; $39.99 is only the category median — Kwit charges $127.99/yr).

---

## 3. WHAT'S BUILT vs WHAT'S BLOCKED

### Built + verified (no further work)
- **P1 — buddy-pairing as the activation event.** Onboarding `invitebuddy` step after commitment: invite (prefilled `hale://u/<id>` deep link), **matchmaking pool** (`buddies.requestMatch`, matches on product type + quit-stage + timezone), de-emphasized solo bridge. **Buddy-graph captured** in `buddyLinks` (`pairedAt`/`pairingMethod`/`initiatorId`) + `matchRequests` audit table. Verified live: matchmaking paired two users; graph rows + events landed.
- **P2 — North Star + activation moat.** North Star = **Weekly Active Paired Quitters**. New `activationEvents` Convex table (authoritative); `checkIn` server-detects + writes `first_check_in` + `activated_paired_quitter` (paired + check-in ≤48h) and returns flags the client mirrors to PostHog. Candidate alts `first_sos`/`first_sage_message`. Relapse signals: `quitAttempts.lapseCountBeforeRelapse` + `relapse_logged` enriched (`streak_at_relapse`, `lapses_before_relapse`). Verified live.
- **P3 — Sage cost controls.** Cheap-tier model (**Claude Haiku**); per-tier daily cap (**free 5 / trial 15 / paid 50**) enforced before any compute; 12-turn sliding context; per-message cost ledger on `sageMessages` (tokens/cost/tier/model). Events `coach_message_sent` (tier/count/cap_state) + `sage_cap_hit`. Verified live (cap blocked a send with zero compute).
- **Event-level cohort backbone** — `paired_solo_status` / `tier` / `quit_stage` / `timezone` merged into **every** `track()` (fixes PostHog person-on-events lossiness). Verified.
- **Convex build blocker fixed** — `convex/globals.d.ts` declares `process.env` so the Convex typecheck passes and new mutations deploy.
- **PostHog delivery confirmed** — 12 custom events queried directly in the dashboard events table.
- **Events reference doc** — `docs/ANALYTICS_EVENTS.md` (every event + properties + PostHog/Convex destination + which q1–q5 question it answers).

### Blocked on real-world keys/accounts (NOT bugs)
- **Real Sage replies** → needs **Anthropic credits** (key is set but $0 → serves the warm fallback line; cost ledger logs 0 until funded).
- **Real purchases** → RevenueCat iOS key ✅ now set, but needs **App Store Connect subscription products** (Apple acct) + the **Offering** + the **two-plan paywall UI** (currently annual-only).
- **Push delivery** → needs **APNs `.p8`** uploaded to OneSignal (Apple acct). OneSignal keys are set.
- **2-device buddy sync / real network chaos** → needs real devices.
- **Crash reporting** → Sentry DSN not set.

---

## 4. THE REMAINING LAUNCH CHAIN (exact order)

1. **Fund Anthropic credits** — console.anthropic.com → Billing. Turns Sage from fallback → real replies and starts real cost logging. (Key already in Convex env.)
2. **Buy Apple Developer account** ($99/yr) + sign the **Paid Apps agreement** in App Store Connect (required before any subscription product exists).
3. **Create the two ASC subscription products** — both in **one subscription group**: annual `$39.99/yr` and monthly `$9.99/mo`. Add the 14-day intro free trial on both. Pick clean product IDs (e.g. `hale_plus_annual`, `hale_plus_monthly`).
4. **RevenueCat wiring** — import both products → attach to the **`HALE+` entitlement** (already exists) → create an **Offering** with annual as the default/highlighted package, monthly as the second. **Finish the webhook** (see §5).
5. **Finish the two-plan paywall UI** — `src/app/paywall.tsx` is **currently annual-only hardcoded ($39.99/yr)**. Update it to read the two packages from the RevenueCat Offering: annual pre-selected with **"$3.33/mo · save 67%"** + "Best value", monthly below. (Wire through `react-native-purchases` offerings; `src/lib/revenuecat.ts` already configures the SDK once the key is present.)
6. **APNs** — create an APNs Auth Key (`.p8`) in the Apple Developer portal → upload to the OneSignal dashboard (enables real push delivery).
7. **EAS build → TestFlight** — `eas build -p ios`, ensure the `EXPO_PUBLIC_*` keys are present in the build env (EAS secrets or `.env`), submit to TestFlight.

---

## 5. KEYS STILL OWED (and where each goes)

| Key | Where | Status / action |
|---|---|---|
| **Anthropic credits** | Anthropic billing | Key set, **$0 — fund it** |
| **RevenueCat iOS SDK key** | `.env.local` → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | ✅ **DONE** (`appl_…`, set this session) |
| **RevenueCat entitlement** | code default `HALE+` | ✅ **DONE** (entitlement `HALE+` exists; no env needed) |
| **RevenueCat webhook secret** | `npx convex env set REVENUECAT_WEBHOOK_SECRET <secret>` | **PENDING** — in RevenueCat → Integrations → Webhooks, URL `https://good-canary-630.convex.site/revenuecat/webhook`, set an Authorization-header secret, then set the same value in Convex env |
| **Sentry DSN** | `.env.local` → `EXPO_PUBLIC_SENTRY_DSN` | Optional, recommended |
| **Resend API key** | `npx convex env set RESEND_API_KEY <key>` | Optional (only for the trial-ending reminder email) |
| **RevenueCat Android key** | `.env.local` → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Skip for iOS launch |
| **APNs `.p8`** | OneSignal dashboard | Needs Apple acct; for real push |

Already set ✅: Convex URL/site URL, PostHog key (confirmed delivering), OneSignal app id + REST key, Convex auth keys (auto).

---

## 6. ⚠️ `_devtest.ts` REMOVAL (critical pre-launch task)

`convex/_devtest.ts` is **dev-only, untracked, on disk, and currently deployed to the dev Convex deployment** (re-deployed this session to reset the Sage cap). It exports: `uncheckIn`, `backdateQuit`, `seedCoach`, `seedBuddy`, `clearSage`, `seedUserTurn`, `seedSageReply`, `resetAll`, `seedWaitingPeer`, `setSageCount`.

**Before the production Convex deploy:**
```bash
rm convex/_devtest.ts && npx convex deploy   # un-deploys the dev mutations so they're not callable in prod
```
The committed generated `api.d.ts` is already clean of `_devtest` (regenerated this session), so main builds without it. Leaving the file means those test mutations are callable on whatever deployment it's pushed to — must not ship to prod.

---

## 7. DEV / TEST STATE (for resuming work)

- **Metro:** running on `:8081` (`nohup npx expo start --port 8081 > /tmp/metro.log`). If down: restart that command; first bundle ~40s; reconnect the app via `hale://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
- **Simulator:** iPhone 17 Pro, UDID `755B55D9-8E4B-431C-9D1D-A635F38CFF5F` (cached in `/tmp/hale_udid`). 402×874 pt = 1206×2622 px (÷3).
- **Sage:** on fallback (Anthropic $0). Test user is on the trial tier; `sageMsgCount` was reset to 0, so Sage chat works (returns the canned fallback line until credits are added).
- **Reset to clean state:** `npx convex run _devtest:resetAll` + `xcrun simctl keychain <udid> reset` + relaunch via deep link → fresh welcome, empty DB.
- **Other dev helpers:** `uncheckIn` (resets check-in for all users), `backdateQuit '{"days":N}'` (trigger milestone), `seedWaitingPeer` (matchmaking peer), `setSageCount '{"userId":"…","count":N,"localDate":"YYYY-MM-DD"}'`, `seedBuddy`, `seedCoach`.
- **Driver stack (ExecBro CDP is down):** AXe (`axe tap/type/swipe/describe-ui/key-combo/touch`), simctl (screenshot/openurl/keychain), Convex CLI (`data`/`run`/`dev --once`/`env`), PostHog MCP (`exec` → `read-data-schema` / `execute-sql`).
- **Verification harness:** motion → `simctl recordVideo` + `ffmpeg ... tile=` frame grid (kill stale `simctl io` procs first or recordings die instantly); events → device `[ev]` log (`grep '[ev]' /tmp/metro.log`) + Convex `data` + PostHog `execute-sql`.
- **Deploy gotcha:** pre-existing `process` typecheck is fixed via `globals.d.ts`; normal `npx convex dev --once` typechecks + deploys. (Historically needed `--typecheck=disable`; no longer.)
- **Metro NativeWind watcher:** earlier sessions hit a file-watcher crash; current Metro survives edits (Fast Refresh works). If it crashes, restart Metro.

---

## 8. KEY FILES

- **Paywall (NEEDS two-plan update):** `src/app/paywall.tsx` — annual-only `$39.99/yr` hardcoded.
- **RevenueCat SDK init:** `src/lib/revenuecat.ts` (scaffold no-op until key present — key now set). Entitlement default `HALE+` in `src/lib/config.ts`.
- **Analytics:** `src/lib/analytics.ts` (`Ev` enum, `cohortProps()`/`setCohortSnapshot()`, `track()`); cohort refreshed in `src/app/(tabs)/_layout.tsx`.
- **Convex:** `buddies.ts` (`pairWith`, `requestMatch`), `checkins.ts` (activation detection), `relapse.ts` (relapse signals), `sage.ts` + `model/sage.ts` (caps/cost/Haiku), `schema.ts` (buddyLinks/matchRequests/activationEvents/sageMessages/users fields), `model/cohort.ts` (`quitStage`).
- **Docs:** `docs/ANALYTICS_EVENTS.md` (event contract), `PHASE1_HANDOFF.md` (original architecture + locked decisions).
- **Onboarding:** `src/app/(onboarding)/quiz.tsx` (`InviteBuddyStep` + phase machine).

---

## 9. STRATEGY CONTEXT (the profitability brief — informs roadmap)

Highest-leverage levers, ranked: (1) buddy-pairing as activation (built), (2) retention/first-7-days, (3) beat the **graduation paradox** (success→churn) via the buddy relationship + a graduate→mentor loop, (4) organic/viral growth (TikTok + share-card; paid UA is structurally unprofitable at $39.99/yr + median H&F retention), (5) protect Sage margin + don't let it be the product (built). North Star = Weekly Active Paired Quitters. The data moat (buddy-graph + activation + relapse + Sage-cost) is now instrumented from cohort one — the whole point of this session.
