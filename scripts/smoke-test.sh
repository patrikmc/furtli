#!/usr/bin/env bash
# Post-deploy smoke test (called by .github/workflows/deploy.yml).
#
#   DEPLOYMENT_URL   the unique URL `vercel deploy` printed (this exact build)
#   SITE_URL         the environment's address (https://furtli-web.vercel.app / https://furtli.ch)
#   EXPECT_PROTECTED "true" = the site must refuse visitors without the password
#   SITE_PASSWORD    the app's password gate (proxy.ts), sent as x-furtli-access
#   VERCEL_AUTOMATION_BYPASS_SECRET  optional: gets past Vercel Authentication
#                    (always on for the unique deployment URL, and on the site
#                    address too if it's covered by Deployment Protection)
#
# Checks:
#   1. the new build serves the map page and /api/stations from the database
#   2. the site refuses visitors without the password (or is public once EXPECT_PROTECTED=false)
#   3. the site serves the app with the password
set -euo pipefail

: "${DEPLOYMENT_URL:?DEPLOYMENT_URL is required}"
: "${SITE_URL:?SITE_URL is required (GitHub environment variable)}"
EXPECT_PROTECTED="${EXPECT_PROTECTED:-true}"
BYPASS="${VERCEL_AUTOMATION_BYPASS_SECRET:-}"
PASSWORD="${SITE_PASSWORD:-}"

if [[ -z "$BYPASS" ]]; then
  echo "::error::VERCEL_AUTOMATION_BYPASS_SECRET is not set (Vercel → Settings → Deployment Protection → Protection Bypass for Automation)"
  exit 1
fi
if [[ "$EXPECT_PROTECTED" == "true" && -z "$PASSWORD" ]]; then
  echo "::error::SITE_PASSWORD is not set on this GitHub environment (same value as in Vercel)"
  exit 1
fi

fail=0
status() { curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }

# Retry a check a few times: the domain alias can take a few seconds to move.
expect() {
  local want="$1" label="$2"; shift 2
  local got=""
  for _ in 1 2 3 4 5 6; do
    got=$(status "$@" || echo "000")
    [[ "$want" == *"$got"* ]] && { echo "ok   $label → $got"; return 0; }
    sleep 5
  done
  echo "::error::$label → $got (expected $want)"
  fail=1
}

H=(-H "x-vercel-protection-bypass: $BYPASS")
[[ -n "$PASSWORD" ]] && H+=(-H "x-furtli-access: $PASSWORD")

# 1. The fresh build works.
expect "200" "build: /"             "${H[@]}" "$DEPLOYMENT_URL/"
expect "200" "build: /api/stations" "${H[@]}" "$DEPLOYMENT_URL/api/stations"
if ! curl -sS --max-time 30 "${H[@]}" "$DEPLOYMENT_URL/api/stations" | grep -q '"FeatureCollection"'; then
  echo "::error::/api/stations did not return a GeoJSON FeatureCollection"
  fail=1
fi
# The deployed app must read the database, not fall back to the seed file.
source_header=$(curl -sS -o /dev/null -D - --max-time 30 "${H[@]}" "$DEPLOYMENT_URL/api/stations" \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="x-data-source"{print $2}')
if [[ "$source_header" != "db" ]]; then
  echo "::error::/api/stations served '${source_header:-?}' data, expected 'db' (is DATABASE_URL set for this Vercel environment?)"
  fail=1
else
  echo "ok   build: stations come from the database"
fi

# 2. The site is (or is not) behind the password.
#    307 = redirect to /zugang (app gate); 401/403 = gate or Vercel Authentication.
if [[ "$EXPECT_PROTECTED" == "true" ]]; then
  expect "307 401 403" "site without password: / (must be blocked)"             "$SITE_URL/"
  expect "401 403"     "site without password: /api/stations (must be blocked)" "$SITE_URL/api/stations"
else
  expect "200" "site, public" "$SITE_URL/"
fi

# 3. The site serves the app with the password.
expect "200" "site with password: /"             "${H[@]}" "$SITE_URL/"
expect "200" "site with password: /api/stations" "${H[@]}" "$SITE_URL/api/stations"

exit $fail
