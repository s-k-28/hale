# HALE — Relaunch (v2) plan & decisions

_2026-06-04. Supersedes `PHASE_HANDOFF.md §2` pricing. Driven by `MRR_STUDY.md` (22-app, $100k–$1M/mo teardown). Read both for the why._

## Why we changed course
Pre-launch, we studied 22 consumer apps at $100k–$1M/mo (revenue-audited for confidence). The verdict: $100k MRR is reachable for this category (I Am Sober/QuitNow ~$200k/mo, Opal $10M ARR), but **not on the original plan**. Honest odds: ~25–30% as-was → ~60–65% with the moves below. Root issues: under-pricing (kills LTV → kills every channel), distribution dependence on unproven free TikTok, and an unmonetized peak-intent moment.

## Locked decisions (this session)
| # | Decision | Choice |
|---|---|---|
| 1 | Annual hero price | **$79.99/yr** (≈$6.67/mo) — was $39.99 |
| 2 | Monthly anchor | **$12.99/mo** — was $9.99 |
| 3 | StoreKit free trial | **2 weeks (14-day)** + no-surprise charge timeline (reverted from a 3-day experiment per H&F trial→LTV research; #1 post-launch A/B candidate) |
| 4 | Paywall placement | **At the plan-reveal peak, dismissible** (preserves the buddy-invite loop) |
| 5 | Paywall build | **RevenueCat native** (dashboard) + RC Experiments for A/B |

App-managed 14-day full-access window (`convex/model/trial.ts`) is **kept** as the soft floor for paywall-dismissers — no card on file, so no forgot-to-cancel risk. The StoreKit subscription trial is **also 14 days (2 weeks)** now — aligned with the app-managed window. (My MRR study favored a 3-day trial for trial-to-paid; H&F data favors 14-day for annual LTV — the sources disagree, so trial length is the top post-launch A/B.)

## Code build — DONE & verified (tsc EXIT=0)
- `convex/users.ts` — `completeOnboarding` now returns `{ attemptId, userId }`.
- `src/lib/paywall.ts` — `presentPaywall(surface?)` tags PAYWALL_VIEWED + PURCHASE_COMPLETED with the surface.
- `src/app/(onboarding)/quiz.tsx` — in `commit()`, after onboarding we `identifyPurchaser(userId)` then `presentPaywall('onboarding_peak')` (dismissible), firing `trial_started {trial_days:14, trial_type:'storekit'}` on purchase. Buddy/push routing unchanged → invite loop never blocked.
- `src/app/paywall.tsx` — offline fallback repriced $39.99→$79.99, "/yr · $6.67/mo", "14-day free trial" copy. (RC native paywall is primary; this only shows when RC is unconfigured.)

## Remaining launch chain (gated)
1. **[USER] ASC products** — `hale_plus_annual` $79.99/yr + `hale_plus_monthly` $12.99/mo, one group, **2-week (14-day)** intro free trial on both.
2. **[USER] RevenueCat** — import → attach to `HALE+` entitlement → Offering (annual default/highlighted) → design native Paywall (two-plan, annual "best value · $6.67/mo", 3-day trial, no-surprise charge timeline) → finish webhook secret.
3. **Ship** — `rm convex/_devtest.ts && npx convex deploy` (prod), then `eas build -p ios` with `EXPO_PUBLIC_*` present → TestFlight.

## Fast-follow (post-TestFlight, from MRR_STUDY.md)
- Weaponize the buddy/squad wedge as the graduation-paradox escape (graduate→mentor).
- Treat creators as a paid, measurable, demoable engine (not free TikTok luck).
- RC Experiments on the paywall; trial-reminder screen; evaluate an ARPU-expansion / B2B2C layer.
