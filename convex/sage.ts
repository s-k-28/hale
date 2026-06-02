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
import { SAGE_PERSONA, sageContextLine, SAGE_MODEL } from './model/sage';
import { moneySaved } from './model/plan';

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

/** Send a message to Sage: persist the user turn, then schedule the reply. */
export const send = mutation({
  args: { content: v.string() },
  handler: async (ctx, { content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    await ctx.db.insert('sageMessages', { userId, role: 'user', content, ts: Date.now() });
    await ctx.scheduler.runAfter(0, internal.sage.generate, { userId });
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

    await ctx.runMutation(internal.sage.writeReply, { userId, content });
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
      history: messageRows.map((m) => ({
        role: m.role === 'sage' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
    };
  },
});

/** Persist Sage's turn. Called only by the generate action. */
export const writeReply = internalMutation({
  args: { userId: v.id('users'), content: v.string() },
  handler: async (ctx, { userId, content }) => {
    await ctx.db.insert('sageMessages', { userId, role: 'sage', content, ts: Date.now() });
  },
});
