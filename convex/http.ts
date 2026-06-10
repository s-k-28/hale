import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { auth } from './auth';
import { premiumChangesFor } from './model/rcWebhook';

const http = httpRouter();
auth.addHttpRoutes(http);

/**
 * RevenueCat webhook → mirror entitlement onto users.premium.
 * The RC SDK entitlement remains the RUNTIME source of truth for gating; this
 * mirror exists only for server-side gating + segmentation (avoids gating UX on
 * a lagging webhook). app_user_id == the Convex user _id (set via Purchases.logIn).
 * Event→mirror mapping lives in model/rcWebhook.ts (pure + unit-tested).
 */
http.route({
  path: '/revenuecat/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (request.headers.get('Authorization') !== process.env.REVENUECAT_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await request.json();
    for (const change of premiumChangesFor(body?.event)) {
      await ctx.runMutation(internal.users.setPremiumByExternalId, {
        externalId: change.externalId,
        premium: change.premium,
      });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
