import { internalMutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Native (iOS) OAuth ID-token verification + anonymous→permanent account linking.
 *
 * The web-redirect OAuth flow in @convex-dev/auth doesn't fit native clients:
 * Sign in with Apple (AuthenticationServices) and Google Sign-In hand the app an
 * ID token / identity token directly, with no authorization-code redirect. So we
 * verify those tokens ourselves here and drive account creation/linking through
 * ConvexCredentials `authorize` (see convex/auth.ts).
 *
 * Verification = standard OIDC ID-token checks: RS256 signature against the
 * provider's published JWKS, correct issuer, and audience == our client id, plus
 * jose's built-in exp/iat checks.
 */

export type IdClaims = { sub: string; email?: string; name?: string };

/**
 * Account status for the sign-in / "Save your progress" UI: whether the current
 * user is still anonymous (deferred sign-up) or has linked a permanent account.
 * Additive, read-only — safe for the RN app.
 */
export const accountStatus = query({
  args: {},
  returns: v.object({
    signedIn: v.boolean(),
    isAnonymous: v.boolean(),
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { signedIn: false, isAnonymous: true, email: null, name: null };
    const user = await ctx.db.get(userId);
    return {
      signedIn: true,
      isAnonymous: user?.isAnonymous ?? true,
      email: user?.email ?? null,
      name: user?.name ?? null,
    };
  },
});

// Apple: https://appleid.apple.com/.well-known/openid-configuration
const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// Google: https://accounts.google.com/.well-known/openid-configuration
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Verify an Apple identity token. The audience is the app's bundle id (Apple
 * uses it as the OAuth client id for native Sign in with Apple). Overridable via
 * APPLE_CLIENT_ID env for flexibility; defaults to the shipping bundle id.
 */
export async function verifyAppleIdToken(idToken: string): Promise<IdClaims> {
  const audience = process.env.APPLE_CLIENT_ID ?? 'com.ravipulavarthy.hale';
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience,
  });
  if (typeof payload.sub !== 'string') throw new Error('Apple token missing sub');
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}

/**
 * Verify a Google ID token. The audience must be the OAuth client id the token
 * was minted for (the iOS client id). REQUIRED via GOOGLE_CLIENT_ID env — without
 * it we cannot validate the audience, so we refuse rather than trust blindly.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<IdClaims> {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new Error(
      'GOOGLE_CLIENT_ID is not configured on the Convex deployment; cannot verify Google sign-in.',
    );
  }
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: GOOGLE_ISSUERS,
    audience,
  });
  if (typeof payload.sub !== 'string') throw new Error('Google token missing sub');
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

/**
 * Link a freshly-verified OAuth account to the user who is CURRENTLY signed in
 * (the anonymous user created at onboarding), so their streak and all data carry
 * over unchanged — the user `_id` never changes. Called from `authorize` only
 * when there is no pre-existing account for this provider identity, so there is
 * nothing to duplicate.
 *
 * This mirrors what @convex-dev/auth's own `createOrUpdateAccount` does (insert an
 * `authAccounts` row pointing at the chosen user), then promotes the user out of
 * anonymous. Returns false if the user vanished mid-flow so the caller can fall
 * back to creating a fresh account.
 */
export const linkAccountToCurrentUser = internalMutation({
  args: {
    userId: v.id('users'),
    provider: v.string(),
    providerAccountId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;

    await ctx.db.insert('authAccounts', {
      userId: args.userId,
      provider: args.provider,
      providerAccountId: args.providerAccountId,
    });

    await ctx.db.patch(args.userId, {
      isAnonymous: false,
      ...(args.email ? { email: args.email } : {}),
      // Only set the name if we don't already have one (don't clobber).
      ...(args.name && !user.name ? { name: args.name } : {}),
    });
    return true;
  },
});
