#!/usr/bin/env bash
# Deploy the static build of Udhaar Khata to GitHub Pages (gh-pages branch).
#
# GitHub Pages serves https://aaron-samuvel.github.io/udhaar-khata/ from the
# gh-pages branch (deploy-from-branch mode). This script builds the static
# export and force-pushes it as the gh-pages branch.
#
# Usage:
#   GH_TOKEN=<PAT with Contents:write> bash scripts/deploy-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${GH_TOKEN:?Set GH_TOKEN to a GitHub token with Contents:read/write for the repo}"

REPO_SLUG="aaron-samuvel/udhaar-khata"

# 1. Build the static export (parks API routes, restores them afterwards).
bun run build:static

# 2. Stage the artifact in a temp repo and push it as gh-pages.
DEPLOY_DIR="$(mktemp -d)"
cp -r .next-static/. "$DEPLOY_DIR"/
cd "$DEPLOY_DIR"
git init -q -b gh-pages
git add -A
git -c user.name="udhaar-khata-deploy" -c user.email="deploy@udhaar-khata.local" \
  commit -q -m "deploy: static site build $(date -u '+%Y-%m-%d %H:%M UTC')"
git remote add origin "https://github.com/${REPO_SLUG}.git"
git -c credential.helper='!f() { echo "username=x-access-token"; echo "password='"${GH_TOKEN}"'"; }; f' \
  push --force origin gh-pages
cd - > /dev/null
rm -rf "$DEPLOY_DIR"
echo "deploy: gh-pages branch updated"
