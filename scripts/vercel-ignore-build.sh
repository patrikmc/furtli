#!/usr/bin/env bash
# Vercel "Ignored Build Step" for both projects (Settings → Build and Deployment
# → Ignored Build Step → Custom: `bash ../../scripts/vercel-ignore-build.sh`).
# Exit 0 = skip this build, exit 1 = build it.
#
#   production project (APP_ENV=production): builds `release` only, no previews
#   staging project    (APP_ENV=staging):    builds everything except `release`
#                                            (master + PR previews)
branch="${VERCEL_GIT_COMMIT_REF:-}"

case "${APP_ENV:-}" in
  production)
    if [[ "$branch" == "release" ]]; then echo "▶ build release"; exit 1; fi
    echo "⏭ production project: skipping '$branch' (only release deploys here)"; exit 0 ;;
  staging)
    if [[ "$branch" == "release" ]]; then echo "⏭ staging project: skipping release"; exit 0; fi
    echo "▶ build $branch"; exit 1 ;;
  *)
    echo "▶ APP_ENV not set: building"; exit 1 ;;
esac
