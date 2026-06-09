import { internalMutation } from './_generated/server';
import { DAYS_PER_MONTH, MAX_DAILY_SPEND } from './model/plan';

/**
 * One-time fix for accounts whose `baselinePerDay` holds a *monthly* quantity.
 *
 * Onboarding used to store the raw monthly answer in `baselinePerDay`; it now
 * divides by DAYS_PER_MONTH (see quiz.tsx). Records written before that change
 * over-report the daily spend ~30×, rendering an absurd "$ saved" (e.g. $365
 * after a few hours). This recomputes them.
 *
 * Idempotent + safe to re-run: it only touches users whose implied daily spend
 * exceeds MAX_DAILY_SPEND (the same ceiling the savings math clamps to), and a
 * corrected record falls far below that threshold, so a second pass is a no-op.
 * Realistic users never trip it ($100/day ≈ $3,000/mo on nicotine).
 *
 * Run once from the Convex dashboard → Functions → migrations:fixMonthlyBaseline.
 */
export const fixMonthlyBaseline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    let fixed = 0;
    for (const user of users) {
      const perDay = user.baselinePerDay ?? 0;
      const cost = user.unitCost ?? 0;
      if (perDay * cost <= MAX_DAILY_SPEND) continue; // already sane (or post-fix)
      await ctx.db.patch(user._id, {
        baselinePerDay: perDay / DAYS_PER_MONTH,
        // currentMoneySaved is derived live from the corrected rate; lifetime is a
        // banked ledger only non-zero after a relapse, so fresh accounts need no
        // touch. Left intact deliberately — see handoff if back-correcting lifetime.
      });
      fixed++;
    }
    return { scanned: users.length, fixed };
  },
});
