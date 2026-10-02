#!/bin/bash
# Furtli weekly report: the local half of the weekly pipeline (runs on the Mac, never on Vercel).
# Vercel collects the week into Neon every Sunday; this script reads it (read-only),
# saves a Markdown copy and creates the week's page in the Notion Reviews database.
#
#   scripts/weekly-local.sh                     the week that just ended: save Markdown + export to Notion
#                                               (fails clearly if Vercel hasn't collected it yet)
#   scripts/weekly-local.sh --week 2026-W40     a given week
#   scripts/weekly-local.sh --no-notion         save the Markdown copy only
#   scripts/weekly-local.sh setup               store the two secrets in the macOS Keychain
#   scripts/weekly-local.sh check               show the setup and print the report in the terminal
#   scripts/weekly-local.sh install-schedule [HH:MM]   run every Sunday, default 07:00 local time, so the
#                                               report is ready for the Sunday review (launchd; the schedule
#                                               file goes to ~/Library/LaunchAgents, where launchd requires it)
#   scripts/weekly-local.sh uninstall-schedule
#
# Secrets: macOS Keychain, account "furtli". Environment variables of the same name win (e.g. from n8n).
#   furtli-report-database-url -> DATABASE_URL   read-only "furtli_report" login (docs/DEPLOYMENT.md §7)
#   furtli-notion-token        -> NOTION_TOKEN   Notion integration with access to Reviews only
# Output stays inside the repository: reports in reports/weekly/<week>.md, logs in
# reports/weekly/logs/ (git-ignored). Nothing is written elsewhere in your home folder;
# the only file outside the repo is the launchd schedule itself (install-schedule).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORTS_DIR="$REPO/reports/weekly"
LOG_DIR="$REPORTS_DIR/logs"
LOG_FILE="$LOG_DIR/weekly-local.log"
KC_ACCOUNT="furtli"
KC_DB="furtli-report-database-url"
KC_NOTION="furtli-notion-token"
LABEL="ch.furtli.weekly-report"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# launchd starts jobs with a minimal PATH: add the usual Node / pnpm locations.
export PATH="$HOME/Library/pnpm:$HOME/.local/share/pnpm:$HOME/.volta/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  set +u
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null
  set -u
fi
export NO_COLOR=1

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

notify() { # title, message (macOS notification; ignored elsewhere)
  local msg="${2//\"/\'}"
  osascript -e "display notification \"${msg:0:200}\" with title \"$1\"" >/dev/null 2>&1 || true
}

fail() {
  log "FAILED: $*"
  notify "Furtli weekly report failed" "$*"
  exit 1
}

keychain_get() { security find-generic-password -a "$KC_ACCOUNT" -s "$1" -w 2>/dev/null; }
keychain_has() { security find-generic-password -a "$KC_ACCOUNT" -s "$1" >/dev/null 2>&1; }

