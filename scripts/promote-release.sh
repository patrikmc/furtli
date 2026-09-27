#!/usr/bin/env bash
# Promote to production: fast-forward the `release` branch to a commit that is
# already on master (default: the tip of origin/master). The push triggers
# .github/workflows/deploy.yml, which tests, migrates the production database
# and deploys furtli.ch.
#
#   pnpm release            # promote origin/master
#   pnpm release <sha>      # promote an older master commit
#
# Fast-forward only: if release has commits master doesn't (e.g. a hotfix made
# directly on release), the push is refused. Merge release back into master first.
set -euo pipefail

git fetch --quiet origin
commit=$(git rev-parse --verify "${1:-origin/master}^{commit}")

if ! git merge-base --is-ancestor "$commit" origin/master; then
  echo "✗ $commit is not on origin/master. Push it to master and let staging deploy first." >&2
  exit 1
fi

# Warn if staging hasn't deployed this commit successfully (needs the gh CLI).
if command -v gh >/dev/null 2>&1; then
  conclusion=$(gh run list --workflow deploy.yml --branch master --commit "$commit" \
    --json conclusion --jq '.[0].conclusion' 2>/dev/null || true)
  if [[ "$conclusion" != "success" ]]; then
    echo "⚠ Staging deploy for this commit: ${conclusion:-not found}."
    read -r -p "Promote anyway? [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
  fi
fi

echo "Promoting to production:"
git log -1 --format='  %h %s (%an, %ar)' "$commit"
if git rev-parse --verify --quiet origin/release >/dev/null; then
  echo "Changes since the last release:"
  git log --format='  %h %s' "origin/release..$commit" | head -30
fi
read -r -p "Push to release and deploy furtli.ch? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1

git push origin "$commit:refs/heads/release"
echo "✓ Pushed. Follow the deploy in GitHub → Actions → Deploy."
