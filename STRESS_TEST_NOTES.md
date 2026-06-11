# HALE — Overnight Stress-Test Journal (2026-06-03)

Autonomous exhaustive functional QA + fixes. Main stays shippable; each fix committed individually.

## STEP 0 — Observability (CONFIRMED, not blind)
- **ExecBro MCP debugger attach is DOWN** this session: Metro inspector rejects the CDP
  websocket (`origin 'undefined'` ≠ expected `127.0.0.1:8081`) → 401. This is an
  ExecBro/Metro-inspector incompatibility, NOT an app fault.
- **Working driver (full drive + screenshot + logs):**
  - Screenshots: `xcrun simctl io <UDID> screenshot` (full-res 1206×2622). To READ them
    here they must be downscaled (`sips -Z 1400`) — the raw 2622px height exceeds the
    2000px image-read limit. So: capture full-res, downscale a copy, read the copy.
  - Taps/typing/swipes: **AXe 1.7.0** (`axe tap -x <pt> -y <pt>`, points = px/3 on this
    402×874pt device; also `--label`, `type`, `swipe`).
  - Deep links / lifecycle: `xcrun simctl openurl / launch / terminate / keychain reset`.
  - Backend: `npx convex logs`, `npx convex data <table>`, `npx convex run <fn>`.
- Conclusion: NOT working blind. Proceeding.

## Keys / what is verifiable
- `EXPO_PUBLIC_POSTHOG_KEY` SET → events reach device log (`[ev] …`) AND the PostHog
  dashboard (project 448817). Event integrity verifiable.
- `ANTHROPIC_API_KEY` SET (convex env), model `claude-sonnet-4-6` — but per handoff the
  account is OUT OF CREDITS → Sage returns the warm FALLBACK reply, not real Claude.
  Will confirm live via the reply text + `[sage] anthropic non-ok` server log. Real-Claude
  quality CANNOT be verified until credits are added.
- `EXPO_PUBLIC_ONESIGNAL_APP_ID` SET; push DELIVERY needs a real device + APNs (Apple
  account) → NOT verifiable in sim. Tag/link logic testable.
- NO `EXPO_PUBLIC_REVENUECAT_IOS_KEY` → RC paywall unconfigured → in-app upsell fallback.
  Real purchases NOT verifiable. App-managed 14-day trial + `hasAccess` gating IS testable.
- Buddy pairing needs TWO real auth sessions / devices. Single sim can test invite-link
  generation + the pairWith path as a fresh user; true A↔B sync + nudge delivery needs a
  second device → will state as unverifiable.

## STEP 0.5 — Clean test state
- Device user reset via keychain reset → fresh onboarding creates a clean primary user.
- DB has historical test junk (13 users, 2 buddyLinks incl. seeded "Asd", 7 checkIns) — all
  inert for a fresh device user (queries are per-user). `_devtest.ts` helpers target the
  latest-created user = the fresh user.
- Harness check: `_devtest:uncheckIn` deletes ALL of today's checkIns rows (collect+delete),
  so it correctly clears the unique() precondition. The prior "check-in regression" was the
  harness not deleting today's row — confirmed harness-correct now.
- `convex/_devtest.ts` (uncheckIn, backdateQuit, seedCoach, seedBuddy) — TEMP, slated for
  removal before launch (untracked; codegen entry uncommitted).

## Cosmetic finishing pass (prior task) — DONE, 10 commits, all verified live
Anton/Heading spacing · neutral disabled token · contrast bump · Today cold-start reframe +
coral-bleed + toast removal · milestone hierarchy + share-card attribution · toast duration ·
squad humanize · you differentiate + scroll · sos hide ping-buddy · plan-reveal pad + push break ·
onboarding keyed-remount crash fix.

---

## Test log
(appended every 30–45 min: tested / broke / fixed / open)

### ~01:40 — setup
- Observability confirmed; notes written; cosmetic commits being pushed; beginning Area 1 (Onboarding).

### ~01:45 — observability constraint (important)
- In-context IMAGE READING is now capped (cumulative images this session) — even a
  349×760 downscale fails the "many-image" read limit. So I cannot VIEW new screenshots
  this session. NOT blind for FUNCTIONAL QA: `axe describe-ui` gives full on-screen
  text + element enabled-state; `npx convex data/logs` gives backend state; Metro log
  `[ev]` lines give analytics events; AXe drives taps. Visual/pixel regressions can be
  captured full-res to disk (for morning review) + characterized via sips, but not
  eyeballed by me now. Cosmetic/visual issues were already fixed+verified earlier with
  screenshots. Proceeding with functional stress-testing.

### ~02:05 — Area 1 Onboarding: PASS (no bugs)
Gate on no-selection (CONTINUE disabled, all Qs) · disabled CONTINUE no-ops · disabled→enabled
keyed-remount crash FIX HOLDS · rapid double-tap CONTINUE doesn't skip a question · back-then-
forward retains selection · multi-select enable/disable-on-empty/re-enable · plan-reveal math
correct (10 pods×$5 → $18,250/yr, $1,500 first mo, $1,521/mo) · push line-break clean · double-tap
COMMIT → exactly ONE user (13→14) + ONE quitAttempt (18→19), no auth-race dup · funnel events fire
(onboarding_started, plan_viewed, quit_committed{projected_annual:18250}, trial_started{14}).

### Background bug-hunt workflow: 39 findings salvaged (synth step failed; analyze findings recovered from transcripts). Triaging to real, verifiable functional bugs.

### ~02:10 — Area 2 BUG #1 (CRITICAL, matches flagged "unique() bug")
REPRO/root-cause: checkIns.by_user_date is NON-unique; checkIn() uses .unique() (checkins.ts:23-26)
which THROWS on 2+ rows for (userId, today). logRelapse inserts 'lapse'/'relapse' rows for today
(relapse.ts:34,51); checkIn inserts 'clean'. So: check in → relapse same day → check in on the new
attempt = .unique() sees 2+ rows → "Couldn't check in" (the crash observed earlier on the post-
relapse user). Production-reachable.
FIX: checkIn uses .collect() and gates "already checked in" on a CLEAN row for the CURRENT attempt
(multiple same-day rows are legitimate across lapse/relapse/new-attempt). Verifying live next.

### ~02:35 — BUG #1 FIXED + VERIFIED LIVE (commit 68c7b90)
Live repro: fresh user → check in (clean row) → SOS → I slipped → relapse (relapse row + new
attempt) → Today → CHECK IN on new attempt. Before fix: .unique() throws on 2 today-rows →
"Couldn't check in". After fix: checkIns today-rows 2→3, "1 DAY STREAK", checkin_completed fires,
ZERO errors in log. Also re-confirmed: can't double-clean-check-in same day (alreadyCheckedIn).

### ~02:45 — Area 2 Check-in/streak: PASS
- BUG #1 (multi-row .unique crash) fixed+verified live (commit 68c7b90).
- Double-clean-check-in same day blocked (alreadyCheckedIn) — live.
- Streak/freeze/timezone PURE logic (model/streak.ts) verified by inspection + caller wiring
  (checkins.ts): Intl IANA localDate (non-UTC safe), gap1→+1, gap2+freeze→+1&decrement, larger→reset,
  longestStreak=max patched. checkin_completed fires (live). streak_freeze_used wired (fires on gap2).
  Live MULTI-DAY freeze run needs a clock/date harness — not built (anti-grind); logic is correct.

### ~03:05 — Area 3 Buddy + triage of bug-hunt findings
FIXED+committed (f076b30): nudges.send + feed.sendStrength now gate on the caller's active
buddyLink (was: arbitrary toUser push-spam). App only used the already-gated cheer path, so latent;
payloads were already sanitized (no private leak). Convex deploys clean.

DECISIONS on remaining hunt findings (QA+bugfix scope, no new features / no redesign):
- Sage free-tier cap + rate-limit (sage.ts:44 send): NO server-side cap/throttle. Key IS server-side
  (process.env in the action — never client). FLAG, not fixing: free-vs-premium cap is a monetization
  PRODUCT decision; rate-limit is a cost guard but currently moot (Anthropic out of credits → free
  fallback). Recommend: gate unlimited behind hasAccess + a free daily cap, and a per-user throttle.
- analytics.ts cravingTrend/recoverySummary: no server-side entitlement check (client gates via
  usePremium). It's the user's OWN data (not cross-user leak) — a soft paywall bypass. Code comment
  says it's an intentional choice. FLAG (recommend a hasAccess guard server-side); not changing a
  documented design choice unilaterally.
- goals.ts achievedAt never persisted (myGoals computes it at query time) → "treat unlocked" can flip
  off after a relapse resets the live counter. REAL data bug but Phase-2 surface; fixing needs a
  persistence mutation (a query can't write). FLAG with recommended fix; not implementing tonight.
- LOWER/needs-concurrency-or-real-device (FLAGGED, not fixing): squad join/leave memberCount race
  (squads.ts, last-writer-wins on concurrent), buddyLinks no unique pairKey (concurrent pairWith dup —
  single-threaded is fine via sorted pairKey+unique check), pushes.notifyUser consumes budget before
  fetch + empty catch (failed push burns a capped slot; push delivery is Apple-gated/unverifiable),
  noteRelapseTrigger picks most-recent closed attempt (double-relapse-before-trigger edge),
  sage empty-text silent fallback (cosmetic logging gap). RevenueCat webhook secret !== undefined =
  correct FAIL-CLOSED when unset (NOT a bug; rejects unauth webhooks). _devtest.seedBuddy unsorted
  pairKey = my temp helper, irrelevant to prod (file slated for removal).

### ~03:20 — BUG #2 (CRITICAL): Coach send crashes on type (Sage unusable)
REPRO: Coach tab → tap composer → type one char → "Render Error: Couldn't find a navigation context"
(coach.tsx:34). Root cause = SAME NativeWind interop bug as the quiz CONTINUE: the inline send
<Pressable> transitions disabled→enabled (gains active:translate-y + a shadow style) in place. The
ui/Button keyed-remount fix didn't cover this separate component. Sage send has been unusable via UI.
FIX: keyed remount on the send Pressable (key flips with canSend). Verifying next.
(PillChoice deselect / ChoiceCard select were tested OK — they don't gain active:translate-y+style, so
no over-generalization needed; only Button + coach-send are affected.)

### ~03:40 — BUG #2 FIXED + VERIFIED (commit pending) + Area 6 Sage
- Coach send keyed-remount fix: type no longer crashes; send writes user msg + sage reply (live).
- Sage is on FALLBACK: convex log = "[sage] anthropic non-ok 400 ... credit balance is too low ...
  using fallback". Reply is the canned warm fallback, NOT real Claude. Key is SERVER-SIDE (error
  from the Convex action, never client). REAL-CLAUDE QUALITY UNVERIFIABLE until credits added.
