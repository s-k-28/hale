# Swift Port — Fidelity + Robustness Pass

Status of the fidelity/robustness/test pass over `apple/Hale/Features/` (RN parity
against `src/app/`). Build + tests green throughout. RN/`convex/` untouched.

## Done this pass

### Part A — fidelity
- **Analytics taxonomy** (`AnalyticsService.swift`): ported the FULL `Ev` map from
  `src/lib/analytics.ts` (was a ~18-case subset). Fixed wrong raw values that broke
  continuity: `check_in_completed`→`checkin_completed`, `sos_opened`→`craving_sos_opened`,
  `referral_shared` split into `referral_link_shared` (hubs) + `card_shared` (share card).
- **Per-screen event firing** wired to match RN, consuming mutation results for props:
  Today (checkin_completed / streak_freeze_used / first_check_in / activated_paired_quitter /
  counter_viewed), SOS (craving_sos_opened / first_sos / craving_logged / craving_survived /
  relapse_logged +streak_at_relapse/lapses / relapse_trigger_named / relapse_recovered),
  Toolkit (analytics_viewed / craving_sos_opened{tool} / resolved_by key), Coach
  (coach_session / coach_message_sent / first_sage_message / sage_cap_hit), Squad
  (buddy_invited / nudge_sent / buddy_unpaired), SquadsHub (squad_joined), Leagues
  (league_optin join/leave), Goals (savings_goal_set / goal_deleted), Insights
  (analytics_viewed{locked}), You (card_shared / paywall_viewed surface), Delete
  (account_deleted), Paywall (paywall_viewed **surface** key / trial_started).
- **Quiz commit funnel**: now consumes attributeInstall / pairWith / requestMatch
  results → fires referral_install_attributed, buddy_paired (+pairing_method),
  referral_buddy_paired / referral_completed / reward_granted, matchmaking_requested/
  matched/no_match, solo_bridge_taken; fixed invite step firing `invite_offered`
  (was wrongly `buddy_paired`); added `identifyPurchaser` (RC logIn) and the
  onboarding **paywall peak** (fullScreenCover after commit); pending-buddy is now
  re-stashed on transient failure instead of dropped.
- **Deep links** (`AppState.handleDeepLink`): onboarded users now **pair immediately**
  (u/[id] parity) with the exact error copy for caller-already-paired / inviter-already-
  paired / invalid, self-pair guard, and the referral funnel events; r/[code] resolves
  then routes through the same path. Unauthenticated users stash for quiz-commit redemption.
- **Referral hub**: share text now uses the real `referralShareText` + App Store URL
  (`Links.swift`); progress pips + "N to go"/"Complete!" + invitee list; reward-active
  copy matches reward.tsx; loading (skeleton) vs empty vs data distinguished.
- **InviteCodeEntry** (welcome screen): the v1 code-first attribution entry — resolves
  a typed invite code (`resolveCode`), stashes the inviter for quiz-commit redemption,
  fires `referral_code_entered{found}`; idle→checking→applied|notFound|error states.
- **Compliance copy**: Paywall auto-renew disclosure + Privacy/Terms links + 14-day
  trial framing (3.1.2); Coach AI-consent names providers (Groq/Google) + privacy link
  (5.1.2); age-21 sentence, medical/quitline sentence, welcome legal+analytics note;
  Disclaimers now have 988 + 1-800-QUIT-NOW + not-medical block; delete-account enumerated
  data + subscription note + stronger confirm copy.
- **You**: share card now uses `currentMoneySaved` (was lifetime — wrong on the viral
  artifact); added the AI-consent toggle (setAiConsent/revokeAiConsent), Privacy/Terms/
  Support rows, "You're on HALE+" card.
- **Community**: confirmed correct to remain a flag-off stub — no tab ships in v1
  (`FeatureFlags.community = false`, matches `EXPO_PUBLIC_COMMUNITY_ENABLED` default).

