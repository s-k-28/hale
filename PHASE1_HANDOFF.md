# HALE — Phase-1 Build Handoff (resume after context clear)

**Repo:** `~/hale` · git `main` (remote `s-k-28/hale`, **pushed through `7c094f7`** as of 2026-06-02 session).
**Stack (LOCKED):** Expo ~56.0.8 · RN 0.85.3 · React 19.2.3 · Hermes v1 · New Arch · **NativeWind ^4.2.4** · Convex (`good-canary-630`) · `@convex-dev/auth` (anonymous) · expo-router (typedRoutes + reactCompiler).

## The bar
Ultrathink before code. ExecBro = done-gate (run live, screenshot, confirm `[ev]`). No placeholders/hardcoded. Commit each increment. **A feature is "passed" only at its PRD exit criteria, not when it compiles.** Phase 1 isn't done until all 10 pass.

## Verification harness
- **Sim:** iPhone 17 Pro UDID `755B55D9-8E4B-431C-9D1D-A635F38CFF5F`.
- **Metro:** port 8081, cwd `~/hale`, log `/tmp/hale-metro-spike.log`. Restart: kill :8081 node, `cd ~/hale && nohup npx expo start --port 8081 --clear > /tmp/hale-metro-spike.log 2>&1 &`.
- **ExecBro MCP:** `scan_metro`. **CDP 401** → JS introspection blocked; use `ios_screenshot`/`tap`(strategy:"accessibility", axe at /opt/homebrew/bin/axe)/`swipe`/`ios_open_url`.
- **Client events:** `track()` logs `[ev] <name> <props>` to Metro log in `__DEV__`. `grep -aE "\[ev\]" /tmp/hale-metro-spike.log`. (Drops some in-burst lines on this 401 connection — confirm via Convex when in doubt.)
- **Server events:** Convex actions `console.log('[ev:server] …')` → `npx convex logs --history N`.
- **Convex:** `npx convex data <table>` (read) · `npx convex run <fn>` (run) · deploy `npx convex dev --once --typecheck disable` (REQUIRED flag — pre-existing process.env type errors in pushes/sage/email/http/auth.config).
- **Fresh onboarding:** keychain survives uninstall → `xcrun simctl keychain <UDID> reset` then relaunch.
- **Deep links:** `hale://sos`, `hale://u/<inviterId>`.
- **Test users:** current `m977q7gwpr70m6vt5pwsxjpfqs87tc38` (buddy "Sid" `m97fwmct5bb0fvx5gm00k7cp2x87t6b0`). Seed rows: `npx convex import --append --table <t> <jsonl> --yes`.

## 10 features — passed vs code-done-pending-keys
| # | Feature | State | Gap to "passed" |
|---|---------|-------|-----------------|
| O1 | Onboarding | ✅ behavior verified live | metric delivery needs PostHog key |
| P1/P2 | Today counter/check-in/freeze | ✅ behavior verified live | metric delivery needs PostHog key |
| S1/S2 | Buddy pairing + nudge | ✅ behavior verified live | metric delivery needs PostHog key |
| I1 | Craving SOS + real log | ✅ behavior verified live | metric delivery needs PostHog key |
| I4 | Relapse recovery | ✅ behavior verified live | metric delivery needs PostHog key |
| I2 | Sage coach | 🟡 code-done, plumbing verified | **ANTHROPIC_API_KEY** (real replies; currently fallback) |
| I3 | Proactive hardest-hour nudge | 🟡 code-done, logic verified (`{nudged:1}`→`0`); **link mutation now DONE** (`752c2c5`) | **OneSignal keys** (push delivery) + dev rebuild |
| P3 | Milestone cards + share | ✅ **behavior verified LIVE** (overlay + both share paths) | metric delivery needs PostHog key |
| 8 | Paywall + trials | 🟢 **trial backbone DONE + live-verified** (`328d1a3`): 14-day grant, `trial_started`, `hasAccess` gate unlocks analytics for trial users; paywall+webhook exist | **RevenueCat** key+config (real purchases) + onboarding paywall-placement UX decision; **Resend** key (trial emails) |
| 9 | Notifications | 🟢 **cap 2/day DONE + verified** (`9009539`, `true,true,false`); **link mutation DONE** (`752c2c5`) | **OneSignal keys** (delivery); verify full PRD class set (handoff noted "2/4" — re-audit) |
| 10 | Polish/ASO | 🔴 screens coded; app.json no ASO, eas.json submit empty; **Anton clip still open** | metadata + Apple submit config + Anton glyph fix |

**Behavior-verified live: O1, P1/P2, S1/S2, I1, I4, P3 (6) + §8 trial grant/gate. Code-done pending keys: I2 (Anthropic), I3 (OneSignal). §8 pure-code DONE (RC key for purchases). §9 pure-code DONE (OneSignal key for delivery).**

**Trial model (LOCKED 2026-06-02): app-managed** — Convex owns `trialStartedAt/trialEndsAt` (14 days), granted at onboarding; paywall gates after expiry. RevenueCat owns the paid sub. `trialStatus`/`TRIAL_LENGTH_DAYS` in `convex/model/trial.ts`.

## Keys still needed (exact var → location → unblocks)
| Key | Where | Unblocks |
|-----|-------|----------|
| `EXPO_PUBLIC_POSTHOG_KEY` (= PostHog "Project API Key", `phc_…`; opt `EXPO_PUBLIC_POSTHOG_HOST`) | `~/hale/.env.local` (restart Metro) | **event DELIVERY → metrics for ALL 10** (highest leverage) |
| `ANTHROPIC_API_KEY` (`sk-ant-…`) | Convex: `npx convex env set ANTHROPIC_API_KEY …` | I2 Sage real Claude replies |
| `EXPO_PUBLIC_ONESIGNAL_APP_ID` | `~/hale/.env.local` | OneSignal SDK init + external-id login on device |
| `ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY` | Convex: `npx convex env set …` | server push SEND (I3, streak, buddy) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`) + RC dashboard product/entitlement "HALE+" + webhook→Convex http + App Store Connect product | `.env.local` + RC/ASC dashboards | Paywall real purchases + premium |
| Resend key (check `convex/email.ts` for var) | Convex env | trial-reminder emails (lowest — most users anonymous) |

OneSignal also requires a **dev rebuild** (native plugin) before any user is targetable.

## The one PURE CODE gap (no key) — ✅ CLOSED (`752c2c5`)
`users.linkOneSignal({ externalId })` now writes `oneSignalExternalId` (auth-guarded, idempotent); `loginOneSignal` returns whether the SDK actually logged in; `usePushTags` persists the link only for real (non-scaffold) devices. Unblocks I3 + streak-at-risk delivery once OneSignal keys land. (Backend verified live; the client write needs OneSignal key + dev rebuild to exercise on-device.)

## Locked architecture decisions (do NOT undo)
1. **quitAttempts:** current clean-time (resets on relapse) vs LIFETIME ledger (never zeroed, anti-shame). `users.currentStreak` etc. = denormalized cache written ONLY by checkIn/logRelapse.
2. **Anonymous auth** (`@convex-dev/auth`); signup deferred to commit. `getAuthUserId` guards authed mutations.
3. **Timezone/localDate** everywhere (`convex/model/streak.ts:localDateOf/localHourOf`). hardestHour 0-23 local.
4. **NativeWind, NOT Tamagui.** Tamagui spike+foundation+welcome built then **PAUSED by user**; coexists (welcome=Tamagui, rest=NativeWind). Do NOT resume migration unless user re-decides.
5. **Anti-shame (Decision 3):** relapse → kind recovery (lifetime preserved), comfort before reflection.

## Open cross-cutting
- **Anton word-headline clip:** `Display` (Anton) with `leading-[0.9]`/`leading-none` clips round letters. Numeric Displays fixed (→`leading-tight`). **Confirmed live 2026-06-02 on 3 screens:** You-card hero (`0`→`U`), paywall headline (`GO`→`GU`), card prices (`$39.99`→`$39.YY`). Headlines pending a polish pass (Display default lineHeight or swap those leadings). Part of #10.
- **Onboarding paywall placement (UX decision pending):** with an app-managed trial, a hard RC paywall mid-onboarding conflicts with "everyone gets 14 days free". Decide where/whether the paywall surfaces in onboarding before wiring it.
- **Tamagui (parked 2026-06-02):** user asked to "use Tamagui.dev" but deferred the actual decision until UI work resumes. Decision options on the table: full migration / Tamagui-for-new-UI-only / just-consult-docs. Still NativeWind everywhere except welcome.tsx.

## Remaining priority order
1. **§8 finish:** RevenueCat key + config (real purchases) + onboarding paywall-placement decision. (Backbone done + verified.)
2. **§9 finish:** OneSignal keys + dev rebuild (delivery) + re-audit the PRD notification class set ("2/4" note).
3. **PostHog key** — unblocks metric delivery for ALL 10 at once (highest leverage).
4. **I2** Anthropic key (real Sage). **Tamagui decision + Anton clip** (#10 polish). **#10 ASO** metadata.

## Commits on `main` — pushed to `s-k-28/hale` through `9009539`
Prior session: …I4 relapse_recovered · handoff doc · I3 proactive nudge (`965b6ae`).
**2026-06-02 session (all verified):** `752c2c5` linkOneSignal (push link gap CLOSED) · `328d1a3` §8 app-managed 14-day trial backbone (grant+gate+reminder sweep, live-verified) · `9009539` §9 push fatigue cap 2/user/local-day (live-verified) · plus a `chore` commit (handoff update + tsconfig nativewind-env + shadcn registries + onboarding mockups).

## 2026-06-02 live-verification log (sim)
Fresh onboarding → new user `m977rje4qac4aysaz3e22j62dd87xvbv` (vape). Events captured in Metro log: `onboarding_started → plan_viewed → quit_committed → trial_started{trial_days:14} → counter_viewed → paywall_viewed → card_shared{day:0,source:profile} → milestone_reached{day:7} → card_shared{day:7,source:milestone} → analytics_viewed{locked:false}`. DB: `trialEndsAt`=now+13.998d, `trialReminderSent:false`. §9 cap: `pushes:tryConsumePushBudget(cap=2)` → `true,true,false`. **NOTE:** that test user was backdated 8 days (via a now-DELETED `convex/_devseed.ts` temp mutation) to trigger the day-7 milestone — it's a throwaway; ignore its quit date.
