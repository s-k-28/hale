import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import {
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { internal } from './_generated/api';
import {
  SAGE_PERSONA,
  sageContextLine,
  SAGE_MODEL,
  SAGE_DAILY_CAP,
  SAGE_COST_PER_INPUT_TOKEN,
  SAGE_COST_PER_OUTPUT_TOKEN,
  SAGE_MAX_CONTEXT_TURNS,
} from './model/sage';
import { moneySaved } from './model/plan';
import { localDateOf } from './model/streak';
import { trialStatus } from './model/trial';

/** Resolve a user's access tier for Sage gating + cost attribution. */
function tierOf(user: { premium?: boolean; trialEndsAt?: number } | null, now: number): 'free' | 'trial' | 'paid' {
  if (user?.premium) return 'paid';
  return trialStatus(now, user?.trialEndsAt, user?.premium ?? false).trialActive ? 'trial' : 'free';
}

/**
 * Sage — the in-app coach (I2). Production Convex pattern for talking to an
 * external LLM:
 *   send (mutation)        — captures user intent, writes it, schedules generate.
 *   generate (action)      — pulls context, calls Claude over HTTP, writes reply.
 *   contextFor (query)     — assembles the non-shaming context + chat history.
 *   writeReply (mutation)  — persists Sage's turn.
 *
 * Mutations stay deterministic (no fetch); the network call lives in an action.
 * Sage NEVER shames — even the no-key fallback is warm (see model/sage.ts).
 */

const FALLBACK_REPLY =
  "I'm here with you. Cravings peak and pass in just a few minutes — try a few slow breaths and ride this wave out. You've got this.";

/** The authed user's full Sage thread, oldest → newest (chat order). */
export const messages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('sageMessages')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .order('asc')
      .collect();
  },
});

/**
 * Send a message to Sage (P3 cost-controlled): resolve the user's tier, enforce a
 * per-tier DAILY message cap (reset on local-date rollover), and only then persist
 * the user turn + schedule the reply. Over quota → returns accepted:false WITHOUT
 * writing or scheduling (no LLM compute spent); the client fires sage_cap_hit.
 * Returns tier + dailyCount + capType so the client can enrich coach_message_sent.
 */
export const send = mutation({
  args: { content: v.string() },
  handler: async (ctx, { content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    const now = Date.now();
    const tier = tierOf(user, now);
    const today = user?.timezone
      ? localDateOf(now, user.timezone)
      : new Date(now).toISOString().slice(0, 10);
    const count = user?.sageMsgLocalDate === today ? user?.sageMsgCount ?? 0 : 0;
    const cap = SAGE_DAILY_CAP[tier];

    if (count >= cap) {
      // Daily quota reached — block before any compute. Client fires sage_cap_hit.
      return { accepted: false as const, tier, dailyCount: count, capType: 'daily_quota' as const };
    }

    await ctx.db.insert('sageMessages', { userId, role: 'user', content, ts: now });
    await ctx.db.patch(userId, { sageMsgLocalDate: today, sageMsgCount: count + 1 });
    await ctx.scheduler.runAfter(0, internal.sage.generate, { userId });
    return { accepted: true as const, tier, dailyCount: count + 1, capType: null };
  },
});

/**
 * Calls Claude with the user's context + history and writes the reply.
 * Runs in a Node-less action: no db access, only ctx.runQuery / ctx.runMutation.
 * Any missing key or upstream error degrades gracefully to a warm fallback.
 */
export const generate = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const c = await ctx.runQuery(internal.sage.contextFor, { userId });

    let content = FALLBACK_REPLY;
    // Token/cost usage for the per-message ledger (P3). Stays 0 on the fallback
    // path (no key / error) — real numbers require Anthropic credits (real-world).
    let usage = { inputTokens: 0, outputTokens: 0, cacheHit: false };
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: SAGE_MODEL,
            max_tokens: 400,
            // Stable persona first (cacheable prefix), volatile per-user context
            // after — keeps the cache breakpoint from busting every turn.
            system: [
              { type: 'text', text: SAGE_PERSONA, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: sageContextLine(c.ctx) },
            ],
            messages: c.history,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json?.content?.[0]?.text;
          if (typeof text === 'string' && text.trim()) content = text.trim();
          const u = json?.usage;
          if (u) {
            const cacheRead = u.cache_read_input_tokens ?? 0;
            usage = {
              inputTokens: (u.input_tokens ?? 0) + cacheRead,
              outputTokens: u.output_tokens ?? 0,
              cacheHit: cacheRead > 0,
            };
          }
        } else {
          // Surface WHY we fell back. Without this, a misconfig (bad/credit-less
          // key, rate limit, bad model) is invisible and Sage serves the canned
          // reply forever with no signal. Best-effort parse of Anthropic's
          // {error:{type,message}} envelope; status alone is the floor.
          let detail = '';
          try {
            const err = await res.json();
            detail = err?.error?.type
              ? `${err.error.type}: ${err.error.message ?? ''}`
              : '';
          } catch {
            // body wasn't JSON — the status code is the signal
          }
          console.error(`[sage] anthropic non-ok ${res.status} ${detail} — using fallback`);
        }
      } catch (e) {
        // Network/parse failure — keep the warm fallback, but record the reason.
        console.error(
          '[sage] anthropic fetch failed — using fallback:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    await ctx.runMutation(internal.sage.writeReply, {
      userId,
      content,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheHit: usage.cacheHit,
    });
  },
});

