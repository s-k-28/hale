import { convexAuth, getAuthUserId, createAccount, retrieveAccount } from '@convex-dev/auth/server';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { internal } from './_generated/api';
import { verifyAppleIdToken, verifyGoogleIdToken, type IdClaims } from './authNative';

/**
 * Decision 2: deferred sign-up. The client signs in ANONYMOUSLY at the
 * commitment step so the quit can start with no email gate; a permanent account
 * (Apple / Google) can be linked later ("save your progress"). The Anonymous
 * provider stamps isAnonymous:true on the users row.
 *
 * Apple + Google are added as native ID-token providers: native iOS gets an
 * identity token straight from AuthenticationServices / Google Sign-In, so the
 * built-in web-redirect OAuth flow doesn't apply — we verify the token ourselves
 * in convex/authNative.ts and use ConvexCredentials to create/link the account.
 * Anonymous stays the default and is UNCHANGED, so the React Native app keeps
 * working exactly as before (additive change).
 */

/**
 * A native OAuth ID-token provider. The client calls
 * `signIn("<id>", { idToken, name? })` from an authenticated (anonymous) session;
 * we verify the token, then:
 *   1. if an account already exists for this identity → sign into THAT user
 *      (returning user / restore after sign-out),
 *   2. else if there's a signed-in anonymous user → LINK to it (data preserved,
 *      user `_id` unchanged),
 *   3. else → create a fresh permanent account.
 */
function nativeIdTokenProvider(id: 'apple' | 'google', verify: (token: string) => Promise<IdClaims>) {
  return ConvexCredentials({
    id,
    authorize: async (credentials, ctx) => {
      const idToken = typeof credentials.idToken === 'string' ? credentials.idToken : undefined;
      if (!idToken) throw new Error(`Missing idToken for ${id} sign-in`);

      const claims = await verify(idToken);
      const providerAccountId = claims.sub;
      // Apple only returns the display name on the FIRST authorization, and only
      // to the client — accept it from params, falling back to any token name.
      const nameFromClient =
        typeof credentials.name === 'string' && credentials.name.trim().length > 0
          ? credentials.name.trim()
          : undefined;
      const name = nameFromClient ?? claims.name;

      // 1. Existing account for this identity → sign into that same user.
      const existing = await retrieveAccount(ctx, {
        provider: id,
        account: { id: providerAccountId },
      }).catch(() => null);
      if (existing) return { userId: existing.user._id };

      // 2. Link to the currently signed-in anonymous user so data carries over.
      const currentUserId = await getAuthUserId(ctx);
      if (currentUserId) {
        const linked = await ctx.runMutation(internal.authNative.linkAccountToCurrentUser, {
          userId: currentUserId,
          provider: id,
          providerAccountId,
          email: claims.email,
          name,
        });
        if (linked) return { userId: currentUserId };
      }

      // 3. No anonymous session (cold sign-in) → fresh permanent account.
      const created = await createAccount(ctx, {
        provider: id,
        account: { id: providerAccountId },
        // Omit undefined keys — Convex profile values must not be `undefined`.
        profile: {
          isAnonymous: false,
          ...(claims.email ? { email: claims.email } : {}),
          ...(name ? { name } : {}),
        },
        shouldLinkViaEmail: false,
      });
      return { userId: created.user._id };
    },
  });
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous({ profile: () => ({ isAnonymous: true }) }),
    nativeIdTokenProvider('apple', verifyAppleIdToken),
    nativeIdTokenProvider('google', verifyGoogleIdToken),
  ],
});
