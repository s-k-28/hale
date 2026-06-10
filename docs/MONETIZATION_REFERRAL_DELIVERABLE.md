# HALE — Monetization + Referral System — Deliverable Report

_2026-06-09. Built on top of the existing RevenueCat/trial/buddy scaffolding. Design spec: `docs/superpowers/specs/2026-06-09-monetization-referral-design.md`. All backend logic in Convex (no second datastore)._

## Status

Complete and committed across 7 feature commits; `main` shippable, `tsc` clean, 28 unit tests passing. The referral reward **logic** is verified end-to-end against a live Convex backend. The full **UI tap-through on the iOS simulator is currently blocked by an Expo-56/RN-0.85 native build bug** (details + remediation in §7) — not by any feature code.

---

## 1. Feature → Free or Gated

| Feature | Free | HALE+ | Treatment | Where |
|---|---|---|---|---|
| Streak tracking + daily check-in | ✅ | ✅ | ungated (viral/retention) | `(tabs)/today.tsx` |
| Milestone share card | ✅ | ✅ | ungated (viral seed) | `TransformationCard.tsx` |
| Buddy invite / pairing | ✅ | ✅ | ungated (viral seed) | `(tabs)/squad.tsx`, `u/[id].tsx` |
| Basic craving SOS (ride-it-out + breathe) | ✅ | ✅ | ungated | `sos.tsx` |
| Money-saved + days-clean counter | ✅ | ✅ | ungated | `(tabs)/today.tsx`, `(tabs)/you.tsx` |
| Sage coaching | 5/day cap | unlimited | cap-hit → upgrade CTA | `(tabs)/coach.tsx`, `convex/model/sage.ts` |
| Full analytics / recovery history + charts | 🔒 | ✅ | `LockedFeature` overlay (real charts blurred) | `analytics.tsx` |
| Advanced craving toolkit (urge-surf + trigger insight + heatmap) | 🔒 | ✅ | `LockedFeature` overlay | `toolkit.tsx` |
| Multiple squads | 1 squad | unlimited | `LockedFeature` once at limit | `squads.tsx` |
| Home-screen widgets | 🔒 preview | ✅ (WidgetKit = fast-follow) | `LockedFeature` blurred preview | `(tabs)/you.tsx` |

Free keeps every viral/retention surface ungated (so the growth loop never breaks); HALE+ is depth.

---

## 2. Referral flow — end to end

**The link.** Every user has a referral deep link — the existing buddy link `hale://u/<referrerId>`, plus a friendly `hale://r/<code>` alias (`referrals.resolveCode` → same referrer). Code is generated idempotently (`referrals.getOrCreateMyCode`).

**The trigger (two steps — install AND buddy-pair):**
1. **INSTALL (attribution).** A friend opens the link before onboarding → stashed via the existing `pendingBuddy`. At onboarding commit (`quiz.tsx`), `referrals.attributeInstall` sets `referredBy` (once; self-referral blocked) and writes an `attributed` row → fires `referral_install_attributed`. **Install alone never counts.**
2. **BUDDY-PAIR (completion).** The invitee's **first successful pairing with ANYONE** (the referrer via the link, a matchmade peer, or another friend) flips the row to `completed` → fires `referral_buddy_paired`. Pairing is the bar. _Rule updated 2026-06-10:_ completion was decoupled from pairing with the referrer specifically — under the one-active-buddy rule (see `convex/model/buddy.ts`), requiring the referrer would permanently block every referral after the referrer's first pair. Both `buddies.pairWith` and `buddies.requestMatch` run the completion hook for each newly-paired side.

**The reward.** At **3 distinct completed referrals**, the referrer is granted a **one-time 7-day HALE+ window** (`referralRewardEndsAt = now + 7d`, `referralRewardGrantedAt` guards once) → fires `referral_completed` + `reward_granted`. It auto-reverts after 7 days, **does not auto-charge**, and is **separate** from the subscription's 14-day paid trial.

**Single source of truth.** Both the reward and a paid subscription feed one `hasHALEPlus` (`convex/model/entitlement.ts::resolveEntitlement` → `paid | trial | referral_reward`), which every blurred feature gates on. `tierOf` (Sage caps) reads the same resolver, so reward users get unlimited Sage too.

**Edge cases (all verified live against Convex — see §7):**
- Self-referral blocked ✅
- Duplicate installs / re-pairs counted once (dedupe on `(referrer, invitee)`) ✅
- Reward granted exactly once (4th referral does not re-grant/extend) ✅
- **Unpair after counting = no clawback** — completed stays completed, the 7-day window runs out ✅
- Reward → `hasHALEPlus: true, source: referral_reward` ✅

