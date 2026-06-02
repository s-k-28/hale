# HALE — Phase-1 Build Handoff (resume after context clear)

**Repo:** `~/hale` · git `main` (remote `s-k-28/hale`, **local commits NOT pushed**).
**Stack (LOCKED):** Expo ~56.0.8 · React Native 0.85.3 · React 19.2.3 · Hermes v1 · New Architecture · **NativeWind ^4.2.4** · Convex (deployment `good-canary-630`) · `@convex-dev/auth` (anonymous) · expo-router (typedRoutes + reactCompiler).

## The bar (hold throughout)
Ultrathink before code (esp. data flow / failure / empty+error states). ExecBro is the **done-gate**: run live on device, screenshot/verify, confirm the `[ev]` event fires. No placeholders / no hardcoded values. Commit each increment. **A feature is done only when it hits its PRD exit criteria, not when it compiles.** Don't call Phase 1 done until all 10 pass.

## Verification harness (how to actually verify)
- **Simulator:** iPhone 17 Pro, UDID `755B55D9-8E4B-431C-9D1D-A635F38CFF5F`.
- **Metro:** port 8081, cwd `~/hale`, log at `/tmp/hale-metro-spike.log`. Restart: kill the :8081 node, then `cd ~/hale && nohup npx expo start --port 8081 --clear > /tmp/hale-metro-spike.log 2>&1 &`.
- **ExecBro (MCP):** `scan_metro` to attach. **CDP is 401** → JS introspection (get_logs / component tree / execute_in_app) is BLOCKED. Use `ios_screenshot`, `tap` (axe driver installed at `/opt/homebrew/bin/axe`), `swipe`, `ios_open_url`. Tap with `strategy:"accessibility"` (fiber path is 401'd).
- **Event firing:** `track()` (src/lib/analytics.ts) logs `[ev] <name> <props>` to the Metro log in `__DEV__`. Verify events: `grep -aE "\[ev\]" /tmp/hale-metro-spike.log`.
- **Convex reads:** `cd ~/hale && npx convex data <table>` (users, quitAttempts, checkIns, cravings, buddyLinks, nudges, sageMessages, feedEvents).
- **Convex deploy:** `npx convex dev --once --typecheck disable` (REQUIRED flag — there are **pre-existing** `process.env` type errors in pushes/sage/email/http/auth.config that block the typecheck; they are not ours).
- **Fresh onboarding:** the iOS keychain (Convex auth token via expo-secure-store) **survives app uninstall** on the sim. To force a fresh first-time user: `xcrun simctl keychain <UDID> reset` then relaunch.
- **Deep links:** `hale://sos`, `hale://u/<inviterId>` (buddy invite).
- **Test users (Convex):** current = `m977q7gwpr70m6vt5pwsxjpfqs87tc38` (paired with buddy **"Sid"** `m97fwmct5bb0fvx5gm00k7cp2x87t6b0`). Seed a nudge: `npx convex import --append --table nudges <file.jsonl> --yes`.
- **PostHog MCP** connected (org "HALE") — use it to confirm event **delivery** once the key is set (see open items).

## 10 Phase-1 features
| # | Feature | Status | Notes / files |
|---|---------|--------|---------------|
| O1 | Onboarding quiz→plan→commit | ✅ **VERIFIED** | Auth-race fixed (commit gates on `useConvexAuth().isAuthenticated`). welcome.tsx is **Tamagui**; rest NativeWind. `src/app/(onboarding)/welcome.tsx`, `quiz.tsx`; `convex/users.ts:completeOnboarding`. Events onboarding_started/plan_viewed/quit_committed. |
| P1/P2 | Today: counter + check-in + freeze | ✅ **VERIFIED** | `counter_viewed` fires; `streak_freeze_used` wired (freeze-path live-fire still needs a 1-day-gap sim). `src/app/(tabs)/today.tsx`, `convex/users.ts:todayState`, `checkins.ts`, `model/streak.ts`, `model/plan.ts`. |
| S1/S2 | Buddy pairing + nudge | ✅ **VERIFIED** | Deep-link `u/[id]` + auto-pair on first-open; nudge inbox on Today fires nudge_opened. `src/app/u/[id].tsx`, `src/lib/pendingBuddy.ts`, `convex/buddies.ts`, `convex/nudges.ts` (myNudges joins sender name), `squad.tsx`, `today.tsx:NudgeInbox`. |
| I1 | Craving SOS + log | ✅ **VERIFIED** | `CravingLogCapture` = real intensity(1-5)/trigger/context → Convex (no hardcoding). craving_logged/survived fire; sos_opened double-fire fixed; Sage handoff no longer fake-logs. `src/app/sos.tsx`, `convex/cravings.ts`. |
| I4 | Relapse recovery | ✅ **VERIFIED** | relapse_recovered fires w/ trigger; `quitAttempts.endTrigger` stored via `noteRelapseTrigger`; anti-shame (lifetime preserved). `src/app/sos.tsx:RecoverKindly`, `convex/relapse.ts`, `schema.ts`. |
| I2/I3 | Sage coach + proactive nudge | 🟡 **NEXT** | Sage chat + Claude action BUILT but **NOT verified live**: `convex/sage.ts` (send / generate=action→Claude / contextFor / writeReply), `src/app/(tabs)/coach.tsx`; coach_message_sent/coach_session wired. **I3 proactive nudge ENTIRELY MISSING** — no cron using `users.hardestHour`; `proactive_nudge_sent` never fires. Free-tier msg limit absent. Now has real craving/trigger data (I1+I4) for context. |
| P3 | Milestone cards + share | 🟡 remaining | Code-complete, **never run live**. `src/components/MilestoneCelebration.tsx`, `TransformationCard.tsx`, today.tsx celebration trigger; milestone_reached/card_shared wired; uses expo-linear-gradient (not skia). Verify: hit a landmark day → celebration + native share. |
| Paywall | trials | 🟡 remaining | Paywall renders + RevenueCat webhook (`convex/http.ts`) + `setPremiumByExternalId` wired. **Trial system STUBBED**: `convex/email.ts:trialReminderSweep` is a TODO; NO trial fields in schema; `trial_started` NOT in Ev map; no post-quiz solo/buddy gate. `src/app/paywall.tsx`. |
| Notifications | cap 2/day | 🟡 remaining | 2/4 push classes (friend nudges, streakAtRisk cron). **Hard cap 2/day promised in UI but ZERO implemented** (no pushLog table). hardest-hour proactive missing. `convex/pushes.ts`, `crons.ts`, `nudges.ts`, `src/lib/onesignal.ts`, usePushTags hook. |
| Polish/ASO | hero screens + submit | 🟡 remaining | Screens coded. `app.json` has ZERO ASO metadata; `eas.json` submit is an empty placeholder (no Apple config/creds/privacy manifest). |

**Score: 5/10 verified** (O1, P1/P2, S1/S2, I1, I4).

## Locked architecture decisions (do NOT undo)
1. **quitAttempts model:** current clean-time (resets on relapse, honest) is separate from the LIFETIME ledger (`lifetimeCleanDays`/`lifetimeMoneySaved`, NEVER zeroed — anti-shame). `users.currentStreak` etc. are a denormalized cache written ONLY by `checkIn`/`logRelapse` mutations.
2. **Anonymous auth (Decision 2):** users created via `@convex-dev/auth` anonymous sign-in; sign-up deferred to the commit step. `getAuthUserId(ctx)` guards all authed mutations.
3. **Timezone / localDate:** streak + craving math is timezone-aware (`users.timezone` IANA; `localDateOf`/`localHourOf` in `convex/model/streak.ts`). Check-ins dedup by `localDate`.
4. **NativeWind, NOT Tamagui.** PRD specced NativeWind; nothing was broken. A Tamagui migration was spiked + foundation built (`tamagui.config.ts`, `src/components/tama.tsx`, `TamaguiProvider` in `_layout.tsx`, welcome.tsx ported) then **PAUSED by user decision** to finish features first. Tamagui coexists (welcome = Tamagui, rest = NativeWind). **Do NOT resume the migration unless the user re-decides.**
5. **Anti-shame (Decision 3):** relapse routes to a kind recovery flow that surfaces lifetime saved + best streak; never a zero-void; comfort before reflection.

## Open cross-cutting items
- **PostHog DELIVERY blocked:** `EXPO_PUBLIC_POSTHOG_KEY` is NOT in `~/hale/.env.local`, so `track()` only logs to the device (no delivery to the PostHog dashboard). Events are FIRING-verified via the `[ev]` log. To enable delivery: user adds the `phc_` ingestion key (PostHog → `/settings/project`) to `.env.local`; then `initAnalytics()` wires the client and the PostHog MCP can confirm arrival. (`src/lib/analytics.ts`.)
- **Anton headline clip (polish pass):** `Display` (Anton) with `leading-none`/`leading-[0.9]` clips round glyphs. FIXED on numeric Displays (today counter, reveal $, commit $, sos timer, recovery stats → `leading-tight`). STILL CLIPS on uppercase WORD headlines using `leading-[0.9]` ("THIS PASSES" sos.tsx, "FRESH RUN", "NOT THE END", etc.). Fix idea: give `Display` a safe default lineHeight, or swap those `leading-[0.9]`→`leading-tight`.

## Remaining priority order
1. **I2/I3** — verify Sage works live (chat → Claude reply < 3s, coach_message_sent/coach_session), then build the **proactive hardest-hour nudge** (cron reading `users.hardestHour` → OneSignal → `proactive_nudge_sent`). Add free-tier msg cap.
2. **Paywall trial system** — schema trial fields + implement `trialReminderSweep` + add `trial_started` to Ev map + post-quiz solo/buddy gate.
3. **Notification 2/day cap** — pushLog table + cap check in send paths; wire `proactive_nudge_sent`.
4. **P3 verify** — milestone celebration + card share, live.
(Then #10 Polish/ASO if in scope.)

## Recent commits on `main` (this session, not pushed)
auth-race + hero-clip fix · global.css · Q1 icon · Tamagui foundation+welcome · streak_freeze_used · buddy pairing deep-link · nudge inbox · analytics dev-log · I1 craving capture · sos Anton clip · I4 relapse_recovered.
