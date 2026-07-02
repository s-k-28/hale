import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { TRIAL_REMINDER_WINDOW_MS } from './model/trial';

/**
 * Lifecycle-email layer (Resend). Mirrors the pushes.ts pattern: actions hold
 * the external I/O, touch the db only via ctx.runQuery / ctx.runMutation, and
 * degrade to a no-op when keys are missing so the app stays scaffold-safe.
 *
 * The RESEND_API_KEY lives in the Convex deployment env (process.env), never
 * in the bundle.
 *
 * IMPORTANT — email gating: HALE users are created via anonymous auth
 * (schema Decision 2), so users.email is OPTIONAL and most users have NO email
 * until they explicitly link one. Every lifecycle send is therefore gated on
 * email availability — we never attempt to email an anonymous user.
 */

/**
 * Send one transactional email via the Resend REST API. Best-effort:
 *   • missing RESEND_API_KEY → no-op (scaffold mode), returns { sent: false }
 *   • otherwise POSTs to Resend and returns { sent: true }
 */
export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  handler: async (_ctx, { to, subject, html }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { sent: false }; // scaffold mode — key not configured

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: 'HALE <hi@hale.app>',
        to: [to],
        subject,
        html,
      }),
    });

    return { sent: true };
  },
});

/**
 * Resolve a user's email. Returns null when the user is anonymous / hasn't
 * linked an email yet (users.email is optional — see schema Decision 2).
 */
export const getUserEmail = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return { email: user?.email ?? null, name: user?.name ?? null };
  },
});

/**
 * Trial-reminder lifecycle email. GATED ON EMAIL AVAILABILITY: anonymous users
 * have no email until they link one, so if the user has no email this is a
 * silent no-op (returns { sent: false }). Only linked-email users get warmth.
 */
export const sendTrialReminder = internalAction({
  args: { userId: v.id('users') },
  // Explicit return type: this action calls a sibling internal action, which
  // would otherwise create a circular type inference (TS7022/7023).
  handler: async (ctx, { userId }): Promise<{ sent: boolean }> => {
    const { email, name } = await ctx.runQuery(internal.email.getUserEmail, { userId });
    if (!email) return { sent: false }; // anonymous / not linked — nothing to send

    const greeting = name ? `Hey ${name},` : 'Hey,';
    const html = `
      <div style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #1a1a1a;">
        <p>${greeting}</p>
        <p>You started something hard, and you're still here. That matters more than you know.</p>
        <p>Your HALE trial is wrapping up soon. Quitting nicotine isn't a one-week thing,
        and the days ahead are exactly when having your streak, your buddy, and Sage in your
        corner makes the biggest difference.</p>
        <p>Keep your momentum going. We're rooting for you.</p>
        <p style="margin-top: 24px;">The HALE team</p>
      </div>
    `;

    return await ctx.runAction(internal.email.sendEmail, {
      to: email,
      subject: "You've come too far to stop now",
      html,
    });
  },
});

/**
 * Users whose app-managed trial (§8) is ending soon and who can actually be
 * reached + still need converting:
 *   • trialEndsAt within the next TRIAL_REMINDER_WINDOW_MS (≤ 2 days) and not
 *     already past
 *   • NOT premium (a subscriber doesn't need a trial nudge)
 *   • has a linked email (anonymous users have none — schema Decision 2)
 *   • not already reminded (trialReminderSent — the email fires exactly once)
 */
export const trialEndingUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query('users').collect();
    const due: Id<'users'>[] = [];
    for (const user of users) {
      if (user.premium) continue; // already converted
      if (!user.email) continue; // can't reach an anonymous user
      if (user.trialReminderSent) continue; // one reminder, ever
      const endsAt = user.trialEndsAt;
      if (endsAt == null) continue;
      if (endsAt <= now) continue; // already expired — handled by the paywall, not email
      if (endsAt - now > TRIAL_REMINDER_WINDOW_MS) continue; // not close enough yet
      due.push(user._id);
    }
    return due;
  },
});

/** Stamp that the trial-ending email was sent (dedup — fires exactly once). */
export const markTrialReminded = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { trialReminderSent: true });
  },
});

/**
 * Daily trial-reminder sweep (scheduled by crons.ts). For each user whose trial
 * is ending soon, send the single "your trial is ending" email and stamp it so
 * we never email twice. sendTrialReminder is itself email-gated + scaffold-safe
 * (no-op without RESEND_API_KEY), so this is safe to run before keys land — it
 * just won't deliver. Returns the count for log/verification.
 */
export const trialReminderSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ reminded: number }> => {
    const due: Id<'users'>[] = await ctx.runQuery(internal.email.trialEndingUsers, {});
    for (const userId of due) {
      await ctx.scheduler.runAfter(0, internal.email.sendTrialReminder, { userId });
      await ctx.runMutation(internal.email.markTrialReminded, { userId });
      console.log('[ev:server] trial_reminder_sent', JSON.stringify({ userId }));
    }
    return { reminded: due.length };
  },
});
