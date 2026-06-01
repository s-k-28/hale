import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';

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
        <p>You started something hard — and you're still here. That matters more than you know.</p>
        <p>Your HALE trial is wrapping up soon. Quitting nicotine isn't a one-week thing,
        and the days ahead are exactly when having your streak, your buddy, and Sage in your
        corner makes the biggest difference.</p>
        <p>Keep your momentum going. We're rooting for you.</p>
        <p style="margin-top: 24px;">— The HALE team</p>
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
 * Daily win-back / trial-reminder sweep (scheduled by crons.ts). STUB.
 *
 * EMAIL-GATED: only users who have LINKED an email can be reminded — anonymous
 * users (schema Decision 2) have none, and sendTrialReminder is a no-op for
 * them. Once trial/lifecycle windows are defined, enumerate eligible users
 * here and ctx.scheduler.runAfter(0, internal.email.sendTrialReminder, ...)
 * per user. Kept as a no-op pass-through stub for now so the cron is wired but
 * inert until that targeting query exists.
 */
export const trialReminderSweep = internalAction({
  args: {},
  handler: async (_ctx) => {
    // TODO(step 8): query users whose trial is ending AND who have a linked
    // email, then schedule internal.email.sendTrialReminder for each.
    // No-op until the eligibility query lands — anonymous users are never
    // emailed (they have no address to reach).
  },
});
