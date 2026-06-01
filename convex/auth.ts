import { convexAuth } from '@convex-dev/auth/server';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';

/**
 * Decision 2: deferred sign-up. The client signs in ANONYMOUSLY at the
 * commitment step so the quit can start with no email gate; email/Apple can be
 * linked later ("save your progress"). The Anonymous provider stamps
 * isAnonymous:true on the users row.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous({ profile: () => ({ isAnonymous: true }) })],
});