/**
 * Assembles Sage's context: current streak + triggers + $ saved on the active
 * attempt + recent craving count, plus the chat history in Anthropic's shape
 * (our 'sage' role maps to Anthropic's 'assistant').
 */
export const contextFor = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);

    const recentCravings = await ctx.db
      .query('cravings')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .order('desc')
      .take(10);

    const messageRows = await ctx.db
      .query('sageMessages')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .order('asc')
      .collect();

    let moneySavedTotal = 0;
    if (user?.currentAttemptId) {
      const attempt = await ctx.db.get(user.currentAttemptId);
      if (attempt) {
        const profile = {
          baselinePerDay: user.baselinePerDay ?? 0,
          unitCost: user.unitCost ?? 0,
        };
        moneySavedTotal = moneySaved(profile, Date.now() - attempt.startDate);
      }
    }

    return {
      ctx: {
        currentStreak: user?.currentStreak ?? 0,
        triggers: user?.triggers ?? [],
        hardestHour: user?.hardestHour,
        moneySaved: moneySavedTotal,
        recentCravings: recentCravings.length,
      },
      // Sliding window (P3): cap history so a long thread can't bloat input tokens.
      history: messageRows.slice(-SAGE_MAX_CONTEXT_TURNS).map((m) => ({
        role: m.role === 'sage' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
    };
  },
});

/**
 * Persist Sage's turn + the per-message cost ledger (P3). Called only by generate.
 * Stamps tokens/cost/tier/model on the sage row and rolls the month-to-date cost
 * proxy onto the user — so real Sage cost-per-payer is measurable from data.
 */
export const writeReply = internalMutation({
  args: {
    userId: v.id('users'),
    content: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    cacheHit: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, content, inputTokens, outputTokens, cacheHit }) => {
    const user = await ctx.db.get(userId);
    const now = Date.now();
    const tier = tierOf(user, now);
    const cost =
      (inputTokens ?? 0) * SAGE_COST_PER_INPUT_TOKEN +
      (outputTokens ?? 0) * SAGE_COST_PER_OUTPUT_TOKEN;
    await ctx.db.insert('sageMessages', {
      userId,
      role: 'sage',
      content,
      ts: now,
      inputTokens,
      outputTokens,
      costUsdProxy: cost,
      userTier: tier,
      cacheHit,
      model: SAGE_MODEL,
    });
    await ctx.db.patch(userId, { sageCostMtdUsd: (user?.sageCostMtdUsd ?? 0) + cost });
  },
});
