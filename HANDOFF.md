# HALE — Standout-Moments Animation Sprint · HANDOFF

Autonomous session. **Mandate:** make 4 emotional-peak moments exceptional —
check-in, milestone celebration, live counter, relapse warmth — via Rive/Lottie +
Reanimated 4. Additive motion only. **Never** re-plumb SOS/paywall, **never** touch
locked architecture, **main shippable every commit**, and verify EACH moment live on
device (ExecBro) before claiming done — animation can't be judged from code.

## Verification loop (CDP is down — see NOTES.md)
- **Visual:** ExecBro `ios_screenshot` (simctl — works without CDP)
- **Interaction:** ExecBro `tap` (AXe native — works without CDP)
- **Console:** `grep -aE "\[ev\]|ERROR|WARN" /tmp/hale-build.log` (app console DOES reach
  Metro's stdout here — confirmed `[ev] counter_viewed`)
- **Re-trigger check-in for testing:** `npx convex run _devtest:uncheckIn '{}'`
  (⚠️ TEMP — `convex/_devtest.ts` must be REMOVED before launch)
- Do NOT call ExecBro CDP tools (`scan_metro`/`get_logs`) — they 401 and spam the log.

## Toolkit (all native modules linked into the dev client by the rebuild)
reanimated 4.3.1 (+worklets), expo-haptics, @shopify/react-native-skia 2.6.2,
lottie-react-native 7.3.8, rive-react-native 9.8.3. Build Succeeded, 0 errors.

## Log (newest first)

### Duolingo-architecture pass — COMPLETE (system-first, all 7 screens, user-approved)
Extracted Duolingo's STRUCTURAL architecture (focal hierarchy, depth/layering,
type ramp, spacing rhythm, directed motion, mascot-warmth) and applied it 100%
inside HALE's identity (void + electric-lime + coral; NO green/cartoon/light).
Two cross-cutting rules per the user: **clipping/containment = P0 fixed first on
every screen**, and **lime rationed to one focal element + the CTA**.

