#!/usr/bin/env bash
# One-shot bootstrap for agy-hud-kk. Idempotent — re-run anytime to repair settings.json & hooks.json.
# Downloads runtime to ~/.gemini/antigravity-cli/agy-hud-runtime/ and configures statusLine + timer hooks.
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-hud-kk/main/scripts/bootstrap.sh)
#
# Env:
#   AGY_HUD_REPO_RAW  override the raw GitHub base URL (for forks/mirrors)
set -euo pipefail

REPO_RAW="${AGY_HUD_REPO_RAW:-https://raw.githubusercontent.com/kid0114/agy-hud-kk/main}"

if ! command -v node >/dev/null 2>&1; then
  echo "agy-hud-kk bootstrap: node is required but not found in PATH" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "agy-hud-kk bootstrap: curl is required but not found in PATH" >&2
  exit 1
fi

AGY_HUD_REPO_RAW="$REPO_RAW" exec node <(curl -fsSL "$REPO_RAW/scripts/bootstrap.js")
