# Community Feature — Ship Checklist

Anonymous peer-support community for HALE. Built against
`.claude/memory/hale-community-architecture.md` (the contract) and
`.claude/memory/hale-conventions.md`.

---

## What was built

### Tables (`convex/schema.ts`)
- `communityGroups` — 6 seeded rows only (5 real groups + the `global` pseudo-group). No user-created groups.
- `anonProfiles` — **SERVER-ONLY** `userId → (groupId, handle, avatarSeed)` mapping. One pseudonym per (user, group); the global feed is its own pseudo-group with its own pseudonym and rate-limit bucket.
- `communityPosts` — text-only, 500 chars, `pending | published | shadowed`, denormalized `reactionCount`, moderation `flags`, `crisisAcked`.
- `communityComments` — same moderation pipeline + shadow semantics as posts.
- `communityReactions` — one "With you" per user per post (count on the post; never per-profile).
- `communityReports` — audit trail only in v1 (no automated action).
- `communityMutes` — per-muter hide of one anonProfile's posts + comments.

### Endpoints
- `convex/community.ts` — `groups`, `resolveGroup`, `joinGroup`, `myProfiles`, `seedGroups` (internalMutation), `ensureAnonProfile` (shared plain helper).
- `convex/communityPosts.ts` — `createPost`, `feed` (paginated), `createComment`, `comments`, `toggleReaction`, `myCrisisAlerts`, `ackCrisisCard`. Exports the shared shaped types `CommunityFeedItem` / `CommunityCommentItem` / `CrisisAlert`.
- `convex/communityModeration.ts` — `classify` (internalAction; the ONE external call — raw fetch to Claude, no SDK), `getModerationTarget` (internalQuery), `applyOutcome` (internalMutation), `reportContent`, `muteProfile`, `unmuteProfile`, `myMutes`.
- Pure helpers: `convex/model/anonHandles.ts` (handle/avatar generation), `convex/model/communityRules.ts` (`POST_MAX_CHARS`, `canPostAgain`, `coarseTimeLabel`, `validatePostBody`, `moderationOutcome`).

### Screens & components
- `src/app/(tabs)/community.tsx` — Community tab: global feed entry + the 5 group cards with Join affordance ("You're in as {handle}").
- `src/app/community/[groupId].tsx` — feed screen (`'global'` is a valid param), FlashList feed, pinned CrisisCard, bottom Composer in KeyboardAvoidingView, report/mute wiring.
- `src/components/community/` — `PostCard` (identity = handle + avatarSeed hue + coarse time label only; inline comments), `Composer` (post + comment modes, optimistic pending row), `CrisisCard` (988 / Crisis Text Line / SAMHSA deep links), `GroupEmptyState`.
- `src/constants/communityCopy.ts` — single source for all community strings.
- Tab registered in `src/app/(tabs)/_layout.tsx` between Squad and Coach (HeartHandshake icon).

---

## Pre-ship steps (in order)

1. **Set the moderation key** in the Convex deployment env:
   `npx convex env set ANTHROPIC_API_KEY <key>`
   ⚠️ The local dev deployment currently has the PLACEHOLDER `sk-ant-your-key-here` — replace it.
   Without a real key, posts stay `pending` (fail-safe by design — never auto-published); the
   `moderation-requeue` cron drains the backlog automatically once the key works.
2. **Push schema + functions**: `npx convex dev` (or `npx convex deploy` for prod).
3. **Seed the 6 groups** (idempotent, run once per deployment — ✅ already run on local dev):
   `npx convex run community:seedGroups '{}'`
4. **Smoke test** (`npx expo start`, dev build):
   - Community tab → 6 cards render with copy + member counts.
   - Tap Join on a group → toast reveals the pseudonym.
   - Open a group → post → dimmed "on its way" row → post appears as pending → flips to published once moderation returns (~seconds with the key set).
   - Open `Everyone` (global) → the group post appears with its origin-group tag; posting here uses a different (global) handle.
   - React ("With you"), comment, report ("Thanks for looking out…"), mute (post disappears from your feed only).
   - Post 4 times in an hour in one group → 4th returns the friendly rate-limit toast, draft preserved.
   - Post crisis-sounding text → CrisisCard pins above the feed for YOU only; dismiss persists across app restarts.

---

