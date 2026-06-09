# HALE — Analytics Events Reference (Day-One Data Contract)

What we collect from the first cohort, and how it answers the five questions the
profitability brief flagged as "hard to change after launch":

- **q1** real activation event · **q2** paired-vs-solo retention/LTV lift · **q3** K-factor · **q4** relapse predictors · **q5** features → conversion

Two stores: **PostHog** (behavioral, time-series, cohorts) and **Convex** (relational/graph — the authoritative moat that can't be reconstructed later). Many facts live in BOTH on purpose.

Verification legend: ✅ fired live this session (device `[ev]` log + ingested into PostHog) · ⚙️ wired + deploys, not yet exercised live · 🌐 needs a real key for full data (see bottom).

---

## Cohort snapshot — merged into EVERY PostHog event
Set by the always-mounted `PushSync` effect (`src/app/(tabs)/_layout.tsx`) via `setCohortSnapshot()` and merged in `track()` (`src/lib/analytics.ts`). Lives at the **event level** (immune to person-on-events ingest-time drift — the §0 fix that protects q2).

| prop | values |
|---|---|
| `paired_solo_status` | `solo` \| `paired` |
| `tier` | `free` \| `trial` \| `paid` |
| `quit_stage` | `d0_7` \| `d8_30` \| `d31_90` \| `d90plus` (shared `quitStage()` in `convex/model/cohort.ts`) |
| `timezone` | IANA tz |

> Authoritative paired-vs-solo + WHEN lives in Convex `buddyLinks.pairedAt`; the event prop is the convenience slice. A retention split joins behavior → the pairing timeline.

---

## Events

### Onboarding / activation funnel
| event | props (beyond cohort) | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `onboarding_started` | — | ✓ | — | quiz mount | ✅ |
| `plan_viewed` | — | ✓ | — | reveal | ✅ |
| `quit_committed` | product_type, baseline_per_day, projected_annual | ✓ | — | commit | ✅ |
| `trial_started` | trial_days | ✓ | — | commit | ✅ |

### Buddy-pairing as the activation event (P1) — q2 + q3
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `invite_offered` | invite_source, is_default_path | ✓ | — | onboarding invite step | ✅ |
| `buddy_invited` | invite_source (`onboarding`\|`squad_tab`), pairing_method, link_id | ✓ | — | invite tap (onboarding + Squad) | ⚙️ (squad path code-identical; invite_offered + matchmaking fired) |
| `matchmaking_requested` | — | ✓ | matchRequests | "find me a buddy" | ✅ |
| `matchmaking_matched` | pairing_method, pool_size | ✓ | matchRequests/buddyLinks | match found | ✅ |
| `matchmaking_no_match` | pool_size | ✓ | matchRequests (waiting) | empty pool | ⚙️ (matched path fired) |
| `buddy_paired` | via, pairing_method | ✓ | **buddyLinks** (pairedAt/pairingMethod/initiatorId) | pair (onboarding/deep-link/matchmaking) | ✅ |
| `solo_bridge_taken` | reason | ✓ | — | "start on my own" | ⚙️ (not exercised — honestly absent in PostHog) |

### North-Star activation + candidates (P2) — q1
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `activated_paired_quitter` ★ | pairing_method, hours_pair_to_checkin | ✓ | **activationEvents** | first check-in while paired ≤48h of pairing (server-detected) | ✅ |
| `first_check_in` | pairing_method | ✓ | **activationEvents** | first ever check-in (server) | ✅ |
| `first_sos` | — | ✓ | — | first SOS open (client guard) | ✅ |
| `first_sage_message` | — | ✓ | — | first Sage send (client guard) | ✅ |

★ **North Star = Weekly Active Paired Quitters** = PostHog query on `checkin_completed` where `paired_solo_status=paired` in the trailing 7 days. `activationEvents` (Convex) lets the post-launch D30 retention-split COMPARE the four candidates directly (q1).

### Core loop
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `counter_viewed` | — | ✓ | — | Today mount | ✅ |
| `checkin_completed` | streak, usedFreeze | ✓ | checkIns | check-in | ✅ |
| `streak_freeze_used` | streak | ✓ | — | freeze applied | ⚙️ |
| `milestone_reached` | day | ✓ | — | milestone overlay | ⚙️ |
| `card_shared` | day, source | ✓ | — | share card | ⚙️ |

### Social
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `nudge_sent` | type, surface | ✓ | nudges | send support | ⚙️ |
| `nudge_opened` | type | ✓ | — | nudge inbox tap | ⚙️ |

### Intelligence (SOS / relapse) — q4
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `craving_sos_opened` | — | ✓ | — | SOS mount | ✅ |
| `craving_logged` | outcome, resolvedBy, intensity | ✓ | cravings | log save | ⚙️ |
| `craving_survived` | resolvedBy | ✓ | — | survived | ⚙️ |
| `relapse_logged` | kind, streak_at_relapse, lapses_before_relapse | ✓ | quitAttempts (lapseCountBeforeRelapse) | lapse/relapse | ⚙️ (relapse flow verified pre-instrumentation; props additive) |
| `relapse_recovered` | trigger | ✓ | — | recovery done | ⚙️ |
| `relapse_trigger_named` | trigger | ✓ | quitAttempts (endTrigger) | trigger named | ⚙️ |

### Sage cost (P3) — margin
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `coach_session` | — | ✓ | — | Coach mount | ✅ |
| `coach_message_sent` | tier, messages_today_count, cap_state | ✓ | sageMessages (user row) | send | ✅ |
| `sage_cap_hit` | tier, cap_type, daily_count | ✓ | — | daily quota reached | ✅ |
| `sage_message_completed` (cost ledger) | — | — | **sageMessages** (inputTokens/outputTokens/costUsdProxy/userTier/cacheHit/model) | sage reply written | ✅ plumbing / 🌐 token values |

> Sage cost-per-payer is a Convex query: `sum(costUsdProxy) by userTier` on `sageMessages` (+ `users.sageCostMtdUsd`). Token/cost numbers are **0 on the canned fallback** — real values need Anthropic credits.

### Monetization — q5
| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `paywall_viewed` | source/surface | ✓ | — | paywall (`presentPaywall`) | ⚙️ |
| `paywall_feature_tapped` | `feature` (analytics \| unlimited_sage \| multiple_squads \| widgets) | ✓ | — | a blurred `LockedFeature` is tapped | ⚙️ |
| `purchase_completed` | via, result | ✓ | — | purchase/restore | 🌐 (needs RevenueCat key) |
| `subscription_started` | surface | ✓ | — | a NEW paid sub (PURCHASED, not RESTORED) | 🌐 (needs RevenueCat key) |

> `paywall_feature_tapped.feature` answers "which locked surface drives the most paywall taps." `subscription_started` vs `referral_completed` gives the referral-vs-pay split.

### Referral reward funnel — virality + q5
The trigger is **install via the link (attributed)** + **buddy-pair (the bar)**. At 3 completed, the referrer unlocks a one-time 7-day HALE+ window. All events carry `referrer_id` so the funnel keys on the referrer even when fired from the invitee's device. Convex `referrals` table is the authoritative ledger.

| event | props | PostHog | Convex | fires | ✓ |
|---|---|---|---|---|---|
| `referral_link_shared` | surface | ✓ | — | user shares their referral link (ReferralCard) | ⚙️ |
| `referral_install_attributed` | referrer_id | ✓ | `referrals` (attributed) | invitee attributed at onboarding commit | ⚙️ |
| `referral_buddy_paired` | referrer_id | ✓ | `referrals` (completed) | attributed invitee pairs with the referrer | ⚙️ |
| `referral_completed` | referrer_id | ✓ | `referrals` (count≥3) | referrer reaches 3 completed | ⚙️ |
| `reward_granted` | referrer_id, reward_days (7) | ✓ | `users.referralRewardEndsAt` | the one-time 7-day reward is granted | ⚙️ |

> Edge rules (enforced in `convex/referrals.ts`): self-referral blocked · `referredBy` set once · one row per (referrer, invitee) dedupes installs/re-pairs · reward granted exactly once (`referralRewardGrantedAt`) · **unpair after counting = no clawback** (completed stays completed, the 7-day window runs out). Both the reward and a paid sub feed one `hasHALEPlus` (`convex/model/entitlement.ts`).

---

## Convex graph / relational tables (the moat — not reconstructable later)
- **buddyLinks** — `pairedAt` (WHEN) · `pairingMethod` (HOW: invite_onboard/invite_squad/matchmaking) · `initiatorId` (WHO) → q3 K-factor + the 48h activation window. ✅
- **matchRequests** — matchmaking pool audit (status, bucket, matchedLinkId) → who matched whom via the pool. ✅
- **activationEvents** — one row per (user, kind) for the 4 activation candidates → q1 D30 split, directly queryable. ✅
- **quitAttempts.lapseCountBeforeRelapse** → q4 relapse predictor. ⚙️
- **sageMessages** token/cost ledger (+ `by_user_tier_ts` index) → Sage cost-per-payer. ✅ plumbing.
- **cravings**, **checkIns** — existing relapse/craving signal rows.

---

## What needs a real key
- **PostHog** (`EXPO_PUBLIC_POSTHOG_KEY`) — SET ✅. Without it `track()` is a silent no-op (device `[ev]` log still works). Confirmed delivering: 12 custom events ingested this session.
- **Anthropic** (`ANTHROPIC_API_KEY`, Convex env) — SET but credit-less → Sage serves the warm fallback, so `sageMessages` token/cost log 0. Caps / tier-gating / `sage_cap_hit` work WITHOUT credits (verified). Real cost numbers need credits.
- **RevenueCat** (`appl_` key) — NOT set (scaffold). `purchase_completed` + real LTV need it.
- **Server-side PostHog** — intentionally NOT used. Server-detected activation events are written to Convex (`activationEvents`) and mirrored to PostHog by the client, so no server PostHog key is required.

⚠️ `convex/_devtest.ts` (uncheckIn/backdateQuit/resetAll/seedWaitingPeer/setSageCount/seed*) is dev-only, **untracked**, and must be removed before the production Convex deploy.
