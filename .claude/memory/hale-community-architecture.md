# HALE Community — Architecture Contract (single source of truth)

This document is THE contract for all workers building the community feature.
Read `.claude/memory/hale-conventions.md` and `.claude/memory/hale-deps.md` first.
If this doc and your instincts disagree, this doc wins. If this doc and
`hale-conventions.md` disagree, conventions win (none known).

---

## ⚠️ SECURITY INVARIANT (read this twice)

`anonProfiles` maps `userId → (groupId, handle, avatarSeed)`. **That mapping is SERVER-ONLY.**

1. **No public query/mutation return value may EVER include `userId`** (or any
   `Id<'users'>`) on community content — posts, comments, reactions, reports,
   or other users' profiles.
2. **Never return raw docs** from `communityPosts` / `communityComments` /
   `anonProfiles` / `communityReactions` / `communityMutes` — raw docs carry
   `userId` and foreign keys. Shape every return explicitly (pick fields).
3. The only self-reference allowed is a server-computed boolean: `isMine`.
4. **Coarse timestamps only**: the server returns a precomputed label
   (`coarseTimeLabel`) — never expose raw `ts` / `_creationTime` of community
   content to clients.
5. `authorProfileId: Id<'anonProfiles'>` IS allowed in shaped returns — it is
   the pseudonym's id (needed for mute/report) and carries no user linkage
   client-side. `Id<'communityPosts'>` / `Id<'communityComments'>` are allowed.
6. No follower counts anywhere. No per-profile reaction tallies. Post-level
   reaction count only.

Every public function in `convex/community*.ts` must end its handler by
constructing a literal object of the exact shape documented below.

---

## 0. Product rules (server-enforced, mirrored in UI)

- 5 seeded groups + 1 global pseudo-group. No user-created groups, no DMs, no
  images. Text only, **500 chars max** (server AND composer).
- Posts/comments start `status: 'pending'` → Claude moderation internalAction
  classifies `{pii, crisis, glamorizing, harassment}` (all booleans):
  - `pii || glamorizing || harassment` → `status: 'shadowed'` (author still
    sees their own post as if published; hidden from everyone else).
  - `crisis` → `status: 'published'` AND the author gets a crisis resource
    card (988 etc.). If crisis AND a shadow flag: status `'shadowed'`, crisis
    card still shown to the author.
  - No flags → `'published'`.
  - API failure / missing key → STAYS `'pending'`, retry with backoff (max 3
    attempts total), never auto-publish.
- Rate limit: **3 posts per rolling hour per anonProfile** (posts only;
  comments are NOT rate-limited in v1).
- Report + mute per anonProfile. Mute hides that profile's posts AND comments
  for the muter only.
- Reactions: a single "With you" tap per user per post. Count shown on the
  post. Nothing aggregated per profile.

### The global feed — exact semantics (decision)

- `communityGroups` is seeded with **6 rows**: the 5 real groups plus a
  pseudo-group `slug: 'global'` (`isGlobal: true`).
- The **global feed shows ALL posts across ALL groups** (including posts made
  directly to the global pseudo-group), newest first.
- Posting from the global feed screen creates a post whose `groupId` is the
  global pseudo-group's id, under the user's **global anonProfile** (its own
  pseudonym + its own rate-limit bucket).
- A group feed shows only that group's posts.
- Per-group pseudonyms hold everywhere: in the global feed, a post made in
  "Day One Club" displays the author's Day One Club handle.

---

## 1. SCHEMA — add to `convex/schema.ts`

Append these `defineTable`s to the existing `defineSchema({...})`. Match the
existing doc-comment voice. Owner of this section is the ONLY worker who edits
`convex/schema.ts` and the only one (besides the integrator) who runs
`npx convex codegen`.

