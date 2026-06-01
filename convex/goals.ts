import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { moneySaved } from './model/plan';

/**
 * "Treat yourself" savings goals (P4) — turn the abstract "$ saved" number into
 * a concrete reward the user is buying with their clean time.
 *
 * Progress reuses the SAME money math as the Today/You screens (model/plan
 * moneySaved): lifetime ledger + the current attempt's saved-so-far, computed at
 * query time so it ticks up live via Convex reactivity. A goal is "achieved" the
 * moment savings cross its target — stamped once into achievedAt so the win is
 * preserved even if a later relapse resets the live counter.
 */

/** Set a "treat yourself" goal (P4). Owned by the authed user. */
export const setGoal = mutation({
  args: { label: v.string(), targetAmount: v.number() },
  handler: async (ctx, { label, targetAmount }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const trimmed = label.trim();
    if (!trimmed) throw new Error('Give your goal a name');
    if (!Number.isFinite(targetAmount) || targetAmount <= 0)
      throw new Error('Target must be more than $0');

    const goalId = await ctx.db.insert('savingsGoals', {
      userId,
      label: trimmed,
      targetAmount,
      createdAt: Date.now(),
    });
    return { goalId };
  },
});

/**
 * The authed user's goals with live progress (P4). Each goal carries its dollar
 * progress toward the target, a 0..1 ratio, the $ remaining, and whether it's
 * been reached. Crossing the target stamps achievedAt once (so the celebration
 * persists across day-rollovers and future relapses).
 */
export const myGoals = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    if (!user) return [];

    // Total saved = lifetime ledger + the current attempt's saved-so-far. Same
    // composition as users.todayState (single source of truth for $ saved).
    const now = Date.now();
    const profile = { baselinePerDay: user.baselinePerDay ?? 0, unitCost: user.unitCost ?? 0 };
    let currentSaved = 0;
    if (user.currentAttemptId) {
      const attempt = await ctx.db.get(user.currentAttemptId);
      if (attempt) currentSaved = moneySaved(profile, now - attempt.startDate);
    }
    const totalSaved = (user.lifetimeMoneySaved ?? 0) + currentSaved;

    const goals = await ctx.db
      .query('savingsGoals')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    return goals
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((g) => {
        const reached = totalSaved >= g.targetAmount;
        const progress = Math.min(totalSaved, g.targetAmount);
        const remaining = Math.max(0, g.targetAmount - totalSaved);
        const ratio = g.targetAmount > 0 ? Math.min(1, totalSaved / g.targetAmount) : 1;
        return {
          _id: g._id,
          label: g.label,
          targetAmount: g.targetAmount,
          createdAt: g.createdAt,
          achievedAt: g.achievedAt ?? (reached ? now : null),
          saved: progress, // $ counted toward this goal (capped at target)
          remaining, // $ left to go
          ratio, // 0..1 for the progress bar
          reached,
        };
      });
  },
});

/** Delete a goal (P4). Owner-scoped — can't touch someone else's goal. */
export const deleteGoal = mutation({
  args: { goalId: v.id('savingsGoals') },
  handler: async (ctx, { goalId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const goal = await ctx.db.get(goalId);
    if (!goal) return { deleted: false };
    if (goal.userId !== userId) throw new Error('Not your goal');

    await ctx.db.delete(goalId);
    return { deleted: true };
  },
});
