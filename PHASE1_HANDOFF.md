# HALE — Phase-1 Build Handoff (resume after context clear)

**Repo:** `~/hale` · git `main` (remote `s-k-28/hale`, **pushed through `91cbeb7`** as of 2026-06-02 evening).
**Stack (LOCKED):** Expo ~56.0.8 · RN 0.85.3 · React 19.2.3 · Hermes v1 · New Arch · **NativeWind ^4.2.4** · Convex (`good-canary-630`) · `@convex-dev/auth` (anonymous) · expo-router (typedRoutes + reactCompiler) · `react-native-onesignal` 5.x + `onesignal-expo-plugin` · `react-native-purchases` · `posthog-react-native`.

## The bar
Ultrathink before code. Done-gate = run live, screenshot, confirm `[ev]` AND (now) confirm delivery in PostHog. No placeholders/hardcoded. Commit each increment. **A feature is "passed" only at its PRD exit criteria + live confirmation, not when it compiles.**

---

## ⭐ CURRENT STATE (2026-06-02 evening) — passed vs blocked

### ✅ PASSED — live-confirmed today (all committed + pushed)
| Item | Evidence |
|---|---|
| **PostHog delivery** (root-cause fix `4279f84`) | Custom events confirmed **in the PostHog dashboard** (events table): `onboarding_started`, `quit_committed`, `counter_viewed`, `craving_sos_opened`, `craving_logged`, `coach_session`, `coach_message_sent`, `relapse_logged`, `analytics_viewed`, `paywall_viewed`. Bug was: `track()` used a lazily-created client that was NEVER initialized → silent no-op. Fixed by a shared `posthog` singleton passed to `<PostHogProvider client={posthog}>`. |
| **O1 Onboarding** | funnel events in PostHog; full quiz→reveal→commit re-verified flawless via Maestro |
| **P1 Today counter** | `counter_viewed` in PostHog; screen flawless |
| **P2 Check-in** | `checkin_completed{streak}` fired; checked-in state flawless |
| **I1 Craving SOS + log** | `craving_sos_opened/logged/survived` in PostHog; full SOS flow (intro/timer/log) flawless |
| **I2 Sage (UI/plumbing)** | `coach_session/coach_message_sent` in PostHog; chat renders warm **fallback** (real Claude BLOCKED on credits, see below) |
| **I4 Relapse recovery** | `relapse_logged` in PostHog; anti-shame recovery flawless (NOT THE END / FRESH RUN; lifetime $ + best-streak preserved) |
| **P3 Milestone + share** | `card_shared` in PostHog; share sheet + TransformationCard flawless; milestone overlay verified earlier |
| **S1 Buddy invite** | `buddy_invited` fired; Squad screen flawless |
| **§8 Trial + gate** | trial grant + `hasAccess` unlock + `paywall_viewed`/`analytics_viewed` live; RC **HALE+ entitlement + iOS app created via V2 API** |
| **§9 push completeness** | `linkOneSignal` (`9646895`) + 2/day cap (`9009539`, `true,true,false`) + `data.kind` routing + `PUSH_OPENED` + `identifyPurchaser` (`60cddaa`/`fb54c92`) — code-complete; cap + link verified live |
| **Anton glyph clip (#10)** | Fixed (`f864dfc`) + verified live: You-card "8"/"$430", paywall "GO ALL IN"/"$39.99", SOS "THIS PASSES"/"NOT THE END"/"FRESH RUN", Coach "HEY I'M SAGE", analytics "6/10", onboarding |
| **Flawless UI pass** | Every Phase-1 screen driven live (Maestro): Today, You, Squad, SOS flow, Coach, Insights (unlocked + real data), relapse, onboarding — no clipped glyphs, no lorem placeholder |

### 🔴 BLOCKED — non-Apple, exact blocker
| Item | Blocker |
|---|---|
| **I2 — real Claude replies** | **Anthropic account OUT OF CREDITS** (key valid + integration correct; verified the 400 `invalid_request_error: credit balance too low`). Add credits → run `npx convex run sage:generate '{"userId":"<id>"}'` → confirm non-fallback reply. |
| **§8 — real purchases path** | **User must paste `appl_…` RC iOS SDK key + set `REVENUECAT_WEBHOOK_SECRET`** (entitlement + iOS app already created) |
| **Trial-reminder emails** | **`RESEND_API_KEY` not provisioned** (sweep + template ready; no-ops without it) |
| **Paywall placement** | **Research workflow `w8b6miskz` running** → recommendation will be appended below, then implement |
| **Tamagui** | **Decision pending** (see below; recommend DEFER) |

### 🟡 Needs a real device (test-time, not code)
- **S2** buddy *paired* + nudge delivery; **§9/I3** on-screen push delivery → 2 devices / production build.

### ⛔ Apple-gated — TOMORROW (after $99 Apple Developer account)
1. Buy Apple Developer Program ($99/yr) — gates everything below.
2. Register App ID `com.haleapp.hale` + Push Notifications capability + NSE app group `group.com.haleapp.hale.onesignal`.
3. Generate APNs **`.p8`** (Apple → Keys) → upload .p8 + Key ID + Team ID to OneSignal → confirm "Connected" → **I3/#9 on-device push delivery**.
4. Create App Store Connect subscription products ($9.99/mo, $49.99/yr) → give me the product IDs → **I create RC products + "default" offering + attach HALE+ via V2 API** → §8 purchase verify (sandbox/TestFlight).
5. Flip `app.json` onesignal plugin `mode: development→production` + entitlements `aps-environment` (or let EAS auto-handle) → `eas build --platform ios --profile production` (native layer already exists: Podfile.lock OneSignalXCFramework 5.5.1 + NSE target — just a build run).
6. Populate `eas.json` submit.production (appleId, ascAppId, bundleId) + ASC API key → `eas submit` → TestFlight → App Store review. ASO metadata (description added; category/screenshots/privacy URL in ASC).

---

## 🔓 Three open tasks (next session)
1. **RevenueCat `appl_` key + webhook** — on user handover: set `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…` in `~/hale/.env.local`; set `REVENUECAT_WEBHOOK_SECRET` in Convex env (`npx convex env set …`) + point RC dashboard webhook at `https://good-canary-630.convex.site/revenuecat/webhook` (Authorization header == that secret; `convex/http.ts:19` validates it). Then verify `usePremium` resolves + webhook mirrors `users.premium`.
2. **Sage real-Claude flip** — once Anthropic credits added: `npx convex run sage:generate '{"userId":"<a user with a sage message>"}'` → confirm a real (non-fallback) reply persists + no `[sage] anthropic non-ok` log. Model is `claude-sonnet-4-6` (`convex/model/sage.ts`).
3. **Paywall placement** — implement the research recommendation (below): insert a `TrialStartPaywall` (no-card "Start 14-day free trial" gate) right after the plan-reveal, reusing the existing RC paywall screen + trial mutation. Pending user OK.

## 🔑 Keys still owed by the user
| Key | Where | Unblocks |
|-----|-------|----------|
| **Anthropic credits** (key already set in Convex env, account just needs billing top-up) | console.anthropic.com → Plans & Billing | I2 Sage real replies |
| **`EXPO_PUBLIC_REVENUECAT_IOS_KEY`** (`appl_…`, dashboard-only) | `~/hale/.env.local` | §8 paywall SDK / purchases |
| **`REVENUECAT_WEBHOOK_SECRET`** (any random string) | Convex env + RC dashboard webhook config | §8 entitlement→`users.premium` mirror |
| **`RESEND_API_KEY`** (`re_…`) | Convex env (`RESEND_API_KEY`) | trial-reminder emails (lowest) |
| *(Apple Developer account — tomorrow, see Apple-gated list)* | | APNs push, IAP products, build, TestFlight |

**Already provisioned + verified this session:** PostHog `phc_…` (delivering) · OneSignal `EXPO_PUBLIC_ONESIGNAL_APP_ID=b358ef20-dddc-4f13-87df-2bd8213ed708` (.env.local) + `ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY` (`os_v2_app_…`, server-send authenticates) in Convex env · Anthropic `ANTHROPIC_API_KEY` in Convex env (valid, no credits).

## ⚖️ Two open decisions
- **Paywall placement** — ✅ RECOMMENDATION READY (see "Paywall placement" section below): **hard-placed, soft-economics trial-start paywall right after plan-reveal** (no-card "Start 14-day free trial" gate). Pending user OK to implement (add a `TrialStartPaywall` step; reuses existing RC paywall screen + trial mutation).
- **Tamagui** — user leaned "full migrate to Tamagui," but I **recommended DEFER**: a 24-screen re-skin can't be done flawlessly before tomorrow's launch build, would regress the just-verified flawless UI, has zero user-facing benefit, and the hybrid is stable (only `welcome.tsx` is Tamagui). **Awaiting final call:** defer-with-plan (recommended) / pilot 2–3 screens first / full-send-now (accepting not-flawless-today). Do NOT start a full re-skin without explicit confirmation.

## 📝 Minor flag
- SOS sheet has a greyed **"Ping my buddy — (Coming soon)"** disabled option (intentional, not lorem). Consider hiding it for a launch-clean SOS sheet (1-line change in `src/app/sos.tsx`).

---

## Verification harness
- **Sim:** iPhone 17 Pro UDID `755B55D9-8E4B-431C-9D1D-A635F38CFF5F` (iOS 26.5).
- **Metro:** port 8081, cwd `~/hale`, log `/tmp/hale-metro-spike.log`. Restart: `lsof -ti :8081 | xargs kill -9; cd ~/hale && nohup npx expo start --port 8081 --clear > /tmp/hale-metro-spike.log 2>&1 &`. (Metro crashed ~twice this session — re-check `lsof -i :8081` if the sim shows "No script URL".)
- **UI DRIVER = Maestro MCP** (ExecBro MCP was flaky/disconnected this session). `list_devices` → `run`(inline YAML: `tapOn`/`inputText`/`swipe`/`launchApp`) → `take_screenshot` → `inspect_screen`. **Gotchas:** Maestro `text:` is FULL-STRING regex (IGNORE_CASE) → for partial/aggregator labels use `"PREFIX.*"`; tab labels are a11y `"Today, tab, 1 of 4"` / `"Squad, tab, 2 of 4"` / `"Coach, tab, 3 of 4"` / `"You, tab, 4 of 4"`; intensity buttons are `"Intensity 1".."Intensity 5"`; when a label fails, `inspect_screen` for exact a11y or tap by `point: "50%,46%"`. Relaunch via `xcrun simctl terminate/launch` (Maestro `launchApp stopApp:true` cold-starts and can hit "No script URL" if Metro is down).
- **Client events:** `track()` logs `[ev] <name> <props>` to Metro log in `__DEV__` AND delivers to PostHog (shared singleton). `grep -aE "\[ev\]" /tmp/hale-metro-spike.log`.
- **PostHog dashboard:** MCP project "Default project" id `448817`, org "HALE". Verify delivery: `execute-sql` →`SELECT event,count() FROM events WHERE timestamp > now() - INTERVAL 40 MINUTE AND event NOT LIKE '$%' AND event NOT LIKE 'mcp%' GROUP BY event`. Flush is ~30s (RN SDK) + ingestion lag.
- **Server events:** Convex actions `console.log('[ev:server] …')` → `npx convex logs --history N`. `[sage] anthropic non-ok …` now logs Sage fallback reasons.
- **Convex:** `npx convex data <table>` · `npx convex run <fn>` · `npx convex export --path /tmp/x.zip` (read user docs) · deploy `npx convex dev --once --typecheck disable` (REQUIRED flag — pre-existing process.env type errors in pushes/sage/email/http/auth.config).
- **RevenueCat V2 API** (management): secret key `sk_[SCRUBBED]` (Project-config R/W), project `projeb5c3429`. Created: entitlement `HALE+` (`entl65c560aa42`), iOS app `HALE iOS` (`app3c59443af9`, bundle `com.haleapp.hale`). Base `https://api.revenuecat.com/v2`, header `Authorization: Bearer <key>`. **Keep this key until §8 offering/products are created, then revoke** — NOT used by the app at runtime. (Org key `os_v2_org_…` previously pasted was wrong/rotate it.)
- **Fresh onboarding:** `xcrun simctl keychain <UDID> reset` then relaunch.
- **Deep links:** `hale://sos`, `hale://paywall`, `hale://u/<inviterId>`.
- **Test users (throwaway):** latest fresh-onboarded users exist; one was backdated 8 days via a now-DELETED `convex/_devseed.ts` then relapsed — ignore their quit dates.

## Locked architecture decisions (do NOT undo)
1. **quitAttempts:** current clean-time (resets on relapse) vs LIFETIME ledger (never zeroed, anti-shame). `users.currentStreak` etc. = denormalized cache written ONLY by checkIn/logRelapse.
2. **Anonymous auth** (`@convex-dev/auth`); signup deferred to commit. `getAuthUserId` guards.
3. **Timezone/localDate** everywhere (`convex/model/streak.ts`). hardestHour 0-23 local.
4. **Trial: app-managed 14-day** — Convex owns `trialStartedAt/trialEndsAt` (`convex/model/trial.ts`, `TRIAL_LENGTH_DAYS=14`); granted at onboarding; `hasAccess = premium || trialActive`; paywall gates after expiry. RC owns the paid sub.
5. **PostHog: ONE shared client** — `posthog` singleton in `src/lib/analytics.ts`, passed to `<PostHogProvider client={posthog}>`. Do NOT call `initAnalytics()` separately (would spawn a 2nd client → persistence clash). `goals.tsx`/`experiments.ts` use `usePostHog()` = same instance.
6. **NativeWind, NOT Tamagui** (hybrid; only `welcome.tsx` Tamagui). Migration decision still open (see above).
7. **Anti-shame:** relapse → kind recovery (lifetime preserved), comfort before reflection.
8. **Anton `Display`:** defaults to `leading-tight`; callers must stay ≥ ~1.1× (never `leading-none`/`leading-[0.9x]`) or glyphs clip.

## Commits on `main` — pushed to `s-k-28/hale` through `91cbeb7`
Prior: …I4 · I3 nudge (`965b6ae`) · linkOneSignal (`752c2c5`) · §8 trial backbone (`328d1a3`) · §9 cap (`9009539`) · handoff/chore (`4abea35`).
**2026-06-02 evening (all verified, pushed):**
- `9646895` fix(push): mount usePushTags so OneSignal actually links the device
- `d9a8aa5` fix(sage): surface Anthropic failures + structure system prompt for caching
- `4279f84` fix(analytics): deliver events to PostHog (shared client) + has_buddy cohort  ← **the keystone fix**
- `f864dfc` fix(ui): stop Anton glyph clipping on hero text (leading-tight floor)
- `60cddaa` feat(#9): complete push routing — data.kind tags + tap deep-linking
- `fb54c92` feat(rc): identify the RevenueCat purchaser (app_user_id == Convex id)
- `91cbeb7` chore(analytics/aso): goals via track() taxonomy, app description, Phase-2 doc

## Live-verification log (2026-06-02 evening, Maestro + PostHog)
Fired + (where noted) confirmed in PostHog dashboard this pass: counter_viewed, checkin_completed, craving_sos_opened/logged/survived, coach_session, coach_message_sent, analytics_viewed{locked:false}, relapse_logged, onboarding_started, plan_viewed, quit_committed, trial_started, card_shared, paywall_viewed, buddy_invited. Anton fix verified on every affected screen. Sage chat returns the warm fallback (Anthropic no credits). I4 recovery shows lifetime $ + best-streak preserved.

## 💳 Paywall placement — RESEARCH RECOMMENDATION (workflow `w8b6miskz`, 21 agents, stats verified)

**DECISION: hard-placed, soft-economics trial-start paywall on Day 0, immediately after the plan-reveal.**
Flow: 7-question quiz → personalized plan-reveal ($ saved + health milestones = the aha moment) → **NEW mandatory `TrialStartPaywall`** → app. The screen is non-dismissible as a *gate*, but the CTA is **"Start my 14-day free trial — no card needed"** (NOT pay-now). Keep the 14-day trial + the `hasAccess` expiry gate. Add ONE discounted win-back for decliners. **Do NOT** defer the first paywall to trial-expiry, and **do NOT** go ungated/freemium.

**Why (verified stats):** 82% of trial starts happen Day-0 (RevenueCat 2025) → must surface trial in session 1. Onboarding-paywall+trial = **1.78% install→paid, the highest-converting placement** (Adapty 2026, 16k apps). Moving the paywall into onboarding *after* a value reveal gave a **5× lift, 3%→15%** (RevenueCat Greg case study). Hard placement earns **~8× revenue/install by D60** with ~identical 1-yr retention (RevenueCat 2026). No-card trial avoids the **5.8% vs 3.4% refund** hit of pay-now (RevenueCat 2024) while filling a bigger funnel. 14-day length is right — **17-32d trials convert 45.7% vs 26.8% for 3-7d** (habit formation). Health&Fitness has the highest install LTV ($1.21) and trials beat direct-buyers there (Adapty 2026).

**Implementation (reuse existing RC paywall screen — just sequence it):**
1. Insert `TrialStartPaywall` between plan-reveal and entering the app; non-dismissible gate, CTA "Start 14-day free trial — no card". Annual $49.99/yr default/best-value, monthly $9.99/mo secondary.
2. CTA → existing Convex trial mutation (sets `trialStartedAt/trialEndsAt`) → then route in; app entry conditioned on `hasAccess` (trial or premium) true from screen 1.
3. Personalize headline with quiz data ("Your plan to quit by [date] and save $[projected] is ready"); say "free trial · no card · cancel anytime".
4. ONE win-back screen for decliners (discounted annual or "continue with limited access"), shown once — no per-session nagging.
5. At expiry (`trialActive→false`), `hasAccess` gate should route to the paywall in **convert-now mode** (charge), not a dead-end lockout — verify this path surfaces a CTA.
6. 2–3 achievement-framed trial-end push reminders scheduled off `trialEndsAt` (value-recap + last-day), not generic "trial ends".
7. Instrument funnel in PostHog: quiz_complete, plan_reveal_view, paywall_view, trial_start, winback_view/convert, trial_to_paid + Day-0-vs-later.
8. First A/B test once live: A = single-screen paywall vs B = 2–3 step value-recap before CTA (structural tests win most).

**Risks / caveats:** quiz-fatigue drop before the gate (watch quiz_complete→paywall_view); **App Store compliance** — a no-card auto-converting trial must disclose price/renewal/cancel clearly + follow auto-renewable-sub rules or it gets rejected; Day-0 cancel spike; ~35% of annual subs cancel auto-renew in Month 1 → reinforce value weeks 1-4; international pricing (4.4× variance) is a later optimization. **Do NOT rely on two stats that FAILED verification:** Superwall "multi-step / mention free-trial 5-7× → 15%→34%" and "21% higher 1-yr LTV for hard paywalls" — treat multi-step copy as an A/B hypothesis only.

**Sources (all [VERIFIED]):** RevenueCat State of Subscription Apps 2024/2025/2026 + Greg case study; Adapty State of In-App Subscriptions 2026 + Health&Fitness benchmarks; ChartMogul 2026 (via Pulseahead).

> NOTE: this contradicts the earlier "no hard paywall in onboarding" lean — the data favors a hard *placement* with *soft* (no-card trial) economics. The current build lands users on Today with no onboarding paywall; implementing this = add the `TrialStartPaywall` step (pending user OK).