```ts
  // ── Community (anonymous peer feed) ───────────────────────────
  // SECURITY INVARIANT: anonProfiles is the userId↔pseudonym mapping and is
  // SERVER-ONLY. No public return value ever includes userId on community
  // content; every query shapes fields explicitly (see hale-community-architecture.md).

  // communityGroups — 6 seeded rows ONLY (5 groups + the 'global' pseudo-group).
  // No user-created groups. Copy (descriptions/empty states) lives client-side
  // in src/constants/communityCopy.ts keyed by slug; the server stores identity.
  communityGroups: defineTable({
    slug: v.string(), // 'day-one-club' | 'cravings-right-now' | 'milestones' | 'vaping-zyn' | 'relapse-restart' | 'global'
    name: v.string(),
    isGlobal: v.boolean(), // true only for the 'global' pseudo-group
    sortOrder: v.number(), // browse-screen ordering (global first = 0)
    memberCount: v.number(), // denormalized; ++ when an anonProfile is created. "member-ish" — never per-user public.
  }).index('by_slug', ['slug']),

  // anonProfiles — ONE pseudonym per (userId, groupId). The global feed is its
  // own pseudo-group, so a user's global handle differs from their group handles.
  // Rate limiting is per anonProfile (per-group buckets).
  anonProfiles: defineTable({
    userId: v.id('users'), // SERVER-ONLY — never returned for other users
    groupId: v.id('communityGroups'),
    handle: v.string(), // "steady-otter-47" — unique within a group
    avatarSeed: v.string(), // 6-char hex; UI derives a deterministic hue
    createdAt: v.number(), // epoch ms
  })
    .index('by_user_group', ['userId', 'groupId']) // profile lookup + join idempotency
    .index('by_group_handle', ['groupId', 'handle']), // collision-safe handle generation

  // communityPosts — text-only, 500 chars, shadow-ban moderation states.
  // 'shadowed' posts render as published TO THEIR AUTHOR, hidden from others.
  communityPosts: defineTable({
    groupId: v.id('communityGroups'),
    userId: v.id('users'), // SERVER-ONLY
    anonProfileId: v.id('anonProfiles'),
    body: v.string(), // trimmed, 1..500 chars (validatePostBody)
    status: v.union(v.literal('pending'), v.literal('published'), v.literal('shadowed')),
    flags: v.optional(
      v.object({
        pii: v.boolean(),
        crisis: v.boolean(),
        glamorizing: v.boolean(),
        harassment: v.boolean(),
      }),
    ), // set by moderation; absent while pending
    crisisAcked: v.optional(v.boolean()), // author dismissed the crisis card
    reactionCount: v.number(), // denormalized; maintained by toggleReaction
    ts: v.number(), // epoch ms — server-side only; clients get coarse labels
  })
    .index('by_group_ts', ['groupId', 'ts']) // group feed (status filtered in handler — see §2 note)
    .index('by_user_ts', ['userId', 'ts']) // author's own posts / crisis alerts
    .index('by_profile_ts', ['anonProfileId', 'ts']), // rolling-hour rate limit

  // communityComments — same moderation pipeline + shadow semantics as posts.
  communityComments: defineTable({
    postId: v.id('communityPosts'),
    groupId: v.id('communityGroups'), // denormalized from the post (profile resolution)
    userId: v.id('users'), // SERVER-ONLY
    anonProfileId: v.id('anonProfiles'),
    body: v.string(),
    status: v.union(v.literal('pending'), v.literal('published'), v.literal('shadowed')),
    flags: v.optional(
      v.object({
        pii: v.boolean(),
        crisis: v.boolean(),
        glamorizing: v.boolean(),
        harassment: v.boolean(),
      }),
    ),
    crisisAcked: v.optional(v.boolean()),
    ts: v.number(),
  })
    .index('by_post_ts', ['postId', 'ts'])
    .index('by_user_ts', ['userId', 'ts']), // author's crisis alerts

  // communityReactions — one "With you" per user per post. Count lives on the
  // post; NEVER aggregated per profile (no clout).
  communityReactions: defineTable({
    postId: v.id('communityPosts'),
    userId: v.id('users'), // SERVER-ONLY
    ts: v.number(),
  }).index('by_post_user', ['postId', 'userId']), // myReaction point-lookup + toggle

  // communityReports — audit trail; no automated action in v1.
  communityReports: defineTable({
    reporterUserId: v.id('users'), // SERVER-ONLY
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(), // Id<'communityPosts'> | Id<'communityComments'> as string
    reason: v.optional(v.string()),
    ts: v.number(),
  })
    .index('by_reporter_target', ['reporterUserId', 'targetType', 'targetId']) // dedupe
    .index('by_target', ['targetType', 'targetId']),

  // communityMutes — muter hides one anonProfile's content (posts + comments)
  // for themselves only. Prefix query on muterUserId loads the muter's set.
  communityMutes: defineTable({
    muterUserId: v.id('users'), // SERVER-ONLY
    mutedProfileId: v.id('anonProfiles'),
    ts: v.number(),
  }).index('by_muter_profile', ['muterUserId', 'mutedProfileId']),
```

**Index design note (deliberate deviation):** the brief asked for a
"feed per group by status+time" index. We use `by_group_ts` and filter status
**in the handler** instead, because shadow-ban semantics make status
non-prefix-filterable: a page must contain `published` posts PLUS the viewer's
own `pending`/`shadowed` posts, interleaved at their true time position. A
`['groupId','status','ts']` index cannot serve that in one paginated cursor.
Pending/shadowed are a tiny fraction of rows, so post-filtering a page is
cheap (Convex `usePaginatedQuery` tolerates short pages).

---

## 2. API SURFACE

General rules for every backend file:

- Auth: `const userId = await getAuthUserId(ctx);` — public **mutations**
  `throw new Error('Not authenticated')`; public **queries** return the
  documented empty value.
- Timestamps: `const now = Date.now()` in the handler; store epoch ms `ts`.
- No `fetch` in queries/mutations. The ONLY network call lives in
  `internal.communityModeration.classify` (internalAction).
- Cross-file scheduling: `import { internal } from './_generated/api';`
  then `await ctx.scheduler.runAfter(0, internal.communityModeration.classify, args)`.
- Plain-helper sharing: `communityPosts.ts` imports the exported plain async
  function `ensureAnonProfile` from `./community` (plain TS import — allowed).

### 2.1 `convex/model/anonHandles.ts` — PURE functions only (no ctx, no imports from convex/_generated)

```ts
export const HANDLE_ADJECTIVES: string[]; // ≥48 lowercase single words, e.g. 'steady','quiet','brave','calm','bright','patient','bold','gentle','mellow','keen','sturdy','honest','plucky','sunny','solid','swift','easy','clear','warm','spry','hardy','vivid','wry','noble','tidy','lucky','crisp','daring','earnest','fresh','humble','jolly','kind','lively','merry','nimble','peppy','quick','rosy','sage','tough','upbeat','valiant','wise','zesty','ready','stout','true'
export const HANDLE_ANIMALS: string[];    // ≥48 lowercase single words, e.g. 'otter','heron','badger','lynx','wren','elk','fox','hare','ibis','jay','koala','lemur','marten','newt','osprey','puffin','quail','raven','seal','tern','urchin','vole','walrus','yak','zebra','bison','crane','dingo','egret','finch','gecko','hawk','iguana','kestrel','loon','moose','narwhal','ocelot','pika','robin','stork','tapir','umber','viper','wombat','falcon','beaver','dove'

/** Deterministic pick from a seeded rand in [0,1). "adjective-animal-N", N in 1..99. */
export function generateHandle(rand: () => number): string;
// = `${ADJ[floor(rand()*ADJ.length)]}-${ANIMAL[floor(rand()*ANIMAL.length)]}-${1 + floor(rand()*99)}`

/** 6-char lowercase hex seed for the deterministic avatar hue. */
export function generateAvatarSeed(rand: () => number): string;
// = floor(rand() * 0xffffff).toString(16).padStart(6, '0')
```

