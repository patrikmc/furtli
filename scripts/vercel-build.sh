#!/usr/bin/env bash
# Vercel build entrypoint (see apps/web/vercel.json).
# Production: build only. Migrations for the long-lived DB run from GitHub Actions.
# Preview: if MIGRATE_ON_PREVIEW=1 (Preview scope only), migrate the preview's
# throwaway Neon branch first so PRs with new migrations get the new schema.
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "preview" && "${MIGRATE_ON_PREVIEW:-}" == "1" ]]; then
  echo "▶ Preview deployment: applying migrations to the preview Neon branch"
  pnpm --filter db migrate
fi

pnpm --filter web build