# HALE — Monetization + Referral System — Design Spec

_2026-06-09. Approved design. Extends the existing RevenueCat / trial / buddy scaffolding (see `RELAUNCH_PLAN.md`, `PHASE_HANDOFF.md`). Builds the freemium gating, the blurred in-place paywall, and the buddy-pair referral reward — all backend logic in Convex (no second datastore)._

## 0. Goal & scope

Ship HALE's full monetization + referral system in the MVP, App-Store-ready within a week:

- A **free tier** that keeps the viral surfaces ungated (they drive growth + retention).
- A **referral unlock**: a unique deep link per user; 3 friends who **install via the link AND pair as a buddy** unlocks a **7-day HALE+** reward (auto-reverts, no auto-charge).
- A **blurred in-place paywall**: locked premium features appear in-app, visually blurred, with an "Unlock with HALE+" overlay. One reusable component on every gated surface. The dedicated paywall screen stays for the main upsell.
- One **single-source-of-truth `hasHALEPlus`** check that both the paid subscription and the referral reward feed.
- **PostHog** funnel instrumentation across the whole flow.

This is an **extension**, not a greenfield build. Most monetization plumbing already exists (RevenueCat SDK, webhook → `users.premium` mirror, `HALE+` entitlement, `usePremium()`, `presentPaywall(surface)`, the buddy `pairWith()` graph, the `pendingBuddy` deferred-pairing stash, the PostHog `track()` singleton, the 14-day app-managed trial). We add the referral reward layer, the blur component, the gating, the referral UI, and the new events on top.

### Non-goals (explicit, MVP)

- Real iOS WidgetKit extension — **deferred to fast-follow**; ship a blurred in-app widget *preview* now.
- RevenueCat **promotional entitlement** API path for the reward — **not** the chosen mechanism (see §2); a clean seam is left to add it later.
- Live paid-purchase end-to-end verification — gated on `[USER]` ASC products + RC keys (per `RELAUNCH_PLAN` steps 1–2), still scaffold.
- A second backend (e.g. Supabase) — explicitly rejected; referrals live in Convex with the rest of the backend.

## 1. Decisions locked

| # | Decision | Choice |
|---|----------|--------|
| 1 | Referral reward delivery | **Convex-managed window** (mirrors the 14-day trial pattern). No RC secret needed; fully simulator-verifiable. Seam left to also push an RC promotional entitlement later. |
| 2 | Reward size / trigger | **3 distinct completed referrals → 7-day HALE+**, granted exactly once, auto-reverts. Separate from the 14-day paid trial; **no auto-charge**. |
| 3 | "Counted" definition | Invitee **installs via the link AND pairs** as the referrer's buddy. Install alone never counts — pairing is the bar. |
| 4 | Unpair rule | **Completed referrals stay counted; granted 7-day rewards run their full window; no clawback.** Documented in code. |
| 5 | Widgets | **Blurred in-app preview now**, real WidgetKit extension fast-follow. |
| 6 | Advanced craving toolkit | **Build thin-but-real** (urge-surf exercise + trigger-pattern insight + craving-time heatmap), shown blurred. **Lowest-priority milestone — first to defer to fast-follow if the 1-week timeline is threatened.** |
| 7 | Self-referral | Blocked. |
| 8 | Dedupe | An invitee counts at most once per referrer; duplicate installs / re-pairs are idempotent. |

## 2. Single source of truth: `hasHALEPlus`

Extend the existing resolver; do not create a parallel one.

**Convex** — new `convex/model/entitlement.ts`:

```
resolveEntitlement(user, now) -> { hasHALEPlus: boolean, source: 'paid' | 'trial' | 'referral_reward' | 'none' }
```

- `paid` if `user.premium` (RC webhook mirror).
- `trial` if `trialStatus(...).trialActive` (existing 14-day app-managed window).
- `referral_reward` if `user.referralRewardEndsAt && user.referralRewardEndsAt > now`.
- Precedence: `paid` > `trial` > `referral_reward` > `none` (purely for the reported `source`; any non-`none` ⇒ `hasHALEPlus = true`).

