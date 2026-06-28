/**
 * Legal / support surface — the contact + policy links App Review requires to
 * be reachable in-app (Guidelines 1.2, 5.1.1(i), 3.1.2). The pages live on the
 * web/ static kit; the same URLs go in App Store Connect's Privacy Policy and
 * Support URL fields.
 */
import { PRIVACY_POLICY_URL as CANONICAL_PRIVACY_URL } from '@/lib/links';

export const SUPPORT_EMAIL = 'johnpulavarthy@gmail.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

// Single source: src/lib/links.ts owns the policy host (it must stay in sync
// with the deployed web/ kit and ASC metadata — see web/README.md).
export const PRIVACY_POLICY_URL = CANONICAL_PRIVACY_URL;
export const TERMS_URL = CANONICAL_PRIVACY_URL.replace('/privacy', '/terms');

/** Apple's standard EULA — what Terms of Use defaults to for IAP apps (3.1.2). */
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Apple-managed subscription management (deletion flow + paywall footer). */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
