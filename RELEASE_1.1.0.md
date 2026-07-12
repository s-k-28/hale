# HALE 1.1.0 — Conversion overhaul (hard paywall + onboarding peak-intent)

_Branch: `feat/conversion-overhaul`. Built 2026-07-11. Grounded in the 3 source
videos (paywalls / onboarding / dashboards), `MRR_STUDY.md`, and a research pass
(RevenueCat SOSA 2025, Quittr/Opal/Blinkist/Reframe teardowns, Apple 2026 paywall
compliance). Goal: move install→trial and trial→paid toward the $100k-MRR funnel._

`app.json`: version **1.1.0**, iOS buildNumber **14** (EAS `autoIncrement` will
bump from the last cloud build regardless).

---

## What shipped in this build (verified: `tsc` + `eslint` clean)

### 1. True hard paywall + all "X-out" bugs fixed
The onboarding paywall is now a genuine non-dismissible decision wall:
- **No close control** on the hard wall (`from = onboarding | locked_out`).
- **Android hardware back is swallowed** on the hard wall (`BackHandler`) — this
  was the primary leak (there was no `BackHandler` anywhere in the app before).
- **`gestureEnabled: false`** on the `paywall` route (`src/app/_layout.tsx`) —
  belt-and-suspenders with `fullScreenModal` so it can't be swipe/drag-dismissed.
- **Entry-gate re-wall** (`src/app/index.tsx`): an onboarded-but-unentitled user
  is routed back to the paywall on launch — closes the force-quit-during-
  onboarding bypass. Guarded so dev/scaffold builds (no RC keys) and genuinely
  entitled users (RC runtime OR Convex mirror OR referral reward) are never
  walled. Controlled by the PostHog flag `paywall_posture` (default `hard`; flip
  to `soft` to instantly soften without a rebuild).
- **In-app feature gates stay dismissible** (You / Coach / LockedFeature) — a
  quiet close (X) fades in — so a browsing user is never trapped on a locked
  feature (Apple 3.1.1 / 2.1 safe).

### 2. Paywall redesigned with the winning conversion patterns
`src/app/paywall.tsx`, all on Clean Dark v2:
- **Personalized header** using the user's own numbers from onboarding:
  "[Name], your plan is ready." + "Put your $2,847 a year back where it belongs."
- **"Cold turkey vs HALE+" comparison table** (Jonathan's table pattern; the
  honest frame for a hard wall — there's no free tier to compare against).
- **Sharpened trial timeline** (Blinkist pattern): Today unlocks / Day 2 reminder
  / Day 3 ends, cancel anytime.
- **Honest price anchor** tied to their habit: "Your habit: about $59 a week.
  HALE+: $0.96 a week." (falls back to "less than a single pod/pack/tin").
- **Conditional CTA + right-chevron**: "Start my 3-day free trial ›" on annual;
  "Unlock HALE+ · $6.99/mo ›" on monthly — never says "free" on the no-trial
  monthly plan (a 2026 App Review rejection trap).
- **Reviews carousel** that renders **only when real reviews are supplied** — see
  action items. HALE ships no fabricated social proof.

### 3. Onboarding peak-intent enhancements (additive, low-risk)
- **Welcome**: replaced the "Free to start" claim (risky under a hard wall) with a
  social-proof line ("Built with quitters").
- **Plan reveal**: added a **Freedom Date** card ("cravings typically ease to
  occasional") and, for cigarette smokers, **life regained** (~N days/yr, UCL
  2024 ~20 min/cig, framed as general guidance). Feeds straight into the now-
  personalized paywall.
- **Push opt-in** copy now ties to the trial ("We'll also remind you before your
  trial ends") — makes the paywall's "Day 2 reminder" promise honest.

### 4. Compliance
- App `description` updated: removed "Free to start", now states the 3-day trial +
  $49.99/yr / $6.99/mo + cancel-anytime, and dropped the em dash.

---

## App Store "What's New" (paste into ASC)

> Your quit, upgraded.
> • A plan built around your triggers, your spend, and your freedom date
> • A cleaner paywall that shows exactly what your 3-day free trial unlocks
> • Personalized savings and recovery projections from your answers
> • Faster, clearer onboarding
> Start your 3-day free trial and quit nicotine for good.

## App Review notes (paste into ASC → App Review Information → Notes)

> HALE is a subscription app with a 3-day free trial. After onboarding, the full
> experience is gated by a subscription (HALE+, $49.99/year with a 3-day free
> trial, or $6.99/month). The paywall shows the full billed price, trial length,
> auto-renewal and cancel-anytime terms, Restore Purchases, and links to Terms
> and Privacy. There is no trial toggle. To review: complete the short
> onboarding quiz, then start a sandbox trial on the paywall. No demo account
> needed. Restore Purchases is available directly on the paywall.

---

## Founder action items before submitting (do these from `~/halecap`)

1. **App Store Connect — subscriptions**: put the **3-day intro free trial on the
   ANNUAL SKU only** (`hale_plus_annual`), monthly (`hale_plus_monthly`) has no
   trial. This matches the redesigned CTA copy and pushes plan mix to the higher-
   LTV annual (the Moonly tactic).
2. **App Store Connect — listing copy**: make sure the public description does
   **not** call the app "free" anywhere (it hard-gates). The in-repo `app.json`
   description is already fixed; the ASC listing is separate — update it too.
3. **Real reviews**: paste 3 genuine 5-star App Store reviews into `REVIEWS` in
   `src/app/paywall.tsx` (name + "quit N days"). The section auto-hides while
   empty — do not ship fabricated reviews.
4. **PostHog flag** `paywall_posture`: leave unset to keep the default `hard`
   (re-walls onboarded non-subscribers on launch). Set to `soft` if you want to
   soften without a rebuild. The onboarding wall is hard regardless of this flag.
5. **Device QA** (can't be done from this clone — the RN build fails at the
   space-in-path repo; build from `~/halecap`):
   - New-user flow: onboarding → plan reveal → hard paywall. Confirm swipe-down,
     edge-swipe, and Android back do nothing; there is no close affordance.
   - Purchase → lands in the app; Restore → lands in the app.
   - Tap a locked feature (You/Coach/analytics) → paywall shows a close (X) after
     ~1.2s and is dismissible.
   - Kill the app at the paywall, relaunch → paywall re-presents (posture=hard).

## Build + submit (from `~/halecap`)

```bash
cd ~/halecap
git fetch && git checkout feat/conversion-overhaul   # or merge to main first
npx convex deploy                                     # prod backend (no schema change this release)
eas build -p ios --profile production                 # autoIncrements buildNumber
eas submit -p ios --profile production                # ascAppId 6781942293
```

---

## Next phases (planned, NOT in this build — need backend codegen + device QA)

These are specced in full in the research blueprint; they were deliberately held
back because they touch the core funnel / Convex schema and must be QA'd on device.

- **P2-full — onboarding depth**: split `quiz.tsx` into modules; add the FTND-style
  questions (time-to-first-use, years using, past attempts, withdrawal symptoms,
  6-month goals) + 3 education interstitials; a **Dependence Score** reveal (the
  Quittr "score" move, Fagerström-adapted); single-select auto-advance; a mid-flow
  App Store rating prompt (`expo-store-review`); and **move the push pre-prompt
  before the paywall** so non-converters are push-reachable for win-back. New
  `completeOnboarding` fields → `convex/schema.ts` + codegen.
- **P3 — Today dashboard / coined metric**: a **HALE Score** (0-100, composite,
  bends-but-never-zeroes on relapse — the answer to the sobriety-app delete-on-
  relapse cliff), an insight line ("what changed / what to do next"), and a 9:16
  **ShareCard** + Sunday **Weekly Recap** push (the organic loop). New
  `convex/model/haleScore.ts` + `todayState` fields.
- **P4 — full UI polish sweep**: audit every funnel screen against `theme/clean.ts`
  + `src/ui/*` (kill ad-hoc sizes/colors, unify spacing/radii, empty/loading/error
  states); regenerate the App Store screenshots (the committed set is stale lime;
  the `app-store-screenshots` skill + `marketing/` are in-repo).
- **P5 — monetization iteration engine**: A/B paywall design (single vs multi-page),
  trial-scope test, gate-context exit-intent downsell, win-back, price test to
  $59.99/yr. Flag keys already stubbed in `src/lib/experiments.ts`.

**Do NOT build** (trust + Apple risk): spin-the-wheel / fake countdowns / fake
"one-time" offers, trial toggles, fabricated percentiles or user counts.