Capacity ≈ 48×48×99 ≈ 228k handles per group — collisions are rare; the
caller retries (see `ensureAnonProfile`). Unit-testable with a fixed `rand`.

### 2.2 `convex/model/communityRules.ts` — PURE functions only

```ts
export const POST_MAX_CHARS = 500;
export const RATE_LIMIT_MAX_POSTS = 3;
export const RATE_LIMIT_WINDOW_MS = 3_600_000; // rolling hour

/**
 * recentPostTimes: epoch ms of the profile's posts within the window (any order).
 * allowed=false when ≥ RATE_LIMIT_MAX_POSTS fall inside (now - WINDOW, now].
 * retryAtMs = min(timesInWindow) + RATE_LIMIT_WINDOW_MS (when the oldest ages out).
 */
export function canPostAgain(
  recentPostTimes: number[],
  now: number,
): { allowed: boolean; retryAtMs?: number };

/**
 * Coarse buckets (floor division, clamp negative deltas to 0):
 *   < 60s            → 'just now'
 *   < 60m            → '{m}m ago'
 *   < 24h            → '{h}h ago'
 *   < 7d             → '{d}d ago'
 *   else             → '{w}w ago'
 */
export function coarseTimeLabel(ts: number, now: number): string;

/** Validates the TRIMMED body. reason: 'empty' | 'too_long'. */
export function validatePostBody(body: string): { ok: boolean; reason?: string };

/**
 * Moderation state machine.
 *   pii || glamorizing || harassment → status 'shadowed'
 *   else crisis                      → status 'published'
 *   else                             → status 'published'
 *   crisis (returned boolean) = flags.crisis, ALWAYS — a shadowed crisis post
 *   still shows the author the crisis card.
 */
export function moderationOutcome(flags: {
  pii: boolean;
  crisis: boolean;
  glamorizing: boolean;
  harassment: boolean;
}): { status: 'published' | 'shadowed'; crisis: boolean };
```

Tests: `__tests__/anonHandles.test.ts` and `__tests__/communityRules.test.ts`
(jest-expo style, match `__tests__/plan.test.ts`).

### 2.3 `convex/community.ts` — groups + profiles

```ts
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { generateHandle, generateAvatarSeed } from './model/anonHandles';
import type { Id } from './_generated/dataModel';
```

| export | kind | args | returns |
|---|---|---|---|
| `groups` | query | `{}` | `GroupCard[]` (`[]` when unauthenticated) |
| `resolveGroup` | query | `{ groupKey: v.string() }` (slug `'global'` OR an `Id<'communityGroups'>` string) | `GroupCard & { myHandle: string \| null } \| null` |
| `joinGroup` | mutation | `{ groupId: v.id('communityGroups') }` | `{ handle: string; avatarSeed: string }` |
| `myProfiles` | query | `{}` | `{ groupId: Id<'communityGroups'>; groupSlug: string; handle: string; avatarSeed: string }[]` |
| `seedGroups` | internalMutation | `{}` | `{ created: number }` |
| `ensureAnonProfile` | **exported plain async function** (NOT a Convex function) | `(ctx: MutationCtx, userId: Id<'users'>, groupId: Id<'communityGroups'>)` | `Promise<Doc<'anonProfiles'>>` |

```ts
type GroupCard = {
  groupId: Id<'communityGroups'>;
  slug: string;
  name: string;
  isGlobal: boolean;
  memberCount: number; // member-ish count is OK; NO follower counts
  joined: boolean;     // does the caller have an anonProfile here
};
```

Behavior contracts:

- `groups`: all 6 rows ordered by `sortOrder`; `joined` via
  `by_user_group` point lookups. Never returns other users' anything.
- `resolveGroup`: if `groupKey === 'global'` look up `by_slug('global')`,
  otherwise `ctx.db.get(groupKey as Id<'communityGroups'>)` (wrap in
  try/normalize — return `null` on bad id). `myHandle` from the caller's
  profile or `null`.
- `ensureAnonProfile(ctx, userId, groupId)`:
  1. `by_user_group` lookup; return existing if found (idempotent).
  2. Loop max 10×: `handle = generateHandle(Math.random)`; check
     `by_group_handle (groupId, handle)`; if free, insert
     `{ userId, groupId, handle, avatarSeed: generateAvatarSeed(Math.random), createdAt: now }`,
     `ctx.db.patch(groupId, { memberCount: group.memberCount + 1 })`, return doc.
  3. After 10 collisions `throw new Error('Could not generate a handle')`
     (statistically unreachable). (`Math.random` is Convex's seeded RNG —
     fine in mutations.)
