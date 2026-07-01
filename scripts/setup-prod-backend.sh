#!/bin/bash
#
# setup-prod-backend.sh — one-time production backend setup for HALE.
#
# The app has only ever run on a LOCAL Convex dev backend, which a real phone
# (TestFlight/App Store) cannot reach — so onboarding died at the first backend
# call (right after the name). This script stands up the cloud backend.
#
# Run the interactive Convex steps FIRST (they need a browser + your account):
#     npx convex login          # sign in / sign up to Convex cloud
#     npx convex deploy         # first run: creates the cloud project + prints the URL
#     npx @convex-dev/auth --prod   # generates + sets JWT_PRIVATE_KEY + JWKS (anon sign-in)
#
# THEN run this script. It sets your API-key secrets on the prod deployment and
# writes the cloud URL into eas.json so the next production build points at it.
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== HALE production backend setup =="
echo

# 0. Must be logged into Convex cloud (not the anonymous local deployment).
if ! npx convex whoami >/dev/null 2>&1; then
  echo "✗ Not logged into Convex cloud. Run 'npx convex login' then 'npx convex deploy' first."
  exit 1
fi

# 1. The cloud URL that 'npx convex deploy' printed (looks like https://<name>.convex.cloud)
read -r -p "Paste your prod Convex URL (https://<name>.convex.cloud): " CONVEX_URL
CONVEX_URL="${CONVEX_URL%/}"
if [[ ! "$CONVEX_URL" =~ ^https://[a-z0-9-]+\.convex\.cloud$ ]]; then
  echo "✗ That doesn't look like a https://<name>.convex.cloud URL. Aborting."; exit 1
fi
NAME="$(echo "$CONVEX_URL" | sed -E 's#https://([a-z0-9-]+)\.convex\.cloud#\1#')"
SITE_URL="https://${NAME}.convex.site"

# 2. Wire eas.json so the production + preview builds compile with the cloud URL.
#    (Replaces the REPLACE_ME placeholders in-place.)
python3 - "$CONVEX_URL" "$SITE_URL" <<'PY'
import json, sys
url, site = sys.argv[1], sys.argv[2]
p = 'eas.json'
d = json.load(open(p))
for prof in ('preview', 'production'):
    env = d['build'][prof].setdefault('env', {})
    env['EXPO_PUBLIC_CONVEX_URL'] = url
    env['EXPO_PUBLIC_CONVEX_SITE_URL'] = site
json.dump(d, open(p, 'w'), indent=2); open(p, 'a').write('\n')
print(f"  eas.json -> {url}")
PY
echo "✓ eas.json wired to $CONVEX_URL"
echo

# 3. Set backend secrets on the PROD deployment. Blank = skip (that feature
#    degrades gracefully; onboarding still works). REVENUECAT_SECRET_API_KEY
#    must be a NEW key — the old one was leaked and is dead.
echo "Enter each secret (press Enter to skip). Input is hidden."
SECRETS=(
  GROQ_API_KEY
  GOOGLE_GENERATIVE_AI_API_KEY
  ANTHROPIC_API_KEY
  RESEND_API_KEY
  ONESIGNAL_APP_ID
  ONESIGNAL_REST_API_KEY
  POSTHOG_HOST
  POSTHOG_PROJECT_ID
  POSTHOG_PERSONAL_API_KEY
  REVENUECAT_SECRET_API_KEY
  REVENUECAT_WEBHOOK_SECRET
  MODERATION_ALERT_EMAIL
)
for key in "${SECRETS[@]}"; do
  read -r -s -p "  $key: " val; echo
  if [[ -n "$val" ]]; then
    npx convex env set --prod -- "$key" "$val" >/dev/null && echo "    ✓ set $key"
  else
    echo "    – skipped $key"
  fi
done

echo
echo "== Done. Verify with: npx convex env list --prod =="
echo "Then build + submit:"
echo "    npx convex deploy               # push latest functions"
echo "    eas build --profile production  # binary now points at $CONVEX_URL"
echo "    eas submit --profile production"