`tierOf(user, now)` (in `convex/model/sage.ts`, drives Sage caps) is updated so a referral-reward user resolves to the **paid** tier (unlimited Sage) for the reward window. Single definition; Sage caps and every server gate read it.

**Client** — extend `src/hooks/usePremium.ts`:

- Add `referralRewardActive: boolean` and `rewardDaysRemaining: number` from `todayState` (server-computed, reactive).
- `hasAccess = rcPremium || mirrorPremium || trialActive || referralRewardActive`, exported as **`hasHALEPlus`** (alias kept; `hasAccess` retained for back-compat with existing call sites).
- Keep the existing `loading` guard so gated UI never flashes locked→unlocked.
- `api.users.todayState` returns `referralRewardActive` + `rewardDaysRemaining` (from `resolveEntitlement`), so the client mirror is reactive and needs no extra round-trip.

## 3. Referral data model (Convex)

### 3.1 `users` table additions

| Field | Type | Notes |
|-------|------|-------|
| `referralCode` | `string` (optional until generated) | Unique, squad-style unambiguous alphabet (no 0/O/1/I), 6 chars. Created idempotently on first request. |
| `referredBy` | `Id<'users'>` (optional) | Attribution. Set **once**, never overwritten. Self-reference blocked. |
| `referralRewardEndsAt` | `number` (epoch ms, optional) | Reward window end. OR'd into `resolveEntitlement`. |
| `referralRewardGrantedAt` | `number` (epoch ms, optional) | Grant-exactly-once marker. Non-null ⇒ never grant again. |

New index `by_referralCode` for code → user resolution.

### 3.2 New table `referrals`

One row per directed `(referrerId, inviteeId)` edge.

| Field | Type | Notes |
|-------|------|-------|
| `referrerId` | `Id<'users'>` | Who shared. |
| `inviteeId` | `Id<'users'>` | Who installed via the link. |
| `code` | `string` | Referrer's `referralCode` at attribution time. |
| `installedAt` | `number` | Attribution timestamp (onboarding commit of the invitee). |
| `pairedAt` | `number` (optional) | Set when invitee pairs with referrer. |
| `status` | `'attributed' \| 'completed' \| 'void'` | `attributed` after install; `completed` after pair; `void` reserved (e.g. self-referral guard slips). |
| `countedAt` | `number` (optional) | When it counted toward the referrer's total (== `pairedAt` on first completion). |

Indexes: `by_referrer` (`referrerId`), `by_invitee` (`inviteeId`), `by_pair` (`referrerId`,`inviteeId`) for idempotent upsert/dedupe. The `(referrerId, inviteeId)` pair is the dedupe key — an invitee counts at most once per referrer.

### 3.3 Functions (Convex)

- `referrals.getOrCreateMyCode()` (mutation) — idempotent; returns `{ code, link, friendlyLink }` where `link = hale://u/<userId>` and `friendlyLink = hale://r/<code>`.
- `referrals.attribute({ referrerId })` (internal, called from onboarding commit) — if caller has no `referredBy`, isn't the referrer (self-block), and is genuinely new: set `referredBy`, upsert a `referrals` row `status: 'attributed'`, fire `referral_install_attributed`. Idempotent.
- Completion hook **inside `buddies.pairWith()`** — after a successful active pairing, if the newly-paired partner is the caller's `referredBy` (or the caller is the partner's `referredBy`), find the `referrals` row, and if not yet `completed`: set `status: 'completed'`, `pairedAt`, `countedAt`, fire `referral_buddy_paired`, then run the reward check for the **referrer**. Idempotent — re-pairs do not re-count.
- Reward check `model/referral.ts#maybeGrantReward(referrerId)` — count distinct `completed` rows for the referrer; if `>= 3` and `referralRewardGrantedAt` is null: set `referralRewardEndsAt = now + 7*DAY_MS`, `referralRewardGrantedAt = now`, fire `referral_completed` + `reward_granted`. **Granted exactly once.** (Seam: if an RC secret is later configured, also enqueue a promotional-entitlement grant here — no-op without it.)
- `referrals.myProgress()` (query) — returns `{ code, link, friendlyLink, completedCount, target: 3, rewardActive, rewardDaysRemaining, invitees: [{ name?, status, pairedAt? }] }` for the progress UI.