load_secrets() { # $1 = "notion" when the Notion token is needed too
  if [[ -z "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="$(keychain_get "$KC_DB")" || fail "No database login: run 'scripts/weekly-local.sh setup' (Keychain item $KC_DB)."
  fi
  export DATABASE_URL
  if [[ "${1:-}" == "notion" && -z "${NOTION_TOKEN:-}" ]]; then
    NOTION_TOKEN="$(keychain_get "$KC_NOTION")" || fail "No Notion token: run 'scripts/weekly-local.sh setup' (Keychain item $KC_NOTION)."
  fi
  [[ -n "${NOTION_TOKEN:-}" ]] && export NOTION_TOKEN
  return 0
}

require_tools() {
  command -v pnpm >/dev/null 2>&1 || fail "pnpm not found on PATH ($PATH)."
  [[ -d "$REPO/apps/web/node_modules" ]] || fail "Dependencies missing: run 'pnpm install' in $REPO."
}

report() { # runs pnpm weekly-report in apps/web with the given arguments
  (cd "$REPO/apps/web" && pnpm --silent weekly-report "$@")
}

cmd_run() {
  local week_args=(--last-complete) notion=1
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --week) [[ $# -ge 2 ]] || fail "--week needs a value, e.g. 2026-W40"; week_args=(--week "$2"); shift 2 ;;
      --no-notion) notion=0; shift ;;
      *) fail "Unknown option '$1'. See the header of $0." ;;
    esac
  done

  mkdir -p "$LOG_DIR"
  exec > >(tee -a "$LOG_FILE") 2>&1
  log "Start (reports in $REPORTS_DIR)"

  # One run at a time (a manual run while the schedule fires, for example).
  # LOCK_DIR is global: the EXIT trap runs after this function has returned.
  LOCK_DIR="$LOG_DIR/.lock"
  mkdir "$LOCK_DIR" 2>/dev/null || fail "Another run is in progress (remove $LOCK_DIR if it is stale)."
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

  require_tools
  if [[ $notion -eq 1 ]]; then load_secrets notion; else load_secrets; fi

  local args=("${week_args[@]+"${week_args[@]}"}" --out-dir "$REPORTS_DIR")
  [[ $notion -eq 1 ]] && args+=(--notion)

  local out
  if out="$(report "${args[@]}" 2>&1)"; then
    printf '%s\n' "$out"
    log "Done"
    notify "Furtli weekly report" "$(printf '%s' "$out" | tail -n 1)"
  else
    printf '%s\n' "$out"
    # The report script prints the reason on a line starting with "Error:" (hint on the next line).
    local reason
    reason="$(printf '%s\n' "$out" | grep -m 1 '^Error:' | sed 's/^Error: //' || true)"
    [[ -n "$reason" ]] || reason="$(printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | grep -v 'ELIFECYCLE' | tail -n 1)"
    fail "$reason"
  fi
}

cmd_setup() {
  [[ "$(uname)" == "Darwin" ]] || fail "setup uses the macOS Keychain; run it on the Mac."
  echo "Stores the two secrets in your login Keychain (account '$KC_ACCOUNT'). Values are typed, never shown."
  echo
  echo "1/2  Read-only database login (furtli_report), e.g."
  echo "     postgresql://furtli_report:<password>@<neon-host>/neondb?sslmode=require"
  security add-generic-password -U -a "$KC_ACCOUNT" -s "$KC_DB" -l "Furtli weekly report: database (read-only)" -w
  echo
  echo "2/2  Notion integration secret (starts with ntn_)"
  security add-generic-password -U -a "$KC_ACCOUNT" -s "$KC_NOTION" -l "Furtli weekly report: Notion token" -w
  echo
  echo "Saved. Next: scripts/weekly-local.sh check"
}

cmd_check() {
  local ok=0
  echo "Repository:      $REPO"
  echo "Reports folder:  $REPORTS_DIR"
  echo "pnpm / node:     $(command -v pnpm || echo 'NOT FOUND') / $(node -v 2>/dev/null || echo 'NOT FOUND')"
  if [[ -n "${DATABASE_URL:-}" ]]; then echo "Database login:  from environment"
  elif keychain_has "$KC_DB"; then echo "Database login:  Keychain ($KC_DB)"
  else echo "Database login:  MISSING (run setup)"; ok=1; fi
  if [[ -n "${NOTION_TOKEN:-}" ]]; then echo "Notion token:    from environment"
  elif keychain_has "$KC_NOTION"; then echo "Notion token:    Keychain ($KC_NOTION)"
  else echo "Notion token:    MISSING (run setup)"; ok=1; fi
  if [[ -f "$PLIST" ]]; then echo "Schedule:        installed (Sundays $(scheduled_time), $PLIST)"
  else echo "Schedule:        not installed (install-schedule)"; fi
  [[ $ok -eq 0 ]] || exit 1

  require_tools
  load_secrets notion
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' https://api.notion.com/v1/users/me \
    -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2025-09-03" || echo 000)"
  if [[ "$code" == "200" ]]; then echo "Notion token:    accepted by Notion"
  else echo "Notion token:    REJECTED (HTTP $code)"; ok=1; fi
  echo
  echo "Latest stored week (read with the read-only login):"
  echo
  report || ok=1
  return $ok
}

scheduled_time() { # HH:MM from the installed plist
  python3 - "$PLIST" <<'PY' 2>/dev/null || echo "?"
import plistlib, sys
c = plistlib.load(open(sys.argv[1], "rb"))["StartCalendarInterval"]
print(f"{c['Hour']:02d}:{c['Minute']:02d}")
PY
}

cmd_install_schedule() {
  [[ "$(uname)" == "Darwin" ]] || fail "The schedule uses launchd; run this on the Mac."
  local at="${1:-07:00}"
  [[ "$at" =~ ^([01][0-9]|2[0-3]):([0-5][0-9])$ ]] || fail "Time must be HH:MM (24 h), e.g. 07:00."
  local hour=$((10#${BASH_REMATCH[1]})) minute=$((10#${BASH_REMATCH[2]}))
  # Vercel collects between 03:00 and 04:00 UTC (05:00-06:00 in summer): stay after that.
  if (( hour < 7 )); then echo "Note: before 07:00 the Sunday collection on Vercel may not be done yet (it runs 05:00-06:00 in summer)."; fi
  mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/weekly-local.sh</string>
  </array>
  <!-- Sundays $at local time, after Vercel's collection. If the Mac is asleep then, launchd runs it on wake (not when switched off). -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/launchd.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/launchd.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Installed: $PLIST (Sundays $at)."
  echo "Test it now:  launchctl kickstart -p gui/$(id -u)/$LABEL   (then see $LOG_FILE)"
  echo "The first run may ask to allow Keychain access: choose 'Always Allow'."
}

cmd_uninstall_schedule() {
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  echo "Removed the schedule ($LABEL)."
}

case "${1:-}" in
  setup) cmd_setup ;;
  check) cmd_check ;;
  install-schedule) cmd_install_schedule "${2:-}" ;;
  uninstall-schedule) cmd_uninstall_schedule ;;
  -h | --help) sed -n '2,20p' "$0" ;;
  *) cmd_run "$@" ;;
esac