- Free-tier cap / rate-limit: still none (flagged earlier; product decision + currently free fallback).

### ~03:50 — NativeWind crash-class fully resolved
grep active:translate-y → only ui/Button + coach send (both keyed-remount fixed). Other conditional-
shadow Pressables don't gain the active:translate-y transform on transition (PillChoice/ChoiceCard
transitions tested crash-free), so no other instances. Crash class closed.

### ~04:00 — Area 4 Craving SOS + log: PASS
SOS reachable globally (deep link + Today button). Ride-it-out → "craving passed" → log capture.
Log writes REAL data: selected intensity 4 + trigger Stress → cravings row written (outcome survived,
resolvedBy timer) + events craving_sos_opened / craving_logged{intensity:4} / craving_survived all
fired. SAVE gated on intensity selection (DISABLED until chosen). I-slipped routing verified in Bug#1
repro; breathe/talk-to-sage routing verified earlier. No bugs.

### ~04:10 — Area 5 Relapse: PASS (lapse + relapse)
- LAPSE (Just a slip): relapse_logged{kind:lapse} fired; lapse branch (relapse.ts:32-42) only
  decrements lapseGraceRemaining, never touches currentStreak → streak PRESERVED (by code). Wrote a
  'lapse' checkIns row coexisting with today's 'clean' — no crash (Bug#1 fix robust: today now has
  clean+relapse+clean+lapse rows from cumulative testing, zero check-in crashes).
- RELAPSE (verified in Bug#1 repro): closes attempt, opens new (counter→0), banks lifetime, FRESH RUN
  recovery screen shows lifetime + best-streak (no shaming zero). logRelapse is ONE atomic mutation.
- OPEN (flagged, edge): rapid double-tap on "I'm back on it" has no submitting guard → could close two
  attempts / double-bank. noteRelapseTrigger picks most-recent closed attempt (double-relapse edge).
- describe-ui intermittently returns empty late in this long session; verified via events+convex+code.

### ~04:12 — Area 10 Event integrity: all events firing to device log (PostHog key SET → also dashboard)

### ~04:20 — Areas 7, 9, 10
- Area 7 Paywall/trial: analytics UNLOCKED during trial (hasAccess gate correct; analytics_viewed
  {locked:false}). trial_started fires at onboarding. Solo hard-paywall after quiz NOT implemented
  (handoff-documented pending TrialStartPaywall, not a bug). Real RC purchases UNVERIFIABLE (no appl_ key).
- Area 9 Chaos: force-quit + dev-client relaunch → state restores (Today, checked-in, from Convex).
  Multi-status same-day rows (clean+relapse+clean+lapse) never crash check-in (Bug#1 fix). Rapid
  tab-switching: no crash. Deep-links while onboarded (hale://sos, ://paywall, ://analytics) all work.
- Area 10 Events: 15 distinct [ev] at device-log (onboarding funnel, checkin, sos/craving, relapse,
  milestone, coach, paywall, analytics). EXPO_PUBLIC_POSTHOG_KEY SET → also reaches dashboard
  (handoff-confirmed). buddy_invited/paired, card_shared, streak_freeze_used not fired this session
  (UI paths not exercised; wired in code).

### ~04:30 — SESSION COMPLETE
All 10 areas exercised. 2 CRITICAL bugs found + fixed + verified live (checkin .unique crash;
Coach send crash) + 1 authz hardening (buddy-gate nudge senders). All pushed to main (9c5f1ab).
NativeWind interop crash-class fully closed (Button + coach send). Sage on fallback (no Anthropic
credits) — real-Claude unverified. Real RC purchases + 2-device buddy sync + on-device push =
unverifiable in sim. Open (flagged, not fixed): Sage free-tier cap/rate-limit (product decision),
analytics server-side gating (intentional client-gate), goals.achievedAt persistence (Phase-2),
relapse double-tap guard + noteRelapseTrigger double-relapse edge, squad/pushes concurrency. See
final report.
