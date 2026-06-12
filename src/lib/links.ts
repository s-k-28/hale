/**
 * Shareable HALE links — the https universal-link layer over the hale:// scheme.
 *
 * WHY https and not hale://: a custom-scheme link is dead on a phone without
 * HALE installed (not even tappable in most messengers), and the referral
 * loop's entire audience is people WITHOUT the app. The https link opens the
 * app directly when installed (Universal Links / App Links) and falls back to
 * the web redirect page → App Store when not. The 6-char code rides inside the
 * share TEXT too, so a fresh installer can finish attribution by typing it at
 * onboarding ("Have an invite code?") — that's the $0, no-SDK, no-privacy-prompt
 * answer to iOS having no first-party deferred deep linking.
 *
 * ⚠️ LINK_DOMAIN must stay in sync with THREE places (see web/README.md):
 *   1. app.json → ios.associatedDomains ("applinks:<domain>")
 *   2. app.json → android.intentFilters[].data.host
 *   3. the deployed web/ static site (AASA + assetlinks + redirect page)
 * Changing it requires a new EAS build — associated domains is a native
 * entitlement, not JS.
 */

import { Platform } from 'react-native';

// TODO(launch): replace with the real owned domain before the store build.
export const LINK_DOMAIN = 'go.haleapp.com';

// TODO(launch): this page must be live before submission — the in-app link
// (You tab) AND the App Store Connect privacy-policy field both point at it.
export const PRIVACY_POLICY_URL = 'https://haleapp.com/privacy';

// TODO(launch): this page must be live before submission — the in-app links
// (You tab + paywall) point at it, and Apple Guideline 3.1.2 requires a working
// Terms of Use link for the auto-renewable subscription.
export const TERMS_URL = 'https://haleapp.com/terms';

/** The shareable referral link: opens HALE if installed, web redirect if not. */
export function referralLink(code: string): string {
  return `https://${LINK_DOMAIN}/r/${code}`;
}

/** The shareable buddy-invite link (same flow, keyed by user id not code). */
export function buddyLink(userId: string): string {
  return `https://${LINK_DOMAIN}/u/${userId}`;
}

/**
 * RN Share params for an invite. iOS renders `url` as its own item and does
 * NOT dedupe an identical inline link, so the link lives ONLY in `url` there;
 * Android's Share.share ignores `url` entirely, so the link must ride inline.
 */
export function inviteShareParams(text: string, url: string): { message: string; url?: string } {
  return Platform.OS === 'ios' ? { message: text, url } : { message: `${text} ${url}` };
}

/** Referral share text — the typed code rides along as the through-install fallback. */
export function referralShareText(code: string): string {
  return (
    `I'm quitting nicotine with HALE, be my accountability buddy and we'll keep each other ` +
    `on streak. Join me (invite code ${code})`
  );
}

/** Plain buddy-invite share text (no referral code attached). */
export function buddyShareText(): string {
  return `I'm quitting nicotine with HALE, be my accountability buddy? We'll keep each other on streak.`;
}