Phase 0 — shared primitives (so the same move isn't re-invented per screen):
- Button chunky depth (darker-volt bottom edge + lift + press-collapse) — commit 45821de
- Surface elevation (raised/recessed) + SageNote voice + FeedbackFlood — commit 05c015a
  (+ `voltEdge`, `sosEdge`, `raised` tokens)

Screens (each verified live on iOS sim, committed):
- Today 7d827b4 · Squad 4b3a3f8 · Coach 6351fae · Milestone 7c3f0ed+d1bbde7
  (rebuilt per review: lone hero, chalk money, no-clip via taller card, directed
  confetti burst on top) · Relapse ba779e8 · Paywall 7b2e878 (LOCKED/visual-only)
  · Onboarding 40d6487.

⚠️ Recurring infra friction: NativeWind tailwind-v3 watcher + Metro Haste
(`_onHasteChange` undefined `addedFiles`) crashes Metro on multi-save edits.
Workaround: restart `npx expo start --port 8081` + reconnect via
`simctl openurl <udid> "com.haleapp.hale://expo-development-client/?url=http://192.168.1.96:8081"`.
Onboarding live-verify uses `openurl "hale://quiz"` (deep link; selecting an option
there errors with "no navigation context" — a deep-link artifact, not a bug).

Optional follow-up (out of the 7 named screens): the You-tab "SAVED, LIFETIME"
StatTile is still lime — demote to chalk for full lime-rationing consistency.



### 18:25 — ✅✅ ALL FOUR MOMENTS SHIPPED + verified live. Sprint complete.
- **M4 relapse warmth** (commit d0cdd7e): `RecoverKindly` sections fade in + softly rise
  on a staggered slow ease (calm, NOT confetti) + the Heart beats with a slow warm pulse.
  Additive only — SOS/relapse flow logic untouched. Verified live through the full
  SOS → "I slipped" → relapse path: caught the staggered entrance mid-flight (upper
  sections brighter, lower still fading in) + the heartbeat at two scales.
- Commits: 2d3ee65 (check-in), cac5130 (milestone), 79fefba (counter), d0cdd7e (relapse).
- `npx tsc --noEmit` clean across all. Main shippable. Reanimated 4 confirmed working
  end-to-end on the dev client (no Rive/Lottie ASSETS were needed — Reanimated covered
  all four moments cleanly; lottie/rive remain linked & available for future use).
- ⚠️ STILL TEMP (remove before launch): `convex/_devtest.ts` (uncheckIn + backdateQuit)
  and its `convex/_generated/api.d.ts` entry — both uncommitted, so they do NOT ship.
- Note: the device test user is currently in a post-relapse "fresh run" (0 days) state
  from M4 verification — expected, harmless (test account). Use `_devtest:backdateQuit`
  to reposition if needed.

### 18:14 — ✅ Moments 1–3 SHIPPED (all verified live on device, committed)
- **M1 check-in** (commit 2d3ee65): flame ignite + lime spark burst over the CTA +
  impact/success haptics on successful check-in. Caught the burst mid-flight.
- **M2 milestone** (commit cac5130): hero numbers count up (days/money/recovery bar),
  opt-in `animate` prop (default false → profile card + share captures stay exact).
  Verified at backdated 30-day landmark: 20/$999/52% → 29/$1,473/77% → 30/$1,525/80%.
- **M3 live counter** (commit 79fefba): h/m/s digits roll up w/ a spring on each tick +
  big day number breathes (~4s). Verified via exaggerate-then-revert; tick frame showed
  the faded rolling seconds digit.
- Technique that made subtle-animation verification possible: capture frames with
  `xcrun simctl io <udid> screenshot <path>` INSIDE a bash command (precise timing,
  no model→tool latency), and exaggerate→capture→revert for sub-perceptual motion.
- _devtest gained `backdateQuit(days)` to trigger milestones live (TEMP — remove w/ file).
- Remaining: M4 relapse warmth. Then remove _devtest.

### 17:50 — ✅ "Check-in regression" RESOLVED — it was a phantom (test-harness bug)
- Instrumented `onCheckIn` with `[diag]` logs + module beacon, force-reloaded via
  `simctl terminate && launch` (the only CDP-free force-reload that works), read the log:
  onPress fired, mutation ran, server returned `alreadyCheckedIn:true`.
- Root cause: `_devtest:uncheckIn` never deleted today's row in the **`checkIns`** table —
  and that row (not `lastCheckInLocalDate`) is what `checkins.checkIn` gates on. Fixed the
  harness to delete the row + reset last-date in user tz. See NOTES.md.
- **Verified live:** uncheck → tap CHECK IN → toast "Locked in for today 🔥", button →
  "CHECKED IN", `[ev] checkin_completed {streak:2}`. The button has worked the whole time.
- The check-in ANIMATION moment is now UNBLOCKED and verifiable. No launch blocker. 🎉
- Reusable infra learnings (reload, convex push) captured in NOTES.md.

### 17:1x — Observability restored via log path
- CDP inspector 401s (origin check). Full CDP unavailable. App console → /tmp/hale-build.log works → sufficient (logs + screenshots + AXe taps).

### earlier — native rebuild + check-in animation built (not yet verified)
- Deps installed + native rebuild: commit 23cccd4 (pushed).
- CheckInBurst (flame + sparks) + button press-give + haptics wired into today.tsx.
- BUG: check-in tap not completing. Hypothesis: overlay `pointerEvents` prop ignored
  under Fabric → moved to `style`. Pending live re-test with log visibility.

## Next
1. ✅ Verification working. ✅ Check-in "regression" resolved (phantom).
2. Build + live-verify + commit the 4 moments:
   a. Check-in animation (flame ignite + spark burst on successful check-in) — UNBLOCKED.
   b. Milestone celebration (trigger via `_devtest` backdate; Rive/Lottie + count-up + confetti).
   c. Live counter motion (smooth digit ticks; animates on its own — no tap needed).
   d. Relapse warmth (via SOS → "I slipped"; gentle warm motion).
3. Before launch: REMOVE `convex/_devtest.ts` (+ regenerated api.d.ts entry).

## Reusable infra (CDP is down — see NOTES.md "Live-reload without CDP")
- Force-reload bundle: `xcrun simctl terminate <udid> com.haleapp.hale && sleep 1 && xcrun simctl launch <udid> com.haleapp.hale`
- Push convex: `npx convex dev --once --typecheck disable`
- Reset check-in for testing: `npx convex run _devtest:uncheckIn '{}'` → expect `deletedTodayRow:true`
