#!/bin/bash
#
# go-live.sh — stand up HALE's production backend in one command.
#
#   Run this in Terminal.app (NOT inside Claude — it needs your browser):
#       cd /Users/vinaypulavarthy/hale && bash scripts/go-live.sh
#
# It walks the four steps in order. You only interact twice: click "Authorize"
# in the browser it opens, and paste your API keys when prompted. Everything
# else is automatic. Safe to re-run — each step is idempotent.
#
set -e
cd "$(dirname "$0")/.."

echo "════════════════════════════════════════════════════════════"
echo " HALE → production backend setup"
echo "════════════════════════════════════════════════════════════"
echo

echo "STEP 1/4 — Log in to Convex (a browser window opens; click Authorize)"
if npx convex whoami >/dev/null 2>&1; then
  echo "  already logged in ✓"
else
  npx convex login --device-name "hale-prod"
fi
echo

echo "STEP 2/4 — Deploy the backend to the cloud"
echo "  (first time: when asked, choose 'create a new project' and name it 'hale')"
npx convex deploy
echo

echo "STEP 3/4 — Configure anonymous sign-in keys (JWT_PRIVATE_KEY + JWKS)"
npx @convex-dev/auth --prod || npx @convex-dev/auth
echo

echo "STEP 4/4 — Set API secrets + wire the app build to the cloud URL"
bash scripts/setup-prod-backend.sh
echo

echo "════════════════════════════════════════════════════════════"
echo " Backend is live. Commit the eas.json change, then build:"
echo "   git add eas.json && git commit -m 'prod: point build at cloud Convex'"
echo "   git push"
echo "   eas build --profile production && eas submit --profile production"
echo "════════════════════════════════════════════════════════════"
