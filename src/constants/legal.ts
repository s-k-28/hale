/**
 * Legal / support surface — single source for the contact + policy links App
 * Review requires to be reachable in-app (Guidelines 1.2, 5.1.1(i), 3.1.2).
 * The pages live on the go.haleapp.com static kit (web/); the same URLs go in
 * App Store Connect's Privacy Policy and Support URL fields.
 */

export const SUPPORT_EMAIL = 'support@haleapp.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export const PRIVACY_POLICY_URL = 'https://go.haleapp.com/privacy';
export const TERMS_URL = 'https://go.haleapp.com/terms';

/** Apple's standard EULA — what Terms of Use defaults to for IAP apps (3.1.2). */
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Apple-managed subscription management (deletion flow + paywall footer). */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
