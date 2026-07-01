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
  sageContextLine,
  SAGE_MODEL,
  SAGE_DAILY_CAP,
  SAGE_COST_PER_INPUT_TOKEN,
  SAGE_COST_PER_OUTPUT_TOKEN,
  SAGE_MAX_CONTEXT_TURNS,
} from './model/sage';
import {
  buildSageSystemPrompt,
  detectRouteFlag,
  containsClinicalDosing,
  medicalRedirectReply,
} from './model/sage.prompt';
import { searchKnowledge } from './sageKnowledge';
import { CONTACTS } from '../knowledge/sources.config';
import { moneySaved } from './model/plan';
import { localDateOf } from './model/streak';
import { resolveEntitlement } from './model/entitlement';

/**
 * Resolve a user's access tier for Sage gating + cost attribution, from the
 * single HALE+ entitlement resolver. A referral-reward window grants the same
 * unlimited-Sage 'paid' tier as a subscription for its 7 days — both feed one
 * hasHALEPlus, so the daily cap lifts identically however the user unlocked it.
 * With the app-managed trial floor removed (hard paywall), the live tiers are
 * free/paid; 'trial' remains in the cap table and message rows for legacy data.
 */
function tierOf(
  user: { premium?: boolean; trialEndsAt?: number; referralRewardEndsAt?: number } | null,
  now: number,
): 'free' | 'trial' | 'paid' {
  const { source } = resolveEntitlement(user, now);
  if (source === 'paid' || source === 'referral_reward') return 'paid';
  return 'free';
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
  "I'm here with you. Cravings peak and pass in just a few minutes. Try a few slow breaths and ride this wave out. You've got this.";

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
// Hard cap on a single coach message. Sage is the cost-bearing path (Groq
// tokens + Google embeddings); without a cap a client could send a multi-MB
// body, bloating input tokens, the stored row, and the embedding call. ~2k
// chars (≈400 words) is generous for a coaching message; trim beyond that.
const SAGE_MAX_MESSAGE_CHARS = 2000;

export const send = mutation({
  args: { content: v.string() },
  handler: async (ctx, { content: rawContent }) => {
    const content = rawContent.trim().slice(0, SAGE_MAX_MESSAGE_CHARS);
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    // Guideline 5.1.2(i): chat content reaches third-party AI (Groq replies,
    // Google embeddings), so no message is accepted before explicit consent
    // (users.setAiConsent). The coach UI gates first; this is the enforcement.
    if (user?.aiConsentAt === undefined)
      return { accepted: false as const, tier: 'free' as const, dailyCount: 0, capType: 'consent_required' as const };
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
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      // RAG retrieval + safety routing for THIS message: pull source-grounded
      // evidence from the knowledge index and detect crisis/medical requests.
      const lastUser = [...c.history].reverse().find((m) => m.role === 'user');
      const userMessage = lastUser?.content ?? '';
      const routeFlag = detectRouteFlag(userMessage);
      // On a crisis signal we skip retrieval and let the safety override drive.
      const evidence = routeFlag === 'crisis' ? [] : await searchKnowledge(ctx, userMessage);
      const systemPrompt = buildSageSystemPrompt({
        contextLine: sageContextLine(c.ctx),
        evidence,
        contacts: CONTACTS,
        routeFlag,
      });
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: SAGE_MODEL,
            max_tokens: 400,
            // System turn = MI persona + core facts + retrieved evidence + routing,
            // then the chat history. (Groq's OpenAI-compatible API has no prompt
            // cache, so there's no cacheable-prefix split to preserve.)
            messages: [
              { role: 'system', content: systemPrompt },
              ...c.history,
            ],
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json?.choices?.[0]?.message?.content;
          if (typeof text === 'string' && text.trim()) content = text.trim();
          const u = json?.usage;
          if (u) {
            usage = {
              inputTokens: u.prompt_tokens ?? 0,
              outputTokens: u.completion_tokens ?? 0,
              cacheHit: false,
            };
          }
        } else {
          // Surface WHY we fell back. Without this, a misconfig (bad key, rate
          // limit, bad model) is invisible and Sage serves the canned reply
          // forever with no signal. Best-effort parse of Groq's
          // {error:{message,type}} envelope; status alone is the floor.
          let detail = '';
          try {
            const err = await res.json();
            detail = err?.error?.message
              ? `${err.error.type ?? 'error'}: ${err.error.message}`
              : '';
          } catch {
            // body wasn't JSON — the status code is the signal
          }
          console.error(`[sage] groq non-ok ${res.status} ${detail} — using fallback`);
        }
      } catch (e) {
        // Network/parse failure — keep the warm fallback, but record the reason.
        console.error(
          '[sage] groq fetch failed — using fallback:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // Output-side clinical backstop (model-independent): if the generated reply
    // slipped a dose/medication specific past the persona rule + regex router,
    // replace it with a route-to-clinician message before it ever persists.
    if (containsClinicalDosing(content)) content = medicalRedirectReply(CONTACTS);

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
