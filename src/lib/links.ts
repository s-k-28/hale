/**
 * Shareable HALE links — v1 ships CODE-FIRST sharing, universal links deferred.
 *
 * WHY: the universal-link host (go.hale-app.com) is not stood up yet — no DNS,
 * no AASA — so an https://go.hale-app.com/r/CODE share would be a dead end for
 * every recipient (App Review Guideline 2.1: broken functionality). Until the
 * web/ kit is deployed, every share carries the App Store link (works for the
 * no-app case) plus the 6-char code in plain text; the fresh installer types
 * the code on the welcome screen (InviteCodeEntry), which runs the identical
 * attributeInstall → pairWith redemption a tapped deep link would have.
 *
 * Re-enabling universal links later requires ALL of (see web/README.md):
 *   1. go.hale-app.com DNS + deployed web/ kit (AASA with real Team ID)
 *   2. app.json → ios.associatedDomains ("applinks:go.hale-app.com")
 *   3. app.json → android.intentFilters[].data.host
 *   4. restoring referralLink()/buddyLink() here (git history has them)
 * Associated domains is a native entitlement — it needs a new EAS build.
 */

import { Platform } from 'react-native';

// HALE on the App Store (ASC app id 6781942293). Resolves once the app is
// live; the code-entry path never depends on it.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6781942293';

// Live at hale-app.com (verified 200). NOTE the hyphen: haleapp.com (no hyphen)
// is a PARKED domain we don't own — it redirects to a domain-sale page.
export const PRIVACY_POLICY_URL = 'https://hale-app.com/privacy';

// Live at hale-app.com (verified 200). Apple Guideline 3.1.2 requires a working
// Terms of Use link for the auto-renewable subscription. Same hyphen caveat.
export const TERMS_URL = 'https://hale-app.com/terms';

/**
 * RN Share params for an invite. iOS renders `url` as its own item and does
 * NOT dedupe an identical inline link, so the link lives ONLY in `url` there;
 * Android's Share.share ignores `url` entirely, so the link must ride inline.
 */
export function inviteShareParams(text: string, url: string): { message: string; url?: string } {
  return Platform.OS === 'ios' ? { message: text, url } : { message: `${text} ${url}` };
}

/** Referral share text — the typed code IS the attribution path for v1. */
export function referralShareText(code: string): string {
  return (
    `I'm quitting nicotine with HALE. Be my accountability buddy, and we'll keep each other ` +
    `on streak. Get it on the App Store and enter my invite code ${code} when you join.`
  );
}

/** Buddy-invite share text — same typed-code door (code entry also pairs us). */
export function buddyShareText(code: string): string {
  return (
    `I'm quitting nicotine with HALE. Be my accountability buddy? We'll keep each other on ` +
    `streak. Get it on the App Store and enter my invite code ${code} when you join.`
  );
}