### 3.4 Edge cases (all handled + tested)

- **Self-referral**: `attribute` rejects `referrerId === caller`. Link opened by the referrer themselves never attributes.
- **Duplicate installs / re-pairs**: idempotent on the `(referrerId, inviteeId)` row; counts once.
- **Grant once**: `referralRewardGrantedAt` guard. A 4th/5th referral does not extend or re-grant (MVP — documented; future stacking is a fast-follow).
- **Unpair after counting**: no-op for referral state. `status` stays `completed`; reward window untouched. (Decision #4.)
- **Reward + paid overlap**: `resolveEntitlement` precedence handles it; buying a sub during a reward window simply changes `source` to `paid`. Reward window is not cleared (harmless; it just becomes moot).
- **Reward + trial overlap**: both OR into `hasHALEPlus`; no double-spend concept — whichever lasts longer governs access. Reward does not extend the trial and vice-versa.
- **Attribution races onboarding**: attribution happens at onboarding commit (after the user row exists), then pairing happens in the same commit path — ordering guaranteed by the existing `pendingBuddy` redemption sequence.

## 4. Deep link + attribution flow

The referral link **is** the existing buddy deep link `hale://u/<referrerId>`, plus a friendly alias `hale://r/<code>` that resolves to the same referrer. No separate code is required for attribution; the friendly code is for human-readable share copy and resolves via `by_referralCode`.

Flow (reuses existing `pendingBuddy` plumbing in `src/lib/pendingBuddy.ts` + `src/app/u/[id].tsx`):

1. Friend opens `hale://u/<referrerId>` (or `hale://r/<code>`) **before onboarding** → existing `setPendingBuddy(id)` stash, **extended** to also remember the pending referrer (same id). The `r/<code>` route resolves the code to a userId first, then behaves identically.
2. Friend completes onboarding → at commit (`quiz.tsx`): (a) `referrals.attribute({ referrerId })` = **install attribution** (`referral_install_attributed`), then (b) existing `pairWith({ inviterId })` = **completion step**, whose internal hook fires `referral_buddy_paired` and runs the reward check.
3. **Install alone never counts** — if the friend installs but never pairs, the row stays `attributed`, not `completed`.
4. Friend who is an **existing** (already-onboarded) user opening the link just pairs (no new attribution — they are not a fresh install). They do not count as a referral install.

**Simulator limitation (called out honestly):** true cross-device *install attribution* (a fresh install on a second physical phone resolving the link) cannot be fully reproduced in one simulator. We verify the attribution→pair→reward→entitlement→unlock chain *mechanically* via a deep link + a second anonymous account in the sim. **Two-phone attribution timing is the #1 real-device launch test.**

## 5. Reusable blurred paywall: `LockedFeature`

One component: `src/components/ui/LockedFeature.tsx`.

```
<LockedFeature feature="analytics" variant="overlay" title? subtitle?>
  {/* the real premium content */}
</LockedFeature>
```

Behavior:

- **Unlocked** (`hasHALEPlus`): early-returns `children` directly — **zero blur/wrapper cost on the happy path**. This is the anti-jank design: gated screens for paying users render exactly as if the component weren't there.
- **Loading**: renders `children` under a neutral non-interactive veil (no lock chrome) until `usePremium().loading` resolves — never flashes a locked state at a paying user.
- **Locked**: renders `children` inside a **non-interactive blurred layer** (`expo-glass-effect` `GlassView`; graceful fallback to an opacity + `coal` scrim where glass is unsupported) + a centered `volt` Lock badge + "Unlock with HALE+" CTA. Tapping anywhere on the surface fires `paywall_feature_tapped { feature }` then opens the paywall (`presentPaywall(feature)`; falls back to `router.push('/paywall')`).
- `variant: 'overlay'` (full-cover, for whole screens like analytics) | `'inline'` (card-shaped, for a gated section inside a populated screen).
- Visual identity matches tokens: `volt` accent, Display/Heading type, soft volt gradient glow (same treatment as `TransformationCard`), `Button` primary CTA, light success haptic on the CTA.

The dedicated `src/app/paywall.tsx` is unchanged and remains the main upsell.

## 6. Gating map

| Feature | Free | HALE+ | Treatment | Milestone |
|---|---|---|---|---|
| Streak + daily check-in | ✅ | ✅ | none (viral/retention) | — |
| Milestone share card | ✅ | ✅ | none (viral seed) | — |
| Buddy invite / pairing | ✅ | ✅ | none (viral seed) | — |
| Basic craving SOS (ride-it-out + breathe) | ✅ | ✅ | none | — |
| Money-saved + days-clean counter | ✅ | ✅ | none | — |
| Sage coaching | small daily cap | unlimited | cap-hit state → upgrade CTA (reuses existing cap) | 5 |
| Full analytics / recovery history + charts | 🔒 | ✅ | `LockedFeature` overlay (migrate existing gate) | 5 |
| Multiple squads | 1 squad | unlimited | enforce 1 free; `LockedFeature` on 2nd+ | 5 |
| Home-screen widgets | 🔒 preview | ✅ (fast-follow) | blurred preview surface | 5 |
| Advanced craving toolkit (new) | 🔒 | ✅ | `LockedFeature` inline; thin-but-real content | 8 (lowest priority; deferrable) |

Free keeps every viral/retention surface ungated. HALE+ is depth.

## 7. PostHog funnel events

Added to the `Ev` enum (`src/lib/analytics.ts`) and documented in `docs/ANALYTICS_EVENTS.md`:

| Event | Fires when | Key props |
|---|---|---|
| `referral_link_shared` | user taps share on a referral surface | `surface` |
| `referral_install_attributed` | invitee attributed at onboarding commit | `referrer_id` |
| `referral_buddy_paired` | attributed invitee pairs with referrer | `referrer_id` |
| `referral_completed` | referrer reaches 3/3 | `referrer_id` |
| `reward_granted` | 7-day reward granted | `reward_days: 7` |
| `paywall_feature_tapped` | a blurred feature is tapped | `feature` |
| `subscription_started` | paid sub begins (purchase) | `plan` |

Already present and reused: `paywall_viewed` (`PAYWALL_VIEWED`, carries `surface`), `trial_started` (`TRIAL_STARTED`). The `feature` prop on `paywall_feature_tapped` answers "which locked feature drives the most paywall taps"; the referral funnel vs `subscription_started` answers the referral-vs-pay split.

## 8. Referral UI

- **Squad tab solo state** + a dedicated **"Invite friends, unlock HALE+"** card: one-tap share (reuses `Share.share` with the referral link + copy), fires `referral_link_shared { surface }`.
- **Progress meter** — "2 of 3 friends joined & paired" with a `volt` ring/progress, visible on the invite surface(s) so users see how close they are. Driven by `referrals.myProgress()`.
- **Reward unlock celebration** — reuse the Skia `MilestoneCelebration` → "You unlocked 7 days of HALE+", shown once when the reward is granted.
- The onboarding buddy step keeps its existing invite affordance; progress copy is additive and never blocks the invite loop.

## 9. Verification plan (live, simulator)

Build via the available Xcode/simulator MCP tooling (`xcode_build`, simulator boot/install/launch, `idb` tap/describe/screenshot) — the available equivalent of the requested ExecBro (ExecBro/Maestro are not connected in this environment). Walk the **entire** first-run journey as one continuous real-user flow: first launch → onboarding → free experience → hitting blurred/locked features → paywall → referral share-and-(simulated)-unlock → core daily loop (check-in, streak, SOS, Sage, milestone). For each screen: functionality (works / fix) + churn risk (what / why / fix).

**Mechanically verifiable in the simulator:** entitlement resolver + `hasHALEPlus`, blur lock/unlock transitions, referral attribution→pair→reward grant→entitlement sync→blur unlock (via deep link + a second anonymous account), all PostHog events, the funnel, gating per surface.

**NOT fully verifiable in the simulator (real-device / two-phone launch tests):** true cross-device install attribution + buddy-pair across two physical phones (**#1 launch test**); the live RevenueCat paid-purchase path (needs `[USER]` ASC products + RC keys); push-delivered buddy rally timing on real hardware.

## 10. Tooling notes (honesty)

- `context7` MCP is **not** in this repo's `.mcp.json`. Current RevenueCat / Expo deep-link docs will be pulled via WebFetch against the official docs instead (or context7 can be added).
- RevenueCat keys remain scaffold per `RELAUNCH_PLAN` — the Convex reward, blur, funnel, and referral loop are fully testable without live RC; the paid purchase path is the documented `[USER]` gate.
- Expo SDK 56 is pinned; consult `https://docs.expo.dev/versions/v56.0.0/` before touching native/config (per `AGENTS.md`).

## 11. Execution milestones

Commit per feature; main shippable + `tsc` clean throughout; do not stage `convex/_generated/*`.

1. **Entitlement resolver** — `model/entitlement.ts`, `tierOf` update, `todayState` + `usePremium` expose `referralRewardActive` / `rewardDaysRemaining`, `hasHALEPlus`.
2. **Referral schema + logic + unit tests** — `users` fields, `referrals` table, code gen, attribute, completion hook, `maybeGrantReward`, `myProgress`; edge-case unit tests.
3. **Deep-link attribution** — extend `pendingBuddy` + `u/[id].tsx` + `r/[code].tsx`; wire attribute+pair at onboarding commit.
4. **`LockedFeature` component** — blur overlay, variants, analytics tap, paywall open.
5. **Apply gating** — analytics (migrate), multiple squads (enforce + blur), widgets preview, Sage cap-hit upgrade CTA.
6. **Referral UI + celebration** — share, progress meter, reward celebration.
7. **PostHog + docs** — events wired, `ANALYTICS_EVENTS.md` updated.
8. **Advanced craving toolkit** (lowest priority, deferrable) — urge-surf exercise + trigger-pattern insight + craving-time heatmap, blurred.
9. **Live sim verification + churn report** — full-journey walk, fixes, deliverables.

## 12. Deliverables (final report)

- Feature → free/gated table (from §6, as-built).
- Referral flow end-to-end with the exact trigger (install + buddy-pair) + reward behavior.
- Confirmation the blur component is reusable and applied to every gated surface.
- Full list of PostHog events now firing.
- Screen-by-screen report: screen → functional (pass/fail + fix) → churn risk (what/why/fix), then a ranked top-churn-points list with highest-impact fixes.
- Explicit honest split: verified live on the simulator vs. needs real-device/two-phone testing post-launch (referral cross-device attribution = #1).

## 13. Open risks

- Expo SDK 56 + `expo-glass-effect` blur behaviour on the simulator may differ from device; the opacity/scrim fallback de-risks this.
- "Multiple squads" gating requires confirming the current free squad-count behaviour before enforcing a limit (verify in milestone 5; don't strand existing multi-squad users — none in MVP since unreleased).
- Advanced toolkit (M8) is explicitly deferrable; if M1–M7 + verification consume the week, it ships fast-follow without blocking launch.