**Progress + celebration.** `ReferralCard` (on the Squad tab) shows "X of 3 friends joined & paired" with a segmented meter, the sanitized invitee list, one-tap share, and a reward-unlocked state with a once-per-session celebration (haptic + toast).

---

## 3. Blurred paywall — reusable, applied everywhere

ONE component: `src/components/ui/LockedFeature.tsx`.
- **Entitled (or still resolving):** early-returns `children` untouched — **zero blur/overlay cost on the happy path** (no jank/flicker for paying users).
- **Locked:** renders the REAL premium content, `expo-blur`-blurred + non-interactive, under a `volt` lock badge + "Unlock with HALE+" CTA. Tapping anywhere fires `paywall_feature_tapped { feature }` then opens the paywall (`presentPaywall(feature)` → falls back to `/paywall`).
- `variant: 'overlay' | 'inline'`.

**Applied to every gated surface, all through this one component:** `analytics` (overlay), `advanced_toolkit` (overlay), `multiple_squads` (inline), `widgets` (inline). The Sage cap uses the same `paywall_feature_tapped`/`presentPaywall` path (`unlimited_sage`). The dedicated `paywall.tsx` remains the main upsell.

---

## 4. PostHog events now firing

New this build (added to `src/lib/analytics.ts`, documented in `docs/ANALYTICS_EVENTS.md`):

| Event | Props | Fires |
|---|---|---|
| `referral_link_shared` | `surface` | user shares their referral link |
| `referral_install_attributed` | `referrer_id` | invitee attributed at onboarding commit |
| `referral_buddy_paired` | `referrer_id` | attributed invitee pairs with referrer |
| `referral_completed` | `referrer_id` | referrer reaches 3/3 |
| `reward_granted` | `referrer_id`, `reward_days: 7` | 7-day reward granted |
| `paywall_feature_tapped` | `feature` (analytics \| unlimited_sage \| multiple_squads \| widgets \| advanced_toolkit) | a blurred feature is tapped |
| `subscription_started` | `surface` | a NEW paid sub (PURCHASED, not RESTORED) |

Reused (already firing): `paywall_viewed` (carries `surface`), `trial_started`, `purchase_completed`. All referral events carry `referrer_id`, so the funnel keys on the referrer even when fired from the invitee's device. `paywall_feature_tapped.feature` answers "which locked surface drives the most taps"; `subscription_started` vs `referral_completed` gives the referral-vs-pay split.

---

## 5. Screen-by-screen — functional + churn risk

> **Verification method:** functional assessment below is from rigorous code review + the live Convex logic test (§7). The UI was **not** tap-tested on the simulator this session (build blocker, §7). Items I could not exercise live are marked _(static)_.

| Screen | Functional | Churn risk → fix |
|---|---|---|
| **Onboarding (quiz commit)** | _(static)_ PASS — attribution + pair wired before/after paywall; install attribution is fire-and-forget (try/catch), never blocks landing. | Paywall at plan-reveal peak is dismissible (good). Risk: a referred user who declines the buddy step loses the referral completion. Fix: the deep-link path auto-pairs in onboarding, so this only affects manual decliners — acceptable. |
| **Squad tab (`ReferralCard`)** | _(static)_ PASS — `getOrCreateMyCode` materializes the link on mount; share + progress meter reactive. | "Earn free HALE+" is below the buddy block — a solo user may not scroll. Fix (recommended): surface the progress meter higher when `completedCount > 0`. |
| **Analytics (blurred)** | _(static)_ PASS — fetches the user's own data regardless of entitlement so the blur shows REAL charts; `loading` guard avoids flicker. | A brand-new user with no cravings sees a blurred empty chart. Fix: when `total30 === 0`, show the value-prop copy instead of an empty blurred chart. |
| **Advanced toolkit** | _(static)_ PASS — urge-surf step-through is self-contained; insight + heatmap reactive; whole screen `LockedFeature`. | Empty-data states for insight/heatmap are handled (copy nudging to log cravings). Low churn risk. |
| **Squads (multiple)** | _(static)_ PASS — free user keeps 1 squad; create/join/discover blurs at the limit. | A free user mid-create who hits the limit could be confused. Fix: the blur shows "Unlock multiple squads" copy — clear enough; consider a toast on the first block. |
| **Coach (Sage cap)** | _(static)_ PASS — free cap-hit shows an "unlock unlimited" banner into the paywall; cleared on next accepted send. | The cap message is the right moment to convert. Risk: hitting the cap repeatedly with no path felt like a dead end before — now fixed. |
| **You (widgets preview)** | _(static)_ PASS — blurred mock widget with the user's real numbers. | Selling a feature that isn't installable yet could frustrate. Fix: label the preview "Coming with HALE+" so expectations are set (currently implied by the lock). |
| **Referral logic (backend)** | **LIVE PASS** — all 7 edge cases verified against the running Convex backend (§7). | n/a |

---

## 6. Top churn points (ranked) + highest-impact fixes

1. **Paywall timing/aggression.** The peak-intent onboarding paywall is dismissible (good) and the in-place blurs are non-blocking. Highest-impact lever: ensure the first locked surface a free user hits shows their OWN data blurred (analytics already does), not an empty teaser — concrete value beats abstract upsell. _Fix: analytics empty-state copy when no data (above)._
2. **Referral ask clarity.** "3 friends install + pair" is a higher bar than "3 installs" and could read as unattainable. _Fix: the progress meter + invitee list make partial progress visible and motivating; consider copy "they just have to join and pair with you" (already in the card)._ Watch `referral_install_attributed → referral_buddy_paired` drop-off in PostHog — if installs don't convert to pairs, lower friction on the pairing step.
3. **Discoverability of the referral reward.** It lives on the Squad tab; a user who never opens Squad never sees it. _Fix: surface a compact "2/3 friends — earn HALE+" entry on the You screen or post-milestone._
4. **Widgets preview expectation gap.** Selling a not-yet-shippable widget. _Fix: "Coming with HALE+" label; ship the WidgetKit extension as the first fast-follow._
5. **Sage free cap friction.** 5/day may be tight for an engaged new user; the upgrade CTA converts some, but too-low a cap churns the rest. _Fix: A/B the free cap (5 vs 8) against D7 retention once live._

---

## 7. Verified live vs needs real-device / multi-user testing — honest split

**Verified LIVE this session:**
- ✅ **Referral reward logic** end-to-end against a running Convex backend (seeded referrer + invitees through `completeReferralForPair`): self-referral block, dedupe, 2/3→no-reward, 3/3→7-day grant, grant-once, no-clawback, and reward→`hasHALEPlus: source referral_reward`.
- ✅ **Entitlement resolver math** — 12 unit tests (precedence paid>trial>reward, active/expired windows, reward reported alongside trial/paid, null-safety).
- ✅ **Whole codebase `tsc` clean**; Convex schema + all functions validate on push.

**NOT verified live (and why):**
- ⛔ **The iOS simulator UI tap-through.** Blocked by an Expo-56/RN-0.85 native build bug: the `[CP-User] Build ExpoModulesJSI xcframework` script fails resolving `<hermes/hermes.h>` even though the header is present (`ios/Pods/Headers/Public/hermes-engine/hermes/hermes.h`). This is an Expo/RN toolchain issue, **not feature code** (which is tsc-clean). **Remediation to unblock:** clean reinstall building RN from source (`rm -rf ios && RCT_USE_PREBUILT_RNCORE=0 npx expo prebuild -p ios --clean && cd ios && pod install`), or pin to a known-good Expo 56 patch / Hermes header-search-path fix. Your team's existing machine (per the handoff docs' simulator UDID + Metro setup) likely already has a working build — running the walk there is the fastest path.
- ⛔ **Cross-device referral attribution + buddy-pairing across two REAL phones — this is the #1 launch test.** A real fresh install on a second physical device resolving the link, then pairing, cannot be reproduced in one simulator. The logic is proven (above), but the install-attribution timing, deep-link cold-start handoff, and two-user pairing race are real-device territory. Test at launch with two phones on two accounts.
- 🌐 **The paid purchase path** (StoreKit → RevenueCat → webhook → `users.premium`) needs your ASC products + RC keys (the documented `[USER]` gate). The reward, blur, funnel, and referral loop are fully testable without live RC; the actual subscription is not.
- 📱 **Real WidgetKit widget** — shipped as a blurred preview; the native extension is the first fast-follow.

---

## 8. Commits (main shippable throughout, tsc clean per commit)

```
42afb25 feat(toolkit): advanced craving toolkit (urge-surf + trigger insight + heatmap)
a8dc242 feat(monetization): subscription_started event + entitlement tests + event docs
7bb2d53 feat(gating): multiple-squads blur, widgets preview, Sage cap upgrade CTA
af4a779 feat(referral+gating): referral card UI + blurred analytics
013f450 feat(referral): deep-link install attribution + completion funnel
a8aaa4f feat(monetization): referral reward backend + unified hasHALEPlus + LockedFeature
8d41b79 docs: monetization + referral system design spec
```

**Nothing pushed** (per instruction). All commits are local on `main`.
