# HALE — Apple App Store Security & Compliance Audit

**Date:** 2026-06-12 · **Scope:** iOS submission readiness (Apple App Review Guidelines, 2025–2026 updates) with Android notes · **Method:** researched requirements cross-checked against codebase audit

---

## Executive Summary

HALE's hardest engineering work is already done: pre-publish AI moderation of all community content with a fail-safe "never auto-publish" design, system-generated pseudonyms, crisis/medical routing guardrails in Sage's backend, anonymous-first auth that satisfies Apple's no-forced-login expectation, no iCloud health storage, no tracking SDKs, and a real app-level privacy manifest. However, the app **cannot pass review today** because of six true blockers: (1) no in-app account deletion despite persistent anonymous accounts holding health logs and UGC (Guideline 5.1.1(v)); (2) no consent or disclosure before sending health-adjacent chat data to third-party AI providers — note the live providers are **Groq (chat), Google Gemini (embeddings), and Anthropic (moderation)**, not Gemini-for-chat as researched (5.1.2(i), Nov 2025 update); (3) no published contact information anywhere in the app (1.2); (4) no privacy policy in the app, on the web, or in App Store Connect (5.1.1(i)); (5) blocking operates on per-group pseudonyms rather than the underlying account, so an abusive user reappears in other groups (1.2); and (6) reports go to a write-only audit table with no triage, no admin removal path, and no ability to ban a user — failing the "timely responses" and 24-hour-action requirements (1.2). The February 6, 2026 guidelines update putting anonymous-handle communities under explicit 1.2 scrutiny makes the moderation back-office and ban capability non-optional. A second tier of likely-rejection items (Sage chat-screen disclaimer, pro-vaping RAG chunks under 1.4.3, EULA gate, milestone phrasing) are mostly small copy/config fixes. Finally, submission is mechanically blocked until the new 5-tier age-rating questionnaire (deadline passed Jan 31, 2026) and App Privacy labels are completed in App Store Connect.

---

## 🚫 Blockers — will be rejected without these

| # | Item | Guideline | Status | Effort |
|---|------|-----------|--------|--------|
| B1 | Published support contact reachable in-app | 1.2 | missing | ~Hours |
| B2 | Explicit consent before sending data to third-party AI (Groq/Gemini/Anthropic) | 5.1.2(i) | missing | ~1 day |
| B3 | Privacy policy: published, linked in-app, and in ASC | 5.1.1(i), 5.1.3(i) | missing | ~1–2 days |
| B4 | Block abusive users at the **account** level (not per-group pseudonym) | 1.2 | partial | ~1–2 days |
| B5 | Report triage: admin queue, SLA alerting, content removal, user ban/eject | 1.2 (+ 24h rejection boilerplate) | partial | ~2–4 days |
| B6 | In-app account deletion with full data cascade | 5.1.1(v) | missing | ~3–5 days |