## Security review

**Verdict: PASS — zero findings from the adversarial review; integrator re-audit confirmed. No fixes required.**

Invariant spot-checked end to end during integration:
- Every public query/mutation return in `community.ts` / `communityPosts.ts` / `communityModeration.ts` is an explicitly shaped literal — no raw docs, no `userId` / `Id<'users'>` anywhere client-facing.
- Only self-reference is the server-computed `isMine`; `status` / `crisisFlagged` are present **only when `isMine`** (omitted entirely otherwise), and `shadowed` masquerades as `published` to its author.
- Timestamps leave the server only as coarse labels (`coarseTimeLabel`); raw `ts` / `_creationTime` never returned.
- `ackCrisisCard` and `muteProfile` return quiet `{ ok }` results without revealing existence/ownership of other users' content.
- No per-profile aggregates anywhere (no follower counts, no per-profile reaction tallies).

---

## Test & type status

- `npx tsc --noEmit` — **clean** (exit 0, repo-wide).
- `npx convex codegen` — succeeded (bindings regenerated, internal TS check passed).
- `npx jest __tests__/community.test.ts` — **42/42 passing** (handle generation, rate limiting, coarse time buckets, body validation, moderation state machine).

---

## Behavior summary for QA

### Rate limit
- **3 posts per rolling hour per anonProfile** (per-group buckets — global is its own bucket). Comments are NOT rate-limited in v1.
- Hitting it returns `{ ok: false, reason: 'rate_limited', retryAtMs }` (no throw); the Composer toasts "You've shared a lot this hour — nice. You can post again in about N min." and keeps the draft.

### Moderation
- Every post/comment inserts as `pending` and schedules `internal.communityModeration.classify` (attempt 0).
- `classify` calls Claude (`claude-opus-4-8`, structured output forcing `{pii, crisis, glamorizing, harassment}` booleans; no temperature/top_p/top_k/thinking params).
- Outcome: `pii || glamorizing || harassment` → `shadowed` (author still sees it as published — shadow-ban; everyone else never sees it). Otherwise → `published`.
- Any failure (missing key, non-2xx, network/parse error): content **stays pending**, retries at +10s then +60s (3 attempts total), then gives up still-pending. Never auto-publishes. Logs under `[moderation]`.
- **Self-healing backlog**: the `moderation-requeue` cron (every 15 min) re-enqueues posts/comments stuck `pending` for >5 min (via the `by_status_ts` index, 50/table per sweep), so content authored during a key outage publishes automatically once classification works again.
- Authors see their own pending posts dimmed with "On its way…" copy; no "review"/"flagged" language anywhere.

### Crisis flow
- `crisis: true` → content publishes normally (unless also shadow-flagged) AND `crisisAcked: false` is set, arming the author-only surface.
- The author's feed item carries `crisisFlagged`, and `myCrisisAlerts` keeps the CrisisCard pinned above the feed (988 call/text, Crisis Text Line, SAMHSA) until dismissed.
- "I'm okay — close this" calls `ackCrisisCard` for every outstanding alert; dismissal persists server-side. Other users never learn a post was crisis-flagged.

### Report & mute
- Report: idempotent audit row; always returns `{ ok: true }`; v1 takes no automated action (review `communityReports` manually in the Convex dashboard).
- Mute: hides that pseudonym's posts + comments for the muter only; self-mute is a silent no-op. `myMutes` / `unmuteProfile` exist for a future settings surface.

---

## Known gaps / TODOs

- **No settings UI for the mute list yet** — `myMutes` / `unmuteProfile` are built and tested but unwired (future "You" tab surface).
- **Reports are unactioned in v1** — audit trail only; needs an ops review loop (dashboard query or recurring export).
- **Comments load unpaginated** (`comments` collects all rows per post) — fine at v1 volume; paginate if threads grow.
- **`memberCount` is "member-ish"** — increments on profile creation, never decrements (no leave-group in v1).
- ~~Pending content with the API key unset accumulates silently~~ — FIXED: the `moderation-requeue` cron self-heals the pending backlog every 15 min; `[moderation]` logs still worth a glance on launch day 1.
- `SHADOWED_NOTICE` / `PENDING_NOTICE` copy exists for future surfacing; only the pending line is rendered today (intentional — shadow-ban semantics).