### Part B — robustness
- New `DesignSystem/Components/States.swift`: `ToastCenter`/`Toast` (top, auto-dismiss,
  swipe), `SkeletonBlock`/`SkeletonList`, `EmptyStateView`, `ErrorStateView`,
  `ReconnectBanner`. Toast host + reconnect banner mounted at `RootRouter`.
- **Websocket state**: `ConvexService.watchConnection()` → `AppState.reconnecting`
  (`.connecting` after first load) drives the "Reconnecting…" pill.
- **Loading/empty/error states** added to live-query screens: Today (buddy skeleton),
  Coach (loading vs empty vs transcript, pre-consent shows empty state), Squad family,
  Goals, Insights, Referral, Leagues.
- **Optimistic + error toasts**: cheer (optimistic flip + revert on failure), check-in
  (error toast), Sage send (fixed the draft-loss-on-network-error bug + error toast),
  goals/squad-join/purchase/restore/unpair error toasts. Unpair now confirms first.
- **Accessibility**: Sora ramp now scales with Dynamic Type (`relativeTo:` per style);
  VoiceOver labels on `IconBtn` (Close/Back/…); RingBurst suppressed under Reduce Motion
  (ambient animations already were).

### Part C — tests (`apple/HaleTests/`)
- `DTOMoreDecodeTests.swift`: decode coverage for myBuddy, sage messages, nudges, goals,
  cravings, leagues, squads, feed, and every mutation-result DTO (CheckIn/Pair/Match/
  Attribution/SageSend/Relapse), incl. null/optional/empty edges.
- `DeepLinkTests.swift`: DeepLink parser edges (host/path forms, both schemes, wrong
  scheme, unknown route, missing value) + PremiumResolver truth table.
- 169 model golden fixtures still green.

## Follow-up pass (additional long-tail cleared)

- **Today nudge inbox**: live `myNudges` + tap → `nudge_opened{type}` + `markRead`
  (warm card, renders only when a nudge exists).
- **Squads — CreateSquad**: name + 6-week-challenge toggle + discoverable toggle →
  `createSquad`, `squad_created{isPublic,startChallenge}`, share the returned code
  (`squad_invited`); 1-squad free limit gated by `LockedFeature`→paywall; squad cards
  now show challenge progress + days-left and Share/Leave (`squad_left`).
- **You — milestone history**: "Your recovery so far" card listing reached health
  milestones (via `Plan.reachedHealthMilestones`) with count badge + not-medical note.
- **SOS CravingLog**: richer labels ("How strong was it?"/"What set it off?"/"Where were
  you?"), Barely-there↔Intense scale captions, full 10-trigger set + context chips
  (now passed through to `logCraving`).
- Fixed a build blocker in the parallel widget layer (`HaleWidgetGalleryView` used the
  read-only `\.widgetFamily` keypath with `.environment` → switched to
  `.previewContext(WidgetPreviewContext(family:))`).

## Remaining long-tail (deferred, not blocking)

Fidelity items intentionally left; none affect correctness/continuity of shipped flows:

- **Onboarding/Referral**: dedicated `referral/share` screen (6-char `Display` render);
  the hub already shows the code + share button, so this is cosmetic. The 3rd onboarding
  invite button ("Invite a buddy" → referral hub) and the `pairedInOnboarding` skip.
- **Today**: unpaired "Quit with a buddy" CTA, "locked in for today"/freeze-reserve lines.
- **Squad**: inline ReferralCard on the squad tab, buddy relational/last-seen line,
  cheer floating-heart animation. (Public squad discovery stays flag-off — correct.)
- **SOS**: "Advanced toolkit" row on home, RecoverKindly best-streak==1 variant.
- **You**: blocked-members list (`myMutes`/`unmuteProfile` — community moderation, flag-off
  surface), fuller disclaimer source list (11 cited pairs vs 5).
- (Toolkit trigger-insight + 24h heatmap, and Insights intensity line chart / headline
  stats / empty states were completed by the visual-polish layer.)
- Assorted per-screen copy micro-diffs (per-product quiz subtitles, etc.).
