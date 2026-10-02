#!/bin/bash
# Furtli weekly collection: asks Vercel to collect a week (Umami + app database) and store it in
# weekly_metrics. Responsibility: COLLECT only. It renders nothing and never touches Notion;
# the report is scripts/weekly-local.sh. The Sunday collection itself is Vercel's cron
# (vercel.json); this is for drafts and re-runs from the command line.
#
#   scripts/weekly-collect.sh                      the running week, as a draft (Sunday's run replaces it)
#   scripts/weekly-collect.sh --week 2026-W39      a given week (also: last = the week that just ended)
#   scripts/weekly-collect.sh --dry-run            collect and show, save nothing
#   scripts/weekly-collect.sh setup                store the two secrets in the macOS Keychain
#
# The Mac's own database login stays read-only: the writing is done by the Vercel route
# /api/cron/weekly-snapshot of the project at FURTLI_COLLECT_URL
# (default: staging, https://furtli-web.vercel.app).
# Secrets: macOS Keychain, account "furtli". Environment variables of the same name win.
#   furtli-cron-secret    -> CRON_SECRET     that Vercel project's CRON_SECRET
#   furtli-vercel-bypass  -> VERCEL_BYPASS   Deployment Protection bypass token (empty if not protected)
set -euo pipefail

KC_ACCOUNT="furtli"
KC_CRON="furtli-cron-secret"
KC_BYPASS="furtli-vercel-bypass"
COLLECT_URL="${FURTLI_COLLECT_URL:-https://furtli-web.vercel.app}"

fail() { echo "FAILED: $*" >&2; exit 1; }
keychain_get() { security find-generic-password -a "$KC_ACCOUNT" -s "$1" -w 2>/dev/null; }

cmd_collect() {
  local week="current" dry=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --week) [[ $# -ge 2 ]] || fail "--week needs a value, e.g. 2026-W40, current or last"; week="$2"; shift 2 ;;
      --dry-run) dry=1; shift ;;
      *) fail "Unknown option '$1'. See the header of $0." ;;
    esac
  done
  [[ "$week" =~ ^(current|last|[0-9]{4}-W[0-9]{2})$ ]] || fail "Week must look like 2026-W40, current or last."
  local cron="${CRON_SECRET:-}" bypass="${VERCEL_BYPASS:-}"
  [[ -n "$cron" ]] || cron="$(keychain_get "$KC_CRON")" || fail "No CRON_SECRET: run 'scripts/weekly-collect.sh setup'."
  [[ -n "$bypass" ]] || bypass="$(keychain_get "$KC_BYPASS" || true)"

  local url="$COLLECT_URL/api/cron/weekly-snapshot?week=$week"
  [[ $dry -eq 1 ]] && url+="&dryRun=1"
  echo "Collecting $week via $COLLECT_URL$([[ $dry -eq 1 ]] && echo ' (dry run, nothing saved)')..."
  # Headers go in on stdin, so the secrets never appear in the process list.
  local body code
  body="$(mktemp)"
  code="$({
    printf 'Authorization: Bearer %s\n' "$cron"
    if [[ -n "$bypass" ]]; then printf 'x-vercel-protection-bypass: %s\n' "$bypass"; fi
  } | curl -sS -o "$body" -w '%{http_code}' -H @- --max-time 150 "$url")" || code="000"
  if command -v jq >/dev/null 2>&1 && jq -e . "$body" >/dev/null 2>&1; then
    jq 'if has("week") then {week, firstDay, lastDay, saved, errors, summary} else . end' "$body" 2>/dev/null || cat "$body"
  else
    head -c 600 "$body"; echo
  fi
  rm -f "$body"
  case "$code" in
    200) echo "OK. Report it with: scripts/weekly-local.sh --week $week" ;;
    207) echo "Saved with gaps (see errors above)." ;;
    *) fail "Collection failed (HTTP $code)." ;;
  esac
}

cmd_setup() {
  [[ "$(uname)" == "Darwin" ]] || fail "setup uses the macOS Keychain; run it on the Mac."
  echo "For collecting via $COLLECT_URL. Values are typed, never shown."
  echo
  echo "1/2  CRON_SECRET of that Vercel project"
  security add-generic-password -U -a "$KC_ACCOUNT" -s "$KC_CRON" -l "Furtli: Vercel CRON_SECRET" -w
  echo
  echo "2/2  Deployment Protection bypass token (Vercel → Settings → Deployment Protection →"
  echo "     Protection Bypass for Automation). Leave empty if the URL isn't protected."
  security add-generic-password -U -a "$KC_ACCOUNT" -s "$KC_BYPASS" -l "Furtli: Vercel protection bypass" -w
  echo
  echo "Saved. Try: scripts/weekly-collect.sh --dry-run"
}

case "${1:-}" in
  setup) cmd_setup ;;
  -h | --help) sed -n '2,19p' "$0" ;;
  *) cmd_collect "$@" ;;
esac
