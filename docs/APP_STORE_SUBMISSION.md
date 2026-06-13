# HALE — App Store Submission Runbook

_2026-06-12. Everything code-side is done (see "Already done" below). This is the ordered human checklist — each step needs your accounts (Apple, RevenueCat, Cloudflare, PostHog/OneSignal/Sentry keys)._

## Already done (code-side, on `compliance-pass`)

- Hard paywall + IAP-only paths (3.1.1), 21+ age gate (2.18), medical disclaimers + cited sources (1.4.1), in-app account deletion (5.1.1(v)), privacy policy + **Terms of Service** pages with in-app links incl. on the paywall (3.1.2 / 5.1.1).
- Universal links: `applinks:go.haleapp.com` in app.json + AASA/assetlinks in `web/.well-known/`.
- `ITSAppUsesNonExemptEncryption=false` (no per-build export-compliance stall; app uses only standard HTTPS).
- OneSignal plugin `mode: production` (App Store APNs entitlement).
- Full haptic system (user-toggleable), design-QA'd UI, 79 passing tests, tsc clean.

## 1. Deploy the web kit (BLOCKER — review will open these URLs)

Deploy `web/` to Cloudflare Pages (or equivalent) so these are LIVE:
- `https://haleapp.com/privacy` and `https://haleapp.com/terms` (linked from the app + paywall + ASC metadata)
- `https://go.haleapp.com/.well-known/apple-app-site-association` (universal links — must serve with no redirect; `web/_redirects` is already correct)
- See `web/README.md` for the hosting convention.

## 2. App Store Connect — app + products

1. Create the app (bundle id `com.haleapp.hale`, name HALE, primary category Health & Fitness).
2. Subscriptions, one group: `hale_plus_annual` $79.99/yr + `hale_plus_monthly` $12.99/mo, both with a **14-day free trial** intro offer.
3. App Privacy questionnaire (truthful per `web/privacy.html`): identifiers (anonymous user id), health-adjacent self-reported data (quit/craving logs), purchases, diagnostics (Sentry), product interaction (PostHog) — all linked-to-user via anonymous id, **no tracking across apps** (no ATT prompt needed; do NOT declare Tracking).
4. Age rating: 17+ (frequent/intense references to tobacco). Paste privacy + terms URLs into the metadata fields.

## 3. RevenueCat

1. Import the two products → attach both to the `HALE+` entitlement.
2. Build the native paywall (two plans, annual default) in the RC dashboard.
3. Set the webhook → `<CONVEX_SITE_URL>/revenuecat/webhook` with the secret → `npx convex env set REVENUECAT_WEBHOOK_SECRET <value>` on the **production** deployment.

## 4. Production env

- Convex: deploy prod (`npx convex deploy`), set env: `JWT_PRIVATE_KEY`/`JWKS` (run `npx @convex-dev/auth` against prod or set manually), `GROQ_API_KEY` (Sage), `ONESIGNAL_REST_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `RESEND_API_KEY` (optional email).
- `.env.local` → EAS secrets: `EXPO_PUBLIC_CONVEX_URL` (prod), `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`), `EXPO_PUBLIC_ONESIGNAL_APP_ID`, `EXPO_PUBLIC_SENTRY_DSN`.

## 5. Build + submit

```bash
eas build -p ios --profile production
eas submit -p ios
```
(`appVersionSource: remote` + `autoIncrement` handle build numbers.)

## 6. Real-device test pass (before pressing Submit)

The simulator could not verify these — test on hardware via TestFlight:
1. **Haptics feel** — weights/celebrate rhythm/breath sync (toggle in You → Haptic feedback). All call paths are unit-tested; only the *feel* needs tuning. Every weight lives in `src/lib/haptics.ts`.
2. **Two-phone referral** (#1 launch test): share link on phone A → fresh install via link on phone B → onboard → pair → confirm A's progress meter ticks and the 3rd referral grants 7-day HALE+.
3. **Purchase sandbox**: full trial-start flow, restore purchases, webhook → premium mirror.
4. Push opt-in + a buddy nudge arriving on hardware.
5. Share sheets (card PNG + invite links) to real targets (Messages/Instagram).

## Known post-launch fast-follows (documented, not blockers)

- Real WidgetKit home-screen widgets (in-app preview ships now, gated).
- Quiz step eyebrow says "SAGE · n/7" before Sage is introduced — consider "STEP n OF 7" (one-line copy change in `src/app/(onboarding)/quiz.tsx`).
- Trial-length A/B (14d vs 3d) per `RELAUNCH_PLAN.md`.
