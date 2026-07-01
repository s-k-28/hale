# HALE v1.0 — go-live checklist (paid features)

What's left to make Sage + subscriptions work in the submitted build. Items
marked ✅ are already done in code/backend. The rest need your dashboards.

Prod Convex deployment: **agreeable-mongoose-741**
Webhook URL (you'll need this below): `https://agreeable-mongoose-741.convex.site/revenuecat/webhook`

---

## ✅ Already done (no action)
- Cloud backend live; anonymous sign-in keys set + verified.
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` wired into eas.json (public SDK key `appl_DWGV…`).
- `REVENUECAT_WEBHOOK_SECRET` generated + set on the backend. Get its value to
  paste into RevenueCat with:  `npx convex env get REVENUECAT_WEBHOOK_SECRET --prod`

---

## 1. Turn on Sage (the AI coach) — 2 backend keys
Get each key, then set it on prod (I can run these for you, or you can):

| Key | Where to get it |
|-----|-----------------|
| `GROQ_API_KEY` | console.groq.com → API Keys → Create |
| `GOOGLE_GENERATIVE_AI_API_KEY` | aistudio.google.com → Get API key |

Set them:  `npx convex env set --prod -- GROQ_API_KEY <value>` (same for Google).
Then ingest Sage's knowledge base on prod (needs the Google key first):
`npx convex run rag:ingestAll` — or the batched `bash scripts/resume-ingest.sh`.

## 2. Turn on subscriptions — App Store Connect + RevenueCat
This is the bulk of the work. Order matters:

**a) App Store Connect → your app → Subscriptions**
- Create a **Subscription Group** (e.g. "HALE+").
- Add **two** auto-renewable subscriptions in it:
  - **Annual** — price $79.99 (matches the paywall), add a **14-day free trial** intro offer.
  - **Monthly** — price $12.99, (intro trial optional).
- Fill each product's display name, description, and a review screenshot, and submit them **with** the build (products + binary review together).

**b) RevenueCat dashboard**
- Project settings → **Apps** → your iOS app: set the **bundle ID to
  `com.ravipulavarthy.hale`** and paste your **App Store Connect shared secret**
  (ASC → App Information → App-Specific Shared Secret).
- **Products** → import/add the two ASC product IDs.
- **Entitlements** → create/confirm one called exactly **`HALE+`** and attach both products.
- **Offerings** → on the **`current`** offering, add an **Annual** package and a
  **Monthly** package pointing at those products. (The app reads `current` →
  Annual/Monthly package types — no product IDs are hardcoded.)
- **Integrations → Webhooks** → add a webhook:
  - URL: `https://agreeable-mongoose-741.convex.site/revenuecat/webhook`
  - Authorization header value: the `REVENUECAT_WEBHOOK_SECRET` (get it via the
    command in the ✅ section above). **Must match exactly** or premium won't grant.
- (Optional) create a fresh **V2 secret key** and set `REVENUECAT_SECRET_API_KEY`
  on prod — only used to delete RC data on account deletion. The old leaked key is dead.

## 3. (Optional) analytics / push / crash — client keys
Not required for submission; add to eas.json `build.production.env` when ready:
`EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_ONESIGNAL_APP_ID`,
`EXPO_PUBLIC_SENTRY_DSN`. Server side: `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY`,
`RESEND_API_KEY`, `POSTHOG_*` via `npx convex env set --prod`.

## 4. Build, verify, submit
```bash
npx convex deploy                       # push latest functions
eas build --profile production          # binary now has RC + Convex baked in
eas submit --profile production
```
Before submitting: run a **sandbox purchase** on a TestFlight build and confirm
HALE+ unlocks and stays unlocked (proves the webhook + entitlement chain works),
and send Sage a couple messages to confirm it gives real, varied replies.
