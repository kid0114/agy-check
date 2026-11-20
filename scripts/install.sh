#!/usr/bin/env bash
# One-command installer for agy-hud-plus. Does:
#   1. agy plugin install (or upgrade) https://github.com/kid0114/agy-hud-plus.git
#   2. bootstrap runtime + configure settings.json statusLine + hooks.json timer hooks
#
# Run from a normal shell — NOT from inside an active `agy` session
# (agy rewrites settings.json from in-memory state on exit).
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-hud-plus/main/scripts/install.sh)
#
# Env:
#   AGY_HUD_REPO_RAW    override raw GitHub base URL (forks / mirrors)
#   AGY_HUD_REPO_URL    override git URL for `agy plugin install`
set -euo pipefail

REPO_RAW="${AGY_HUD_REPO_RAW:-https://raw.githubusercontent.com/kid0114/agy-hud-plus/main}"
REPO_URL="${AGY_HUD_REPO_URL:-https://github.com/kid0114/agy-hud-plus.git}"

if ! command -v agy >/dev/null 2>&1; then
  echo "agy-hud-plus: agy CLI not on PATH. Install it first:" >&2
  echo "  curl -fsSL https://antigravity.google/cli/install.sh | bash" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "agy-hud-plus: node is required but not on PATH." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "agy-hud-plus: curl is required but not on PATH." >&2
  exit 1
fi

# Step 1: stage the plugin. Uninstall any previous agy-hud / agy-hud-plus install cleanly.
echo "==> Removing any existing agy-hud / agy-hud-plus plugin install..."
agy plugin uninstall agy-hud-plus >/dev/null 2>&1 || true
agy plugin uninstall agy-hud >/dev/null 2>&1 || true

echo "==> Installing plugin from $REPO_URL..."
agy plugin install "$REPO_URL"

# Step 2: download runtime + configure statusLine + register invocation timer hooks
echo
echo "==> Bootstrapping runtime + statusLine + timing hooks..."
AGY_HUD_REPO_RAW="$REPO_RAW" node <(curl -fsSL "$REPO_RAW/scripts/bootstrap.js")

cat <<DONE

==> agy-hud-plus installed.
    Open a new agy session in your terminal to see the HUD.
    Repair or update anytime by re-running this script.
DONE
