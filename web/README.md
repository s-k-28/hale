# HALE link domain — deploy + go-live checklist

This folder is the static site for HALE's https referral/buddy links
(`https://<domain>/r/<code>` and `https://<domain>/u/<id>`). It does three jobs:

1. **Universal Links / App Links** — serves the two `/.well-known/` files so iOS
   and Android open links directly in the app when it's installed.
2. **Store fallback** — anyone WITHOUT the app lands on `index.html`, which
   shows their invite code and the App Store button.
3. **Code-through-install** — iOS has no first-party deferred deep linking, so
   the landing page (and the share message) carry the 6-char code; the new
   installer types it at "Have an invite code?" on HALE's welcome screen.

The app-side config lives in `app.json` (`ios.associatedDomains`,
`android.intentFilters`) and `src/lib/links.ts` (`LINK_DOMAIN`). All three must
use the SAME domain.

## Things only you can provide

| # | What | Where it goes |
|---|------|---------------|
| 1 | **A domain** (e.g. `go.haleapp.com` — currently the placeholder everywhere) | `src/lib/links.ts`, `app.json` (both platforms), this site's deployment |
| 2 | **Apple Team ID** (10 chars — developer.apple.com → Membership) | `web/.well-known/apple-app-site-association` → replace `TEAM_ID_HERE` |
| 3 | **Android signing SHA-256** — run `eas credentials -p android`, copy the SHA256 fingerprint (use the Play App Signing key fingerprint once on Play; include both while testing) | `web/.well-known/assetlinks.json` → replace `SHA256_FINGERPRINT_HERE` |
| 4 | **App Store URL** (once the listing exists) | `web/index.html` → the `#` href on the CTA (TODO marked) |
| 5 | **An EAS rebuild** after 1–3 — associated domains is a native entitlement; it does NOT apply via JS update or Expo Go | `eas build` |

## Deploying (Cloudflare Pages, free)

1. Create a Pages project, set the build output directory to `web/` (no build
   command — it's already static), or drag-and-drop the `web/` folder.
2. Attach the custom domain (CNAME via Cloudflare DNS).
3. **Critical Cloudflare gotcha:** Apple fetches the AASA file via its own CDN
   with User-Agent `AASA-Bot/1.0.0`, which Bot Fight Mode / Super Bot Fight
   Mode frequently blocks — silently breaking Universal Links. Either disable
   bot protection for this zone or add a WAF skip rule for
   `/.well-known/apple-app-site-association`. (Cloudflare lists AASA-Bot as a
   verified bot; allowlist verified bots.)
4. `_headers` already forces `application/json` for both well-known files;
   `_redirects` rewrites `/r/*` and `/u/*` to the landing page (200 rewrite —
   Apple requires the AASA file itself be served redirect-free, which it is).

## Verifying

- `curl -i https://<domain>/.well-known/apple-app-site-association` →
  200, `application/json`, no redirect.
- Apple's CDN view (what devices actually get):
  `https://app-site-association.cdn-apple.com/a/v1/<domain>` — refreshes within
  ~24h of deploy; freshly-installed devices fetch it at install time, existing
  installs re-check roughly weekly.
- Android: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<domain>&relation=delegate_permission/common.handle_all_urls`
- On-device (dev build): `xcrun simctl openurl booted "https://<domain>/r/TESTCODE"`
  should open HALE straight to the referral route. For pre-CDN testing, add
  `?mode=developer` to the entitlement (`applinks:<domain>?mode=developer`) in a
  dev build only.

## What's already wired in the app

- `src/lib/links.ts` — single source for the domain, the share texts, and the
  iOS/Android share-param split (iOS gets the link via `url:` only — inline
  would duplicate; Android ignores `url:` so the link rides inline).
- `ReferralCard` shares `https://<domain>/r/<CODE>`; the onboarding invite step
  and Squad's solo state share `https://<domain>/u/<id>` (all hale:// share
  links are gone).
- `src/app/r/[code].tsx` — expo-router maps the universal link's `/r/<code>`
  path straight to this route (file-based routing handles https URLs
  automatically); it resolves the code and hands off to the canonical
  `u/[id]` attribution flow.
- `src/components/InviteCodeEntry.tsx` on the welcome screen — typed-code
  deferred attribution, feeding the same `pendingBuddy` stash as a tapped link.