- `joinGroup`: auth → `ensureAnonProfile` → return `{ handle, avatarSeed }`
  only (caller's own pseudonym — allowed self-reference).
- `seedGroups`: idempotent — for each seed below, insert only if `by_slug`
  misses. Never deletes/renames. Integrator runs it once via
  `npx convex run community:seedGroups '{}'`.

```ts
const GROUP_SEEDS = [
  { slug: 'global',            name: 'Everyone',            isGlobal: true,  sortOrder: 0 },
  { slug: 'day-one-club',      name: 'Day One Club',        isGlobal: false, sortOrder: 1 },
  { slug: 'cravings-right-now',name: 'Cravings Right Now',  isGlobal: false, sortOrder: 2 },
  { slug: 'milestones',        name: 'Milestones',          isGlobal: false, sortOrder: 3 },
  { slug: 'vaping-zyn',        name: 'Vaping & Zyn',        isGlobal: false, sortOrder: 4 },
  { slug: 'relapse-restart',   name: 'Relapse & Restart',   isGlobal: false, sortOrder: 5 },
] as const; // memberCount: 0 on insert
```

### 2.4 `convex/communityPosts.ts` — posts, comments, reactions, feed

```ts
import { paginationOptsValidator } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { ensureAnonProfile } from './community';
import {
  POST_MAX_CHARS, canPostAgain, coarseTimeLabel, validatePostBody,
} from './model/communityRules';
```

**THE shared shaped types — defined and exported HERE, imported everywhere
else (UI imports them `import type { ... } from '@convex/communityPosts'`):**

```ts
import type { Id } from './_generated/dataModel';

export type CommunityFeedItem = {
  postId: Id<'communityPosts'>;
  groupId: Id<'communityGroups'>;
  groupSlug: string;                   // origin group (global feed shows a tag)
  authorProfileId: Id<'anonProfiles'>; // pseudonym id — for mute/report only
  handle: string;
  avatarSeed: string;
  body: string;
  timeLabel: string;                   // server-computed coarse label — NEVER raw ts
  reactionCount: number;
  myReaction: boolean;
  commentCount: number;               // visible (published or mine) comments
  isMine: boolean;
  status?: 'pending' | 'published';    // ONLY present when isMine. shadowed → reported as 'published' (shadow-ban).
  crisisFlagged?: boolean;             // ONLY present when isMine: flags.crisis && !crisisAcked
};

export type CommunityCommentItem = {
  commentId: Id<'communityComments'>;
  postId: Id<'communityPosts'>;
  authorProfileId: Id<'anonProfiles'>;
  handle: string;
  avatarSeed: string;
  body: string;
  timeLabel: string;
  isMine: boolean;
  status?: 'pending' | 'published';    // same only-if-mine rule
  crisisFlagged?: boolean;
};

export type CrisisAlert = {
  targetType: 'post' | 'comment';
  targetId: string;
};
```

| export | kind | args | returns |
|---|---|---|---|
| `createPost` | mutation | `{ groupId: v.id('communityGroups'), body: v.string() }` | `{ ok: true; postId: Id<'communityPosts'> } \| { ok: false; reason: 'rate_limited'; retryAtMs: number } \| { ok: false; reason: 'empty' \| 'too_long' }` |
| `feed` | query | `{ groupKey: v.string(), paginationOpts: paginationOptsValidator }` | `PaginationResult<CommunityFeedItem>` |
| `createComment` | mutation | `{ postId: v.id('communityPosts'), body: v.string() }` | `{ ok: true; commentId: Id<'communityComments'> } \| { ok: false; reason: 'empty' \| 'too_long' }` |
| `comments` | query | `{ postId: v.id('communityPosts') }` | `CommunityCommentItem[]` (`[]` unauthenticated) |
| `toggleReaction` | mutation | `{ postId: v.id('communityPosts') }` | `{ reacted: boolean; reactionCount: number }` |
| `myCrisisAlerts` | query | `{}` | `CrisisAlert[]` (`[]` when none/unauthenticated) |
| `ackCrisisCard` | mutation | `{ targetType: v.union(v.literal('post'), v.literal('comment')), targetId: v.string() }` | `{ ok: boolean }` |

Behavior contracts:

- **`createPost`**: auth → `validatePostBody(body.trim())` (return
  `{ok:false, reason}` on failure — no throw, composer shows copy) →
  `profile = ensureAnonProfile(ctx, userId, groupId)` (auto-join) →
  rate limit: `by_profile_ts` posts with `ts > now - RATE_LIMIT_WINDOW_MS`,
  `.collect()`, map to ts[], `canPostAgain(times, now)`; if `!allowed` return
  `{ ok: false, reason: 'rate_limited', retryAtMs }` →
  insert `{ groupId, userId, anonProfileId: profile._id, body: trimmed, status: 'pending', reactionCount: 0, ts: now }` →
  `ctx.scheduler.runAfter(0, internal.communityModeration.classify, { targetType: 'post', targetId: postId, attempt: 0 })` →
  `{ ok: true, postId }`.
- **`feed`**: if unauthenticated return `{ page: [], isDone: true, continueCursor: '' }`.
  - `groupKey === 'global'` → `ctx.db.query('communityPosts').order('desc').paginate(paginationOpts)`
    (default creation-time order; `ts` ≈ `_creationTime`, set in the same mutation).
  - else resolve `groupId = groupKey as Id<'communityGroups'>` →
    `.withIndex('by_group_ts', q => q.eq('groupId', groupId)).order('desc').paginate(paginationOpts)`.
  - Load once per execution: caller's mute set
    (`communityMutes.by_muter_profile` prefix on `muterUserId`, `.collect()` →
    `Set(mutedProfileId)`), and all 6 group docs → `Map<groupId, slug>`.
  - Filter `page.page`: keep if `(post.status === 'published' || post.userId === me)`
    AND `(post.userId === me || !muted.has(post.anonProfileId))`.
  - Shape each survivor (parallelizable with `Promise.all`):
    - `profile = await ctx.db.get(post.anonProfileId)` → handle, avatarSeed.
    - `myReaction`: `by_post_user (postId, me)` point lookup ≠ null.
    - `commentCount`: `by_post_ts` collect, count `(c.status === 'published' || c.userId === me)` and not muted.
    - `timeLabel = coarseTimeLabel(post.ts, now)`.
    - `isMine = post.userId === me`. If mine: `status = post.status === 'pending' ? 'pending' : 'published'`
      (shadowed masquerades as published — shadow-ban), and
      `crisisFlagged = post.flags?.crisis === true && post.crisisAcked !== true`.
      If not mine: omit `status` and `crisisFlagged` entirely.
  - Return `{ ...result, page: shapedItems }`. **Never include `userId`,
    raw `ts`, or `flags`.**
- **`createComment`**: auth → validate trimmed body → load post (throw if
  missing) → `ensureAnonProfile(ctx, userId, post.groupId)` → insert
  `{ postId, groupId: post.groupId, userId, anonProfileId, body, status: 'pending', ts: now }`
  → schedule `classify { targetType: 'comment', targetId: commentId, attempt: 0 }`
  → `{ ok: true, commentId }`. No rate limit on comments (v1).
- **`comments`**: `by_post_ts` ascending `.collect()` (text-only, low volume —
  no pagination v1), apply the same visibility filter
  (published-or-mine, not-muted-unless-mine), shape as `CommunityCommentItem`
  with the same only-if-mine `status`/`crisisFlagged` rules.
- **`toggleReaction`**: auth → `by_post_user` lookup → if exists `delete` +
  `patch(post, { reactionCount: max(0, n - 1) })` → `{ reacted: false, ... }`;
  else `insert { postId, userId, ts: now }` + `patch(+1)` →
  `{ reacted: true, ... }`. Never expose who reacted.
- **`myCrisisAlerts`**: own posts via `communityPosts.by_user_ts` `.order('desc').take(20)`
  + own comments via `communityComments.by_user_ts` `.take(20)`; return
  `{ targetType, targetId }` for each with `flags?.crisis && !crisisAcked`.
  (This is the author-only crisis surface — feed items also carry
  `crisisFlagged` when visible, but alerts survive scrolling/screens.)
- **`ackCrisisCard`**: auth → load target → **only if `doc.userId === me`**
  `patch({ crisisAcked: true })` → `{ ok: true }`; else `{ ok: false }`
  (no throw — don't leak existence).

Note on `coarseTimeLabel` in queries: `Date.now()` in a Convex query is the
execution time; reactive caching may keep a label slightly stale until the
next update. Accepted — labels are coarse by design.

### 2.5 `convex/communityModeration.ts` — Claude pipeline + report/mute

```ts
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query, internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { moderationOutcome } from './model/communityRules';
```

| export | kind | args | returns |
|---|---|---|---|
| `classify` | internalAction | `{ targetType: v.union(v.literal('post'), v.literal('comment')), targetId: v.string(), attempt: v.number() }` | `void` |
| `getModerationTarget` | internalQuery | `{ targetType: ..., targetId: v.string() }` | `{ body: string; status: string } \| null` |
| `applyOutcome` | internalMutation | `{ targetType: ..., targetId: v.string(), flags: v.object({ pii: v.boolean(), crisis: v.boolean(), glamorizing: v.boolean(), harassment: v.boolean() }) }` | `void` |
| `reportContent` | mutation | `{ targetType: v.union(v.literal('post'), v.literal('comment')), targetId: v.string(), reason: v.optional(v.string()) }` | `{ ok: true }` |
| `muteProfile` | mutation | `{ profileId: v.id('anonProfiles') }` | `{ ok: true }` |
| `unmuteProfile` | mutation | `{ profileId: v.id('anonProfiles') }` | `{ ok: true }` |
| `myMutes` | query | `{}` | `{ profileId: Id<'anonProfiles'>; handle: string }[]` |

**`classify` — the ONE external call.** Mirrors `convex/sage.ts` generate()
(raw fetch, no SDK, no `"use node"`):

```ts
const MODERATION_MODEL = 'claude-opus-4-8'; // exact — no date suffix
const MODERATION_MAX_ATTEMPTS = 3;          // attempt = 0,1,2
const MODERATION_RETRY_DELAYS_MS = [10_000, 60_000]; // after attempt 0, after attempt 1

const MODERATION_SCHEMA = {
  type: 'object',
  properties: {
    pii: { type: 'boolean' },
    crisis: { type: 'boolean' },
    glamorizing: { type: 'boolean' },
    harassment: { type: 'boolean' },
  },
  required: ['pii', 'crisis', 'glamorizing', 'harassment'],
  additionalProperties: false,
} as const;

const MODERATION_SYSTEM = `You moderate an anonymous peer-support community for people quitting nicotine. Classify the post below. Return booleans only.
- pii: contains personally identifying info (full names, phone numbers, emails, addresses, social handles).
- crisis: expresses suicidal ideation, self-harm intent, or acute crisis.
- glamorizing: glamorizes or encourages nicotine/drug use, or pressures others to relapse.
- harassment: attacks, demeans, or targets another person.
Supportive venting, slips, relapses, and dark humor about cravings are NORMAL here and are NOT flags by themselves.`;
```

Handler contract:
1. `const target = await ctx.runQuery(internal.communityModeration.getModerationTarget, { targetType, targetId });`
   — if `null` or `target.status !== 'pending'`, return (already handled).
2. `const apiKey = process.env.ANTHROPIC_API_KEY;` — if missing, treat as
   failure (step 4). Log `[moderation] ANTHROPIC_API_KEY unset`.
3. `fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODERATION_MODEL, max_tokens: 256, system: MODERATION_SYSTEM, messages: [{ role: 'user', content: target.body }], output_config: { format: { type: 'json_schema', schema: MODERATION_SCHEMA } } }) })`
   — **Do NOT send `temperature` / `top_p` / `top_k` / `thinking`** (400 on this model).
   On `res.ok`: `const flags = JSON.parse(data.content[0].text);` →
   `await ctx.runMutation(internal.communityModeration.applyOutcome, { targetType, targetId, flags });` → done.
4. On any failure (no key, non-ok status, fetch throw, parse throw):
   log `[moderation] classify failed (attempt ${attempt + 1}/${MODERATION_MAX_ATTEMPTS}): ...`;
   if `attempt < MODERATION_MAX_ATTEMPTS - 1` →
   `ctx.scheduler.runAfter(MODERATION_RETRY_DELAYS_MS[attempt], internal.communityModeration.classify, { targetType, targetId, attempt: attempt + 1 })`;
   else log `[moderation] giving up — stays pending`. **Never publish on failure.**

- **`getModerationTarget`**: `ctx.db.get(targetId as Id<...>)` per targetType;
  return `{ body, status }` or `null`. (internal — userId never leaves the server anyway.)
- **`applyOutcome`**: load doc; if missing or `status !== 'pending'` return
  (idempotent). `const { status, crisis } = moderationOutcome(flags);`
  `patch({ status, flags, ...(crisis ? { crisisAcked: false } : {}) })`.
- **`reportContent`**: auth → dedupe via `by_reporter_target` → insert
  `{ reporterUserId: me, targetType, targetId, reason, ts: now }` → `{ ok: true }`
  (also `{ ok: true }` on dupe — idempotent UX).
- **`muteProfile`**: auth → no-op if the profile is the caller's own
  (`profile.userId === me` — return `{ ok: true }`, reveal nothing) →
  dedupe via `by_muter_profile (me, profileId)` → insert → `{ ok: true }`.
- **`unmuteProfile`**: delete the matching mute row if present → `{ ok: true }`.
- **`myMutes`**: caller's mute rows + each profile's `handle` only (a
  pseudonym is public; userId never returned).

---

## 3. SCREEN MAP & COMPONENT CONTRACT

UI rules (from conventions — NOT optional): NativeWind classNames + shared UI
components (`Screen`, `Display/Heading/Body/Label`, `Button`, `Pill`,
`Surface`); dark Bold Momentum palette; `RiseIn` entrances with `index`
stagger; `toast` from sonner-native; haptics on submit; lucide icons with
`colors` from `@/theme/colors`. No Lottie/Rive. FlashList 2 for the feed.

**Import discipline:** from `convex/*.ts` files the UI may import **types
only** (`import type { CommunityFeedItem } from '@convex/communityPosts'`).
Runtime values may be imported from `convex/model/*` (pure — precedent:
`today.tsx` imports from `@convex/model/streak`) and from
`@convex/_generated/api`.

### 3.1 `src/app/(tabs)/community.tsx` — Community tab (group browse)

- `const groups = useQuery(api.community.groups, {})` — loading: centered
  `ActivityIndicator color={colors.volt}` inside `Screen`.
- Header matches `today.tsx` idiom (`Label` accent + `Heading` "Community").
- Top card (RiseIn index 0): the **global feed entry** (`slug === 'global'`)
  — name + `communityCopy` description + member-ish count → `router.push('/community/global')`.
- Then one card per real group (RiseIn `index={i + 1}`): name, description
  from `COMMUNITY_GROUPS[slug]`, `memberCount` line, and either a "Joined as
  {handle}…" state (via `api.community.myProfiles`) or a volt Join affordance.
  - Tap card → `router.push(\`/community/${groupId}\`)` (join is implicit —
    `createPost` auto-joins; `joinGroup` is called when the user taps an
    explicit Join affordance so the handle is revealed up front:
    `const res = await joinGroup({ groupId }); toast(\`You're in as ${res.handle}\`)`).
- Uses `GroupEmptyState` ONLY on the feed screen (not here).
- Fires no analytics requirements in v1.

### 3.2 `src/app/community/[groupId].tsx` — feed screen

- `const { groupId } = useLocalSearchParams<{ groupId: string }>();` —
  **`'global'` is a valid param value.**
- `const meta = useQuery(api.community.resolveGroup, { groupKey: groupId });`
  — `null` → friendly not-found + back. Provides real `Id` for the Composer
  (global → global pseudo-group id), name for the header, `myHandle`.
- Feed: `const { results, status, loadMore } = usePaginatedQuery(api.communityPosts.feed, { groupKey: groupId }, { initialNumItems: 20 });`
- Crisis: `const alerts = useQuery(api.communityPosts.myCrisisAlerts, {});`
  — when `alerts.length > 0`, render `<CrisisCard onDismiss={...} />` pinned
  ABOVE the list; dismiss calls `ackCrisisCard` for every alert.
- Layout: `Screen edges={['top']}` → header (back chevron, group name,
  member-ish count `Label`) → optional CrisisCard → `FlashList`
  (`data={results}`, `renderItem={<PostCard item index showGroupTag={groupId==='global'} …/>}`,
  `onEndReached={() => loadMore(20)}`, `ListEmptyComponent={<GroupEmptyState groupSlug={meta.slug} />}`)
  → `Composer` pinned at the bottom inside `KeyboardAvoidingView`.
- Wire-ups: `onToggleReaction → useMutation(api.communityPosts.toggleReaction)`
  (light haptic); `onReport → reportContent` then `toast(REPORT_CONFIRMATION)`;
  `onMuteAuthor → muteProfile` then `toast(MUTE_CONFIRMATION(handle))`.
  Report/mute presented via an action sheet / `Alert` from a "…" affordance on
  PostCard (PostCard only invokes the callbacks; the screen owns mutations).

### 3.3 `src/components/community/PostCard.tsx`

```ts
import type { Id } from '@convex/_generated/dataModel';
import type { CommunityFeedItem } from '@convex/communityPosts';

export type PostCardProps = {
  item: CommunityFeedItem;
  index?: number;            // RiseIn stagger position
  showGroupTag?: boolean;    // global feed: show origin-group Pill (groupSlug)
  onToggleReaction: (postId: Id<'communityPosts'>) => void;
  onReport: (args: { targetType: 'post' | 'comment'; targetId: string }) => void;
  onMuteAuthor: (args: { profileId: Id<'anonProfiles'>; handle: string }) => void;
};
```

- Card: `rounded-2xl border border-line bg-coal px-4 py-4`, wrapped in
  `RiseIn index={index}`.
- Avatar: 36px circle, background hue derived deterministically:
  `hsl(${parseInt(item.avatarSeed, 16) % 360}, 60%, 45%)`, first letter of the
  handle. Handle in `Label`, `item.timeLabel` in dim `Body text-xs text-ash`.
  **Never render anything but handle/avatarSeed/timeLabel for identity.**
- `item.isMine && item.status === 'pending'` → render the body at reduced
  opacity with `COMPOSER_PENDING_LINE` underneath (no shame, no "review").
- Footer row: "With you" reaction (Heart lucide icon; volt fill when
  `myReaction`; shows `reactionCount` when > 0), comment toggle
  (`MessageCircle` + `commentCount`), and a `MoreHorizontal` overflow that
  opens report/mute (mute hidden when `item.isMine`).
- Expanded comments (local `useState`): `useQuery(api.communityPosts.comments, { postId })`
  rendered inline beneath the card + a compact `Composer` in comment mode
  (`postId` prop). Comment rows reuse the same identity rendering; comments
  may also invoke `onReport` with `targetType: 'comment'`.

### 3.4 `src/components/community/Composer.tsx`

```ts
export type ComposerProps = {
  groupId: Id<'communityGroups'>;     // REAL id (screen resolves 'global' first)
  postId?: Id<'communityPosts'>;      // present → comment mode (createComment)
  myHandle?: string | null;           // shown as "posting as {handle}" when known
  placeholder?: string;               // defaults to communityCopy.COMPOSER_PLACEHOLDER
};
```

- Multiline `TextInput` (chalk text on `bg-coal`, `border-line` rounded-2xl) +
  send `Button`/volt icon button. Char counter `({len}/{POST_MAX_CHARS})`
  turns `text-sos` when over; `POST_MAX_CHARS` imported from
  `@convex/model/communityRules` (value import from model is allowed).
  Send disabled when empty/over-limit/in-flight.
- Submit: medium haptic → `createPost({ groupId, body })` (or
  `createComment({ postId, body })`).
  - In-flight: keep the drafted text visible in a dimmed "sending" row
    (optimistic pending state) — once the mutation commits, the reactive feed
    shows the item with `status: 'pending'` and PostCard renders the pending
    copy, so the Composer clears its local state.
  - `{ ok: false, reason: 'rate_limited' }` → `toast(RATE_LIMIT_MESSAGE(retryAtMs))`,
    keep the draft.
  - `{ ok: false, reason: 'too_long' | 'empty' }` → inline copy, keep draft.
  - Thrown error → `toast.error(POST_FAILED)` , keep draft.

### 3.5 `src/components/community/CrisisCard.tsx`

```ts
export type CrisisCardProps = {
  onDismiss: () => void;
};
```

- All copy from `communityCopy.CRISIS_CARD`. Calm, supportive, NOT alarm-red:
  `rounded-2xl border border-volt/30 bg-volt/10 px-5 py-4` with a
  `HeartHandshake` (or `LifeBuoy`) volt icon.
- Title (`Heading text-base`), body (`Body text-sm text-ash`), then one row
  per resource: name + `Linking.openURL` action (`tel:988`, `sms:741741`).
- Dismiss: ghost `Pressable` with `CRISIS_CARD.dismissLabel` → `onDismiss()`.
  Dismissal persists server-side via `ackCrisisCard` (wired by the screen).

### 3.6 `src/components/community/GroupEmptyState.tsx`

```ts
export type GroupEmptyStateProps = {
  groupSlug: string; // 'global' included
};
```

- Centered, padded: lucide icon (`MessagesSquare`, ash), `Heading` =
  `COMMUNITY_GROUPS[groupSlug].emptyTitle`, `Body text-ash` =
  `COMMUNITY_GROUPS[groupSlug].emptyBody`. Unknown slug → fall back to the
  global entry. Wrapped in `RiseIn`.

### 3.7 Navigation — INTEGRATOR ONLY

UI workers do **not** touch `src/app/(tabs)/_layout.tsx`. The integrator adds,
after the `squad` screen:

```tsx
import { HeartHandshake } from 'lucide-react-native'; // add to the existing lucide import

<Tabs.Screen
  name="community"
  options={{
    title: 'Community',
    tabBarIcon: ({ color, size }) => (
      <HeartHandshake color={color} size={size} strokeWidth={2.5} />
    ),
  }}
/>
```

`src/app/community/[groupId].tsx` is auto-routed by expo-router (outside the
tabs group) — no registration needed.

---

## 4. COPY CONTRACT — `src/constants/communityCopy.ts`

Single source for ALL user-facing community strings. Voice: a friend who quit
before you. Never "violation", "infraction", "flagged", "user", "moderation".
Exact export names (values below are the required content — copy worker may
polish wording but must keep meaning, names, and shapes):

```ts
export const COMMUNITY_TAB_TITLE = 'Community';

export const COMMUNITY_GROUPS: Record<
  string, // slug — keys MUST be exactly the 6 seed slugs
  { name: string; description: string; emptyTitle: string; emptyBody: string }
> = {
  'global': {
    name: 'Everyone',
    description: 'The whole community in one feed. Every group, every story.',
    emptyTitle: 'Quiet in here',
    emptyBody: 'Be the first voice today. Someone out there needs to hear it.',
  },
  'day-one-club': {
    name: 'Day One Club',
    description: 'Just quit or starting again — every streak starts here.',
    emptyTitle: 'Every streak starts at day one',
    emptyBody: 'Say hi. The people here get exactly where you are.',
  },
  'cravings-right-now': {
    name: 'Cravings Right Now',
    description: 'Riding a craving this minute? Post it. It passes faster together.',
    emptyTitle: 'No cravings on the board',
    emptyBody: 'When one hits, drop it here — someone will sit with you through it.',
  },
  'milestones': {
    name: 'Milestones',
    description: '24 hours, 1 week, 100 days — wins of every size live here.',
    emptyTitle: 'No wins posted yet',
    emptyBody: 'Big or small, your milestone gives someone else a map.',
  },
  'vaping-zyn': {
    name: 'Vaping & Zyn',
    description: 'Pods and pouches have their own battles. Fight them together.',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'Quitting vapes and pouches is its own fight. Start the conversation.',
  },
  'relapse-restart': {
    name: 'Relapse & Restart',
    description: 'A slip is a data point, not a verdict. Restart without shame.',
    emptyTitle: 'No restarts shared yet',
    emptyBody: 'If you slipped, you belong here. Day counts reset — what you learned doesn\'t.',
  },
};

export const COMPOSER_PLACEHOLDER = "What's on your mind? You're anonymous here.";
export const COMPOSER_COMMENT_PLACEHOLDER = 'Say something supportive…';
export const COMPOSER_PENDING_LINE = 'On its way — your post will appear for everyone shortly.';
export const POST_FAILED = "Couldn't send that. Please try again";

/** retryAtMs: epoch ms when posting reopens. Render relative minutes, never a wall-clock. */
export const RATE_LIMIT_MESSAGE = (retryAtMs: number): string => {
  const mins = Math.max(1, Math.ceil((retryAtMs - Date.now()) / 60_000));
  return `You've shared a lot this hour — nice. You can post again in about ${mins} min.`;
};

// Shadow-ban semantics mean authors see their post as normal; these exist for
// any future surfacing and for the pending state. Zero shame.
export const PENDING_NOTICE = 'Posts take a moment to appear for everyone.';
export const SHADOWED_NOTICE = 'Some posts stay just between us when they include things like personal details. Yours is safe here.';

export const CRISIS_CARD = {
  title: "You matter — and you don't have to do this alone",
  body: 'What you wrote sounds heavy. Quitting is hard, and so is everything around it. If you\'re in a dark place right now, real people are ready to listen — free, anytime.',
  resources: [
    { name: '988 Suicide & Crisis Lifeline', detail: 'Call or text 988', url: 'tel:988' },
    { name: 'Crisis Text Line', detail: 'Text HOME to 741741', url: 'sms:741741' },
    { name: 'SAMHSA Helpline', detail: '1-800-662-4357 (24/7)', url: 'tel:18006624357' },
  ],
  dismissLabel: "I'm okay — close this",
} as const;

export const REPORT_CONFIRMATION = 'Thanks for looking out. We\'ll take it from here.';
export const MUTE_CONFIRMATION = (handle: string) => `You won't see posts from ${handle} anymore.`;
export const UNMUTE_CONFIRMATION = (handle: string) => `${handle} is back in your feed.`;
export const REPORT_ACTION_LABEL = 'Report this post';
export const MUTE_ACTION_LABEL = (handle: string) => `Mute ${handle}`;
export const REACTION_LABEL = 'With you';
```

---

## 5. TYPES — single definition, one import path

- `CommunityFeedItem`, `CommunityCommentItem`, `CrisisAlert` are defined ONCE
  in `convex/communityPosts.ts` (§2.4) and imported everywhere else via
  **type-only imports**: `import type { CommunityFeedItem } from '@convex/communityPosts';`
- Backend files share `ensureAnonProfile` via plain import from `./community`.
- UI runtime values from the backend come ONLY from `@convex/model/*`
  (`POST_MAX_CHARS`) and `@convex/_generated/api`.

---

## 6. Cross-file reference map

```
communityPosts.createPost ──schedules──▶ internal.communityModeration.classify
communityPosts.createComment ──schedules──▶ internal.communityModeration.classify
communityModeration.classify ──runQuery──▶ internal.communityModeration.getModerationTarget
communityModeration.classify ──fetch────▶ api.anthropic.com /v1/messages (the ONLY network call)
communityModeration.classify ──runMutation▶ internal.communityModeration.applyOutcome
communityModeration.applyOutcome ──uses──▶ moderationOutcome (model/communityRules)
communityPosts.{createPost,createComment} ──plain import──▶ ensureAnonProfile (community.ts)
ensureAnonProfile ──uses──▶ generateHandle/generateAvatarSeed (model/anonHandles)
UI ──type-only──▶ CommunityFeedItem (convex/communityPosts.ts)
UI ──value──▶ POST_MAX_CHARS, coarse helpers if needed (convex/model/communityRules)
```

Crisis card surfacing (decided): a `crisisFlagged` boolean on the shaped feed
item, present ONLY when `isMine` (`flags.crisis && !crisisAcked`), plus the
`myCrisisAlerts` query so the card survives scrolling; dismissal persists via
`ackCrisisCard` (`crisisAcked: true`).

---

## 7. File ownership (10 workers) & build checks

| # | Worker | Files | Depends on |
|---|---|---|---|
| 1 | schema | `convex/schema.ts` (append §1), runs `npx convex codegen` | — |
| 2 | model | `convex/model/anonHandles.ts`, `convex/model/communityRules.ts`, `__tests__/anonHandles.test.ts`, `__tests__/communityRules.test.ts` | — |
| 3 | groups | `convex/community.ts` | 1, 2 |
| 4 | posts | `convex/communityPosts.ts` | 1, 2, 3 (contract only — code to this doc, don't wait) |
| 5 | moderation | `convex/communityModeration.ts` | 1, 2 |
| 6 | copy | `src/constants/communityCopy.ts` | — |
| 7 | tab screen | `src/app/(tabs)/community.tsx` | 3, 6, 9 |
| 8 | feed screen | `src/app/community/[groupId].tsx` | 4, 6, 9 |
| 9 | components | `src/components/community/{PostCard,Composer,CrisisCard,GroupEmptyState}.tsx` | 4 (types), 6 |
| 10 | integrator | `_layout.tsx` tab (§3.7), `npx convex codegen`, `npx convex run community:seedGroups '{}'`, final `npx tsc --noEmit` | all |

- `npx tsc --noEmit` must pass from repo root before any worker reports done.
- Only worker 1 and worker 10 run `npx convex codegen` (no concurrent codegen).
- NO new npm deps (see `hale-deps.md`). Moderation = raw fetch, no SDK.
- Env (deployment, not code): `ANTHROPIC_API_KEY` must be set or posts stay
  `pending` (fail-safe by design).
