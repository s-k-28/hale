# HALE animation sprint — NOTES (stuck items & decisions)

## ExecBro CDP inspector 401 — WORKED AROUND (not fixed)
- **Symptom:** `scan_metro`/`get_logs` → "Failed to connect ... 401". Metro log:
  "Connection from DevTools failed ... origin 'undefined' ... expecting origin
  http://127.0.0.1:8081 or hostname localhost/127.0.0.1/0.0.0.0/[::]".
- **Cause:** RN 0.81+ `@react-native/dev-middleware` inspector-proxy validates the WS
  `Origin` header. ExecBro connects with no Origin → rejected. The app's *own* device
  inspector connection (proper origin) is fine, so app console logging still works.
- **Workaround (sufficient):** app `console.log` → Metro stdout → `/tmp/hale-build.log`.
  Grep `[ev]`/ERROR there. Screenshots via simctl, taps via AXe — both CDP-free.
- **Not pursued (anti-circling):** patching `node_modules/@react-native/dev-middleware`
  origin check — hacky + reinstall-fragile + risks Metro. Revisit only if log path
  proves insufficient for a given check.

## ✅ "CHECK-IN BUTTON broken" — RESOLVED: it was a TEST-HARNESS phantom, never an app bug
- **Real cause:** `convex/checkins.ts` gates `alreadyCheckedIn` on whether a row exists in
  the **`checkIns` table** for `localDate == today` (`by_user_date` index) — NOT on
  `user.lastCheckInLocalDate`. The old `_devtest:uncheckIn` only patched
  `lastCheckInLocalDate`; it **never deleted today's `checkIns` row**. So `checkIn` always
  found `existing` → returned `{alreadyCheckedIn:true}` → the client's
  `if (!res.alreadyCheckedIn)` success branch was skipped → no toast, button never flipped.
  Every "the button doesn't fire" observation was actually a server-side no-op.
- **How I proved it (the technique that cracked it):** added `console.log('[diag] ...')`
  probes inside `onCheckIn` + a module-scope `BEACON` log, force-loaded the fresh bundle via
  **`xcrun simctl terminate && launch`** (CDP-free, guaranteed — `reload_app`/openurl do NOT
  force a rebundle), then read `/tmp/hale-metro2.log`. Log showed onPress DID fire, the
  mutation WAS called, and it returned `alreadyCheckedIn:true`. That pointed straight at the
  server gate, not the button.
- **Fix:** rewrote `_devtest:uncheckIn` to (1) delete today's `checkIns` row via the
  `by_user_date` index, (2) reset `lastCheckInLocalDate` to yesterday *in the user's tz*
  (`localDateOf`, matching how checkIn computes "today"). After fix: `deletedTodayRow:true`,
  then tap → `checkIn` returns `{alreadyCheckedIn:false, streak:2}`, toast "Locked in for
  today 🔥", button → "CHECKED IN", `[ev] checkin_completed`. **Verified live on device.**
- **Note on the `Animated.View` wrapper (memory 2960):** that was a *separate, earlier* real
  issue (a reanimated wrapper swallowing the press) already fixed by reverting to the plain
  committed `<Button>`. The current committed Button works. Table name gotcha: the table is
  **`checkIns`** (capital I), not `checkins`.

## Live-reload without CDP (IMPORTANT — reusable)
- `mcp__execbro__reload_app` and `simctl openurl <devclient-url>` do NOT force a fresh bundle
  when the app is already connected (openurl just foregrounds it).
- **Reliable force-reload:** `xcrun simctl terminate <udid> com.haleapp.hale && sleep 1 &&
  xcrun simctl launch <udid> com.haleapp.hale`. Dev client re-pulls the bundle on launch.
  Confirm via a module-scope `console.log` beacon appearing in `/tmp/hale-metro2.log`.
- Convex deploy: no `convex dev` watcher runs here. Push edits with
  `npx convex dev --once --typecheck disable` (6 pre-existing `process`/Node-global type
  errors in auth.config/email/http/pushes/sage are unrelated and block a normal push).