### B1. Published contact information reachable from the app
- **Requirement:** Guideline 1.2 requires "published contact information so users can easily reach you" — a working support channel discoverable inside the app plus a working ASC Support URL. ([guidelines #user-generated-content](https://developer.apple.com/app-store/review/guidelines/#user-generated-content))
- **Current status:** Missing. Grep across `src/`, `convex/`, and `web/index.html` for `support@`/`mailto`/contact strings returns nothing; `src/app/(tabs)/you.tsx` has no contact row.
- **Fix:** Add a "Contact / Support" row in `src/app/(tabs)/you.tsx` opening `Linking.openURL('mailto:support@haleapp.com')`; add the same email to `web/index.html` (backs go.haleapp.com); reference it in the community-rules screen (B5/L4). Set the ASC Support URL to that page (see checklist).

### B2. Explicit user consent before sharing personal data with third-party AI
- **Requirement:** Guideline 5.1.2(i) (Nov 13, 2025 update): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." Privacy-policy text alone is insufficient. ([Apple news](https://developer.apple.com/news/?id=ey6d8onl))
- **Current status:** Missing. Three undisclosed AI flows carry user personal/health data: (1) full chat history + quit-journey health context (streak, triggers, craving counts) POSTed to Groq — `convex/sage.ts:134-150`, `sage.ts:204-247`; (2) each user message embedded via Google Gemini for RAG — `convex/rag.ts:20-24`, `convex/sageKnowledge.ts:28-47`; (3) community post/comment bodies sent to Anthropic for moderation — `convex/communityModeration.ts:90-103`. `grep -ri consent` across `src/` and `convex/` finds no consent UI or stored flag. (Researcher's "Gemini powers chat" claim is wrong — chat is Groq, Gemini is embeddings-only; 5.1.2(i) applies identically.)
- **Fix:** One-time consent card in `src/app/(tabs)/coach.tsx` before the first send, naming Groq (replies) and Google (search embeddings) and the data shared (messages + quit stats), with explicit Accept and a Decline path that blocks only AI chat. Persist `aiConsentAt` on the `users` table (`convex/schema.ts`) via a `convex/users.ts` mutation and gate `convex/sage.ts` send server-side until set. Disclose the Anthropic moderation flow in the community rules/privacy policy. Mention the flow in review notes.

### B3. Privacy policy — published, linked in-app, entered in App Store Connect
- **Requirement:** Guideline 5.1.1(i): privacy policy link required in ASC and within the app, identifying all data collected, all third-party recipients, retention/deletion. 5.1.3(i) additionally requires disclosing the **specific health data** collected. ([guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **Current status:** Missing entirely. Searched `src/`, `web/`, `convex/`, `docs/` — only code comments and a dead mockup anchor (`docs/onboarding-mockups/14-paywall.html:231`). No legal links in `you.tsx` or `paywall.tsx`; no `web/privacy.html`; no ASC URL field populated.
- **Fix:** Publish `web/privacy.html` on the go.haleapp.com static kit naming Convex, PostHog, Sentry, OneSignal, RevenueCat, Groq, Google (Gemini embeddings), Anthropic; enumerate health data collected (cravings + intensity, relapses + triggers, check-ins/streaks, quit date, hardest hour, Sage chat); state health data is used solely for app functionality/health management, never advertising (5.1.3(i)); document deletion path and consent withdrawal. Add tappable "Privacy Policy" rows in `src/app/(tabs)/you.tsx` (~line 300) and `src/app/paywall.tsx`. Enter the URL in ASC.

### B4. Block abusive users — must key on the account behind the handle
- **Requirement:** Guideline 1.2: "the ability to block abusive users from the service." Because users are pseudonymous, blocking must operate on the underlying account id, not the display identity. ([guidelines #user-generated-content](https://developer.apple.com/app-store/review/guidelines/#user-generated-content))
- **Current status:** Partial. Mute exists and filters server-side (`convex/communityModeration.ts:272-312`, `convex/communityPosts.ts:182-186, 199-203, 300-304`; UI at `src/components/community/PostCard.tsx:184-189`). **Gaps:** mute keys on `anonProfileId`, and `anonProfiles` are per `(userId, groupId)` (`convex/community.ts:46-79`, `schema.ts:308-316`) — muting in one group does not hide the same user elsewhere; no block action on comment authors (comments only offer Report); `myMutes` query exists (`communityModeration.ts:319-335`) but no settings UI consumes it.
- **Fix:** In `muteProfile`, resolve `profile.userId` and store mutes keyed by `mutedUserId` (new column/table + index); rebuild the exclusion set in `loadMutedProfileIds` (`convex/communityPosts.ts:75-84`) from `userId` so all pseudonyms are hidden across every group. Add "Block {handle}" to the comment-row alert in `PostCard.tsx`. Add a "Muted members" row in `you.tsx` backed by `myMutes`/`unmuteProfile`.

### B5. Report triage, 24-hour response, content removal, and user ejection
- **Requirement:** Guideline 1.2 requires "a mechanism to report offensive content and **timely responses** to concerns"; Apple's standard 1.2 rejection text requires acting on reports **within 24 hours** by removing content and ejecting the offender, plus a method for ejecting users. ([guidelines](https://developer.apple.com/app-store/review/guidelines/#user-generated-content); [forum thread 116703](https://developer.apple.com/forums/thread/116703); [BuddyBoss guide](https://buddyboss.com/docs/app-store-guideline-1-2-safety-user-generated-content/))
- **Current status:** Partial. Report UI exists on every post and comment (`PostCard.tsx:177-181`, `:142-147`; wired in `src/app/community/[groupId].tsx:86-95` to `reportContent`, `communityModeration.ts:238-264`, table at `schema.ts:375-383`). **Gaps:** reports are "audit trail; no automated action in v1" (`schema.ts:374`) — no moderator alert, no SLA cron (`convex/crons.ts` has none), no admin query listing open reports, no `removeContent` mutation, no ban capability anywhere (`users` has no `bannedAt`; `createPost`/`createComment` at `communityPosts.ts:94-142, 242-278` check only auth + rate limit), and the report UI never collects a reason.
- **Fix:** In `convex/communityModeration.ts` add admin mutations `removeContent(targetType, targetId)` (patch status to a new `removed` value) and `banUser(userId)` (set `users.bannedAt`); enforce `bannedAt` in `createPost`/`createComment`/`toggleReaction`; add an admin `openReports` query (joining report → target body) plus `resolvedAt/resolvedBy` fields; add a `crons.ts` interval paging the team via `convex/email.ts` or `convex/pushes.ts` when any report is >12h unresolved; add reason categories (incl. self-harm/suicide) to the report alert in `PostCard.tsx` via the existing optional `reason` arg. A CLI runbook via `npx convex run` satisfies the back-office minimum; state the 24h policy in the community rules and review notes. This also makes the "pseudonymous but bannable" review-notes claim true (Feb 6, 2026 update: [developer.apple.com/news/?id=d75yllv4](https://developer.apple.com/news/?id=d75yllv4)).

### B6. In-app account deletion with full data cascade
- **Requirement:** Guideline 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app." Deletion must remove the entire account record and associated personal data including shared UGC; support-only flows are not allowed; applies to auto-created anonymous accounts. ([Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app))
- **Current status:** Missing. Anonymous Convex accounts are real server-side accounts (`convex/auth.ts:10-12`, created at `src/app/(onboarding)/quiz.tsx:308`) owning health logs, chats, and posts. Zero deletion code — only an anticipatory comment at `convex/buddies.ts:280`; `convex/users.ts` has no delete mutation; `you.tsx` has no settings/delete row (and no sign-out). The only `ctx.db.delete` calls in the backend are a reaction toggle and a mute removal.
- **Fix:** Add Settings > "Delete account" in `you.tsx` with a confirmation step, backed by a Convex mutation/action (e.g. `users.deleteAccount`, table list centralized in `convex/model/deletion.ts`) cascading over every userId-keyed table in `convex/schema.ts`: `authAccounts`/`authSessions`, `users`, `quitAttempts`, `activationEvents`, `checkIns`, `cravings`, `buddyLinks`, `matchRequests`, `nudges`, `referrals`, `sageMessages`, `feedEvents`, `squadMembers`, `leagueMemberships`, `savingsGoals`, `anonProfiles`, `communityPosts/Comments/Reactions/Reports/Mutes` (delete UGC, or hard-anonymize and document the policy). Run synchronously (or mutation + immediately scheduled internal action) — no delayed-only path. Client-side on success: `OneSignal.logout()`, `posthog.reset()`, `Purchases.logOut()`, `Sentry.setUser(null)`, clear AsyncStorage/SecureStore, then `signOut()` → onboarding. Server-side: OneSignal REST delete-by-external-id, PostHog person deletion, RevenueCat subscriber delete (add helpers in `src/lib/` wrappers). For active subscribers, show "Deleting your account does not cancel your subscription" with a link to `https://apps.apple.com/account/subscriptions` (`Purchases.getCustomerInfo()` check; `setPremiumByExternalId` already no-ops for deleted users at `users.ts:127-130`). Design the action with a pluggable external-revocations step so Sign in with Apple token revocation (`https://appleid.apple.com/auth/revoke`) drops in when SIWA ships.

---

## ⚠️ Likely rejection / enforcement risk

| # | Item | Guideline | Status | Effort |
|---|------|-----------|--------|--------|
| L1 | Medical disclaimer in the Sage chat UI itself | 1.4.1 | partial | ~Hours |
| L2 | Pro-vaping RAG chunks + missing Sage anti-consumption guardrail | 1.4.3 | partial | ~Hours |
| L3 | Privacy manifest gaps: encryption key, collected-data types, app.json persistence | Privacy manifest reqs | partial | ~Hours |
| L4 | Zero-tolerance EULA gate before community access | 1.2 rejection boilerplate | missing | ~1 day |
| L5 | Milestones phrased as personal measurements, no cited sources | 1.4.1 | partial | ~1 day |
| L6 | Health-detail props in PostHog/OneSignal + no documented guardrail | 5.1.3(i) | partial | ~1 day |
| L7 | Analytics consent + in-app withdrawal (PostHog starts pre-acknowledgment) | 5.1.1(ii) | missing | ~1 day |

### L1. Sage chat screen has no medical disclaimer
- 1.4.1: "Apps should remind users to check with a doctor… before making medical decisions." Backend is strong (`convex/model/sage.prompt.ts:30, 35, 57-74, 110-117` — no-dosing rule, crisis/medical routing) and SOS/onboarding/analytics screens carry disclaimers (`sos.tsx:980-988`, `quiz.tsx:877`, `you.tsx:233`), but `src/app/(tabs)/coach.tsx` (the actual chat, 395 lines) has **zero** disclaimer — grep for medical/doctor/disclaimer returns nothing; header says "Your quit coach · always on."
- **Fix:** Persistent footer under the composer (~line 215) and/or in EmptyState (line 305), reusing the `sos.tsx:980` Disclaimer pattern: "Sage is an AI coach, not a medical professional. Consult a doctor before medical decisions, including NRT or medications." Add a `SAGE_PERSONA` line appending a see-a-doctor reminder whenever medication/NRT/symptom topics arise (today only hard dosing regexes trigger routing).

### L2. RAG corpus contains repeatable pro-vaping content; no anti-consumption guardrail in the persona
- 1.4.3: apps that "encourage consumption of tobacco and vape products… are not permitted." `knowledge/corpus.ts:1571-1588` (NHS, `referenceOnly:false`: "use it daily and choose a nicotine strength…", "roughly twice as likely to quit… if they use a nicotine vape") and `:1035/:1041` ("completely switching from smoking to vaping", "may continue vaping as a less harmful alternative") are retrievable and repeatable by Sage; "vaping" is a routed retrieval topic (`sources.config.ts:81`). `SAGE_PERSONA` (`sage.prompt.ts:27-36`) has no rule against recommending purchase/consumption or switch-to-vaping advice.
- **Fix:** Set `referenceOnly:true` (or remove) on those chunks — `referenceOnly` chunks are already excluded from repeatable evidence (`convex/sageKnowledge.ts:46`). Add a hard `SAGE_PERSONA` guardrail: never recommend buying, starting, or switching to vaping/nicotine products; never say where to buy; redirect harm-reduction-switch questions to a clinician/quitline. Optionally extend `MODERATION_SYSTEM` (`communityModeration.ts:53`) to flag tobacco/vape sale links explicitly.

### L3. Privacy manifest / export-compliance gaps
- Per Apple's [third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/): app manifest exists and is good (`ios/HALE/PrivacyInfo.xcprivacy` — FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1, `NSPrivacyTracking=false`); OneSignal/RevenueCat/Sentry pods ship their own manifests. **Gaps:** `NSPrivacyCollectedDataTypes` is an empty array (should mirror nutrition labels); `ITSAppUsesNonExemptEncryption` absent from `Info.plist` and `app.json` (export-compliance prompt every upload); no `ios.privacyManifests`/`ios.infoPlist` keys in `app.json`, so `expo prebuild --clean` could regenerate without them.
- **Fix:** Add to `app.json`: `"ios": { "infoPlist": { "ITSAppUsesNonExemptEncryption": false }, "privacyManifests": { …mirror the three accessed-API types, populate NSPrivacyCollectedDataTypes consistent with ASC labels… } }`. Do an early TestFlight upload to surface any ITMS-91053 errors.

### L4. Affirmative "I Agree" to zero-tolerance community rules before UGC access
- Apple's standard 1.2 rejection text requires terms making clear "there is no tolerance for objectionable content or abusive users," accepted via affirmative action — passive footer text is explicitly ruled insufficient. ([forum thread 116703](https://developer.apple.com/forums/thread/116703); [GoodBarber rejection guide](https://www.goodbarber.com/help/apple-rejection-r100/apple-rejection-user-generated-content-a209/))
- **Current status:** Missing — no rules text, acceptance gate, or stored acceptance anywhere (`src/constants/communityCopy.ts` has no rules copy; `users` table has no `termsAcceptedAt`, `schema.ts:16-68`).
- **Fix:** Add `COMMUNITY_RULES` copy with explicit zero-tolerance wording to `communityCopy.ts`; show a full-screen interstitial with "I Agree" on first entry to `src/app/(tabs)/community.tsx`; persist `communityRulesAcceptedAt` on `users` via a new mutation; have `createPost`/`createComment` in `convex/communityPosts.ts` reject when unset. Include the 24h policy, support email (B1), and the Anthropic moderation disclosure (B2) in the rules copy.

### L5. Health milestones read as personal measurements with no cited methodology
- 1.4.1: "Apps must clearly disclose data and methodology to support accuracy claims relating to health measurements," else rejection. `MilestoneCelebration.tsx:59-67` asserts personal facts ("Your circulation is measurably better"); the Today tab shows a personal "Recovery N%" tile (`today.tsx:356`) with no methodology; no CDC/WHO/Surgeon General citation exists anywhere (grep clean). Disclaimers on analytics/you screens exist but no sources. (No device-measurement claims — that part is fine.)
- **Fix:** Rephrase `MilestoneCelebration.tsx` subs and `HEALTH_MILESTONES` in `convex/model/plan.ts` to population-typical wording ("Typically by now, circulation improves"); add a tappable info sheet on the Recovery tile and `analytics.tsx` RecoveryProgress citing CDC/WHO/US Surgeon General quit timelines with a "typical, not measured" note.

### L6. Health-context data flowing to PostHog/OneSignal — keep it coarse, disclose it, fence it
- 5.1.3(i): health-context data may not be used/disclosed for advertising, marketing, or use-based data mining beyond improving health management. Today: `CRAVING_LOGGED` carries `intensity` (`sos.tsx:153`), `RELAPSE_LOGGED` carries `kind/trigger` (`sos.tsx:206, 217-221`), OneSignal tags carry `streak/hardest_hour` (`usePushTags.ts:69-80`) — all identified to the user (`_layout.tsx:48`, `onesignal.ts:44`). Current use is product/health-management (defensible) and there are no ad SDKs/IDFA, but nothing discloses it (see B3) and nothing prevents marketing reuse. Sage chat content is never sent to PostHog (`coach.tsx:89-93`) — good.
- **Fix:** Enumerate this data in the privacy policy + Health label; add guardrail comments in `src/lib/analytics.ts` and `src/hooks/usePushTags.ts` forbidding health content in event props/marketing export; consider dropping `intensity`/`trigger` props if not needed.

### L7. Analytics consent and in-app withdrawal
- 5.1.1(ii) requires user consent for data collection with a withdrawal path. PostHog is created eagerly at module import (`src/lib/analytics.ts:103-105`), wired app-wide (`_layout.tsx:101`), and tracks from `ONBOARDING_STARTED` before any acknowledgment; onboarding has no consent copy; no opt-out exists anywhere.
- **Fix:** Add a consent line + privacy-policy link under the welcome CTA in `src/app/(onboarding)/welcome.tsx`; default `posthog.optOut()` until acknowledgment (or lazy-init); add an "Analytics" toggle in `you.tsx` calling `optOut()/optIn()` with persisted choice.

**Android (Google Play):** complete the mandatory Health apps declaration (enforced since Aug 28, 2025) + in-app/Console privacy-policy link + Data safety form matching actual collection, or Play submission is blocked. ([Play Health policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)) — see checklist.

---

## ✅ Already compliant — do not redo

- **Pre-post content filtering (1.2):** every post/comment inserts as `pending`, classified by Claude before visibility (`convex/communityPosts.ts:124-138, 260-274`; `communityModeration.ts:53-58`), fail-safe "never auto-publish unmoderated content" (`:23-25`), shadow-ban state machine (`convex/model/communityRules.ts:57-67`), 15-min requeue cron (`crons.ts:50`). Feed shows only `published` (`communityPosts.ts:182-186`).
- **No user-chosen handles:** pseudonyms are system-generated from curated lists (`convex/model/anonHandles.ts:11-28`) — no handle-filtering obligation.
- **Favorable anonymous-community architecture (Feb 2026 1.2 update):** no random/1:1 anonymous chat; 6 fixed seeded groups, no user-created groups (`community.ts:9-26, 216-237`); persistent account-bound pseudonyms; every post stores real `userId` server-only (`schema.ts:320-364`).
- **Login architecture (5.1.1(v) / 4.8):** Anonymous-only provider (`convex/auth.ts:10-12`), fully usable with zero personal info, only quit-relevant onboarding fields (name/motivation optional, `users.ts:10-19`); no third-party login → 4.8 not triggered; purchases/restore work on the anonymous ID (`revenuecat.ts:16`).
- **No health data in iCloud (5.1.3(ii)):** health logs live in Convex + on-device only; entitlements contain no iCloud/CloudKit (`ios/HALE/HALE.entitlements`); no HealthKit.
- **No tracking / no ATT needed:** no ad SDKs, no IDFA, `NSPrivacyTracking=false`, no `NSUserTrackingUsageDescription` — labels must simply stay "Data Not Used to Track You."
- **Sage backend guardrails (1.4.1/1.4.2/4.7):** no-dosing rule incl. minors (`sage.prompt.ts:30`), crisis patterns → 988 SAFETY OVERRIDE (`:57-61, 110-113`), medical-dosing routing to clinicians (`:64-68, 114-117`), corpus-grounded anti-hallucination (`:31, 126-131`), dosing chunks excluded via `referenceOnly` (`sageKnowledge.ts:46`).
- **Crisis pathway exists:** community crisis flag → author-facing 988 CrisisCard (`[groupId].tsx:62-65, 184-188`); SOS screen disclaimer (`sos.tsx:980-988`).
- **Privacy manifest core (required-reason APIs):** app-level `PrivacyInfo.xcprivacy` declares C617.1/CA92.1/35F9.1; OneSignal/RevenueCat/Sentry pods ship manifests (only the L3 gaps remain).
- **Wellness (not healthcare) positioning in copy:** no "treatment/therapy/clinically proven/guarantee" strings in app copy; Sage self-describes as "supportive behavioral coaching, NOT medical advice" (`sage.prompt.ts:35`).

---

## 🔧 Best-practice hardening

- **Report affordance on Sage replies (4.7/1.2 pattern):** long-press/thumbs-down on sage bubbles in `coach.tsx:269-302` → extend `reportContent`'s targetType union (or a `sageMessageReports` table), reviewed alongside community reports.
- **Region-aware, server-driven crisis helplines (1.4/1.4.5):** CrisisCard currently US-988-centric; key numbers off device locale (988 US/CA, Samaritans 116 123 UK/IE, Lifeline 13 11 14 AU) with findahelpline.com fallback, served from Convex so corrections need no app update. ([Psychiatric Services 2025](https://psychiatryonline.org/doi/10.1176/appi.ps.20240485))
- **Seed demo content for review (2.1):** add `community.seedDemoPosts` internalMutation (groups already seedable via `community:seedGroups`) so the reviewer never sees an empty feed.
- **Future-login guardrail comment in `convex/auth.ts`:** "if Google login ships, Sign in with Apple ships in the same release" (4.8); SIWA button per HIG, equal-or-larger, above the fold; add sign-out UI alongside link-account.
- **Age policy decision:** `sage.prompt.ts:30` assumes minor users exist and a "teen" RAG topic exists (`sources.config.ts:63`) but there is no age gate in onboarding — align product policy before answering the age questionnaire.

---

## 📋 App Store Connect / EAS submission checklist

**App Privacy nutrition labels** (cross-checked against observed network traffic; never "Data Not Collected"):
- **Health & Fitness → Health:** Collected, **Linked** (anonymous account IDs count as linked), App Functionality (+ Product Personalization for Sage context), Tracking=No — cravings/relapses/check-ins/quit date (`schema.ts:71-127`). ([App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/))
- **User Content → Other User Content:** Linked — Sage chat (`sageMessages`), community posts/comments; shared with third-party AI (Groq/Google/Anthropic) per B2 consent flow.
- **Identifiers → User ID + Device ID:** Linked — `posthog.identify(convexUserId)` (`analytics.ts:113-115`), `OneSignal.login` (`onesignal.ts:42-44`), `Purchases.logIn` (`revenuecat.ts:13`).
- **Usage Data → Product Interaction:** Linked (PostHog/OneSignal). **Diagnostics:** Not linked (Sentry has no user context, `sentry.ts:6`). **Purchases → Purchase History:** Linked (RevenueCat).
- All categories: **Tracking = No**; keep RevenueCat ad-network/IDFA integrations off in its dashboard.

**Age rating questionnaire** (new 4+/9+/13+/16+/18+ system; deadline was Jan 31, 2026 — submissions are blocked until answered; [Apple news](https://developer.apple.com/news/?id=ks775ehf), [definitions](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)):
- Declare: UGC **with moderation** + messaging/chat capability; **AI chatbot** capability (count Sage's LLM output frequency, per Apple's explicit instruction); medical-or-treatment information (infrequent at minimum given the corpus); health/wellness topics; tobacco/drug **references** — honestly "frequent" given the app's core subject (cessation context). Declare in-app controls (filtering, reporting). **Expect and accept 13+/16+** — do not game toward 4+/9+. Mirror via Google Play IARC.

**Other ASC fields:**
- **Privacy Policy URL** → the page from B3. **Support URL** → haleapp.com page carrying the B1 contact email.
- **Export compliance:** handled in-code via `ITSAppUsesNonExemptEncryption: false` in `app.json` (L3) — standard HTTPS/exempt encryption only.
- **Developer account:** publish from an Apple Developer **Organization** (legal entity) account — sensitive health data, 5.1.1(ix); keep metadata to wellness/coaching language (no "treatment/therapy").
- **Metadata framing (1.4.3 + Feb 2026 1.2 update):** name/subtitle/description/screenshots lead with quitting; never "anonymous chat" — use "private, supportive community"; no glamorized vaping imagery; never link to nicotine sellers.

**App Review notes (write verbatim-ready, per 2.1 + 1.2 enforcement practice):**
1. *Auth:* "Login is automatic and anonymous — no demo credentials needed. Accounts are persistent server-side identities; in-app account deletion is in Settings (You tab)."
2. *Community/UGC:* "A moderated quit-nicotine peer-support feed, not anonymous chat. Handles are pseudonymous but every post maps to a real account we can ban. All content is AI-classified **before** publication (fail-safe: unclassified content is never published); every post and comment has Report and Block actions; users must accept zero-tolerance community rules before posting; reports are actioned within 24 hours (removal + ejection); a crisis classifier surfaces a 988 CrisisCard; support contact is published in-app." Seed demo posts so this is demonstrable.
3. *AI coach:* "Sage is wellness coaching, not diagnosis or treatment — no regulatory clearance claimed. Users give explicit consent before any chat data is sent to third-party AI (Groq for responses, Google for search embeddings). The model refuses dosage/medication questions and routes crisis inputs to hotline resources; a persistent consult-a-doctor disclaimer is shown in the chat UI."
4. *Health data:* "User-entered health data (cravings, relapses, check-ins) is used only for app functionality; never for advertising; not stored in iCloud; no HealthKit."

**Google Play (Android build):** complete the **Health apps declaration** (wellness/habit-cessation category), confirm in-app privacy-policy link, align the Data safety form with actual collection (health info, chat → AI providers, analytics), complete IARC rating. ([Play Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en))

**Pre-submission smoke test:** early TestFlight upload to flush ITMS-91053 / privacy-manifest errors before the real submission.