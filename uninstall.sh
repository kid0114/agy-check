#!/usr/bin/env bash
# Remove agy-hud-plus (and legacy agy-hud) from this machine.
# 1. Run runtime/uninstall.js (clears settings.statusLine, removes timer hook, runtime dir, tmp tokens)
# 2. Run `agy plugin uninstall agy-hud-plus` (removes the staged plugin dir)
set -uo pipefail

RUNTIME_UNINSTALL="$HOME/.gemini/antigravity-cli/agy-hud-runtime/runtime/uninstall.js"

if command -v node >/dev/null 2>&1 && [ -f "$RUNTIME_UNINSTALL" ]; then
  node "$RUNTIME_UNINSTALL"
else
  echo "agy-hud-plus uninstall: runtime not found at $RUNTIME_UNINSTALL — skipping settings cleanup" >&2
fi

for PLUGIN_NAME in agy-hud-plus agy-hud; do
  PLUGIN_DIR="${HOME}/.gemini/config/plugins/${PLUGIN_NAME}"
  if command -v agy >/dev/null 2>&1; then
    agy plugin uninstall "$PLUGIN_NAME" 2>/dev/null || rm -rf "$PLUGIN_DIR"
  else
    rm -rf "$PLUGIN_DIR"
  fi
done

echo "agy-hud-plus uninstall complete"
