#!/usr/bin/env bash
# Static-export build for GitHub Pages.
#
# GitHub Pages has no server, so the app/ directory must not contain API
# routes during the export build — Next.js would try to prerender them and
# fail on their dynamic request access. This script temporarily parks the
# API routes outside the build, runs the static export (browser-only ledger
# via NEXT_PUBLIC_STATIC=1), and always restores them afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR="src/app/api"
PARKED=".api-parked"

restore() {
  if [ -d "$PARKED" ] && [ ! -d "$API_DIR" ]; then
    mv "$PARKED" "$API_DIR"
  fi
}
trap restore EXIT

if [ -d "$API_DIR" ]; then
  mv "$API_DIR" "$PARKED"
  echo "static-build: API routes parked (no server in the Pages build)"
fi

STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 bunx next build

restore
trap - EXIT
echo "static-build: done, output in .next-static/"
