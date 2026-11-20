# agy-check

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> **Enhanced real-time statusline HUD for Antigravity CLI (`agy`)** — built on top of [`icebear0828/agy-hud`](https://github.com/icebear0828/agy-hud) (MIT) with hook-timed dual output speed (`out` + `net≈`), cumulative tool execution time (`tooltime`), accurate per-turn & session-average prompt cache hit rate (`cache ... avg ...`), and multi-account quota cache isolation.

[中文文档](./README_zh.md)

---

## Preview

![agy-check demo](./assets/demo.png)

```text
user@gmail.com │ project │ ⎇ main │ Gemini 4 Neon (XHigh) │ Google AI Ultra │ out: 68.5 (net≈24.1) tok/s │ tooltime: 3m30s
⚿ Tokens 300.8k (in: 2.5k, out: 78.1k, cache: 220.1k) │ cache 98.9% (220.1k/222.7k, avg 92.6%) │ ⛁ 200k/1M [██░░░░░░░░] 19%
1 AGENTS.md
  ─────────────────────────────────────────────────────────────────────────────────
  Google 5h   [█████░]  78% ~1h5m  │ Claude 5h   [██████] 100% ~4h43m
  Google week [█████░]  83% ~4d19h │ Claude week [██████]  98% ~5d21h
```

---

## What's Enhanced Over Upstream `agy-hud`

| Capability | Upstream `agy-hud` | `agy-check` |
|---|---|---|
| **Output speed (`out` / `net≈`)** | Total `tok/s` from coarse fallback or cost duration | Hook-timed model duration excluding tool time (`PreInvocation` / `PostToolUse` / `PostInvocation`), showing both total speed (with thinking) and visible net speed `net≈` |
| **Tool execution time (`tooltime`)** | Not available | Cumulative tool runtime across the session, automatically wired via `~/.gemini/config/hooks.json` |
| **Prompt cache hit rate (`cache`)** | Opt-in; heuristic miscounted turns where `input_tokens >= cache_read`; 0% turns could be hidden or masked by cache smoothing | Enabled by default; exact `agy` incremental denominator `input + cache_read + cache_write`, honest `0.0%` cold-cache reporting, plus whole-session cumulative `avg XX.X%` |
| **Transcript path & schema parsing** | Failed when `agy` passed legacy `~/.gemini/antigravity/brain/...` paths or top-level `PLANNER_RESPONSE` token fields | Auto-resolves UUID to `antigravity-cli/brain/<id>/.../transcript.jsonl` and parses native `input_tokens` / `cache_read_tokens` |
| **Multi-account quota isolation** | Could briefly show previous account's cached tier/quota after switching accounts | Keys quota & tier cache by active account email and triggers immediate refresh on account switch |

---

## How Every Metric Is Calculated

All metrics are derived strictly from live `agy` statusline stdin JSON, `transcript.jsonl` / `transcript_full.jsonl`, hook timestamps (`~/.gemini/antigravity-cli/speed-cache/hook-timing-<id>.json`), and Antigravity quota APIs.

### Line 1 — Identity, Speed & Tool Time

| Item | Display Example | Data Source & Exact Formula |
|---|---|---|
| **Account** | `user@gmail.com` | Resolved in priority order: live OAuth token's cached userinfo email → `~/.gemini/google_accounts.json` → `~/.gemini/oauth_creds.json` JWT payload (display-only) → OS username. Controlled by `display.showUsername`. |
| **Workspace** | `lny` | `path.basename(agyData.workspace.current_dir \|\| cwd)`. Controlled by `display.showCurrentDir`. |
| **Git Branch** | `⎇ main` | `git rev-parse --abbrev-ref HEAD` executed in workspace directory. Controlled by `display.showGitBranch`. |
| **Model** | `Gemini 4 Neon (XHigh)` | `agyData.model.display_name \|\| agyData.model.id`, abbreviated for common `Gemini` / `Claude` / `GPT-OSS` names. |
| **Plan Tier** | `Google AI Ultra` | Account tier from `loadCodeAssist` cached against the active account email (never leaks across account switches), falling back to `agyData.plan_tier \|\| 'Free'`. |
| **Total Output Speed (`out`)** | `out: 68.5 tok/s` | $$\text{out} = \frac{\Delta \text{total\_output\_tokens}}{\Delta t_{\text{model}}}$$ where $\Delta t_{\text{model}} = t_{\text{invocation}} - t_{\text{tool}}$ is measured by `invocation-timer.js` hooks (subtracting tool runtime from wall-clock invocation time). Includes thinking tokens. Readings below `500 ms` are ignored as noise and the last valid reading is held until the next response. |
| **Visible Net Speed (`net≈`)** | `(net≈24.1)` | $$\text{net} \approx \frac{\min(\Delta \text{total\_output\_tokens},\; \Delta \text{visible\_tokens})}{\Delta t_{\text{model}}}$$ Visible tokens (excluding hidden `thinking`) are estimated from `PLANNER_RESPONSE.content` and `tool_calls` in `transcript_full.jsonl` using $\text{CJK chars} \times 0.9 + \text{other chars} \times 0.26$, capped per step by `entry.output_tokens`. |
| **Tool Time (`tooltime`)** | `tooltime: 3m30s` | Accumulated across all invocations in the session. For each invocation with `PostToolUse` markers, `resolveToolWindowMs()` pairs the earliest tracked tool step's `created_at + 500ms` (midpoint compensation for 1-second floor timestamps in `transcript.jsonl`) with the latest `PostToolUse` completion timestamp, clamped to `[invocationStart, invocationEnd]`. |

### Line 2 — Tokens, Cache Hit Rate & Context Window

| Item | Display Example | Data Source & Exact Formula |
|---|---|---|
| **Token Breakdown** | `⚿ Tokens 300.8k (in: 2.5k, out: 78.1k, cache: 220.1k)` | <ul><li>`in`: current turn uncached input `current_usage.input_tokens` (falls back to `max(0, total_input_tokens - cacheTotal)` when `current_usage` is absent).</li><li>`out`: session cumulative output `context_window.total_output_tokens`.</li><li>`cache`: `cache_read_input_tokens + cache_creation_input_tokens` (omitted when `0`).</li><li>`Tokens`: `in + out + cache`.</li></ul> |
| **Per-Turn Cache Hit Rate** | `cache 98.9% (220.1k/222.7k, ...)` | $$\text{turn\_hit\_rate} = \frac{\text{cache\_read}}{\text{input\_tokens} + \text{cache\_read} + \text{cache\_creation}} \times 100\%$$ **Why input only (not output)?** Prompt / KV caching only reuses input prefixes; model outputs are freshly decoded every turn and cannot hit cache. In `agy` (verified across Gemini and Claude models), `input_tokens` is always uncached incremental input returned by the model backend, so total prompt input is strictly `input + cache_read + cache_write`. Missing `cache_read` on cold turns is treated as `0`, displaying `0.0%` honestly. |
| **Session Average Cache Hit Rate (`avg`)** | `(..., avg 92.6%)` | $$\text{avg\_hit\_rate} = \frac{\sum \text{cache\_read\_tokens}}{\sum (\text{input\_tokens} + \text{cache\_read\_tokens} + \text{cache\_creation\_tokens})} \times 100\%$$ Summed over every `PLANNER_RESPONSE` entry in the session's `transcript.jsonl` (reflects cold starts, model switches, and TTL expirations). Shown once the session has $\ge 2$ turns; can be disabled via `display.showSessionCacheHitRate: false`. |
| **Cache Color Temperature** | Green / Yellow / Gray | Default thresholds (`display.cacheHitThresholds`): **≥ 80%** bold green, **50%–79.9%** yellow, **0.1%–49.9%** dim yellow, **0%** dim gray. |
| **Context Window** | `⛁ 200k/1M [██░░░░░░░░] 19%` | Direct values from `context_window.total_input_tokens / context_window.context_window_size` and `context_window.used_percentage`. Progress bar turns yellow above `thresholds.warning` (`70%`) and red above `thresholds.critical` (`90%`). |

### Line 3 — Workspace Metadata (Non-Zero Only)

Scans the current workspace for memory files (`AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `MEMORY.md`), rule markdown files (`.gemini/rules`, `.claude/rules`, `.cursor/rules`, `.github/rules`), configured MCP servers, and active `.git/hooks` scripts. Omitted completely when all counts are zero.

### Quota Table — Provider 5h & Weekly Windows

| Item | Display Example | Data Source & Exact Formula |
|---|---|---|
| **Remaining Quota %** | `Google 5h [█████░] 78%` | Live `agy` stdin `quota` map (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`) merged with cached Antigravity cloud quota (`agy-hud-quota-cache.json`). Percentage uses `floor(remainingFraction * 100)` capped at `99%` whenever `remainingFraction < 1` so partially used windows never appear stuck at `100%`. |
| **Reset Countdown** | `~1h5m` / `~4d19h` | `max(0, resetTime - now)`, formatted compactly as `Xd` (≥ 10d), `XdYh`, `Xh` (≥ 10h), `XhYm`, `Ym`, or `now`. |

---

## Installation & Usage

Run from a normal shell (**not** inside an active `agy` session, since `agy` may flush in-memory `settings.json` on exit).

### One-Command Install

**macOS / Linux:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/install.sh)
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/install.ps1 | iex
```

**Windows CMD:**
```cmd
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/install.ps1 | iex"
```

### Install From a Local Clone

```bash
git clone https://github.com/kid0114/agy-check.git
cd agy-check
agy plugin install .
node scripts/bootstrap.js
```

### What the Installer Sets Up

1. Installs the plugin (`plugin.json` + `/hud-config` skill) via `agy plugin install`.
2. Copies the self-contained runtime to `~/.gemini/antigravity-cli/agy-hud-runtime/`.
3. Writes `statusLine.command` into `~/.gemini/antigravity-cli/settings.json`.
4. Registers `agy-hud-invocation-timer` (`PreInvocation`, `PostToolUse`, `PostInvocation`) into `~/.gemini/config/hooks.json` (preserving any existing hooks) so `out` / `net≈` / `tooltime` work automatically.

Re-running the installer is idempotent and safely repairs or updates your setup. Open a new `agy` session to see the HUD.

---

## Configuration

Global config path: `~/.gemini/antigravity-cli/agy-hud-runtime/runtime/agy-hud.config.json`
Project-local override (optional): `./agy-hud.config.json`

Interactive config wizard:
```bash
node ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-hud.js --config
```

Or edit `agy-hud.config.json` directly:

```json
{
  "theme": {
    "primary": "green",
    "secondary": "gray",
    "warning": "yellow",
    "critical": "red"
  },
  "display": {
    "showTokenBar": true,
    "showBreadcrumbs": true,
    "showGitBranch": true,
    "showCurrentDir": true,
    "breadcrumbCount": 3,
    "useNerdFonts": false,
    "showUsername": true,
    "showSpeed": true,
    "showToolTime": true,
    "showTurnCacheHitRate": true,
    "showSessionCacheHitRate": true,
    "cacheSmoothing": false,
    "quotaStyle": "table",
    "showCost": false,
    "showDailyCost": false,
    "showWeeklyCost": false
  },
  "thresholds": {
    "warning": 0.7,
    "critical": 0.9
  },
  "language": "auto"
}
```

Key `display` options:

| Option | Default | Description |
|---|---|---|
| `showSpeed` | `true` | Show `out: X.X (net≈Y.Y) tok/s` on line 1 |
| `showToolTime` | `true` | Show cumulative `tooltime: XmYs` on line 1 |
| `showTurnCacheHitRate` | `true` | Show `cache XX.X% (read/total)` badge on line 2 |
| `showSessionCacheHitRate` | `true` | Append session cumulative `, avg YY.Y%` to the cache badge (`turns >= 2`) |
| `cacheHitThresholds` | `{ "excellent": 80, "partial": 50 }` | Customize cache badge color breakpoints |
| `cacheSmoothing` | `false` | Legacy opt-in smoothing for older CLI versions; keep `false` to see honest `0.0%` cache misses |
| `quotaStyle` | `"table"` | `"table"` (Google/Claude 5h + week), `"compact"` (single-line mini bars), or `"models"` (per-model table) |
| `showUsername` | `true` | Show active account email / OS username |
| `useNerdFonts` | `false` | Use Nerd Font glyphs instead of standard Unicode symbols |
| `showCost` / `showDailyCost` / `showWeeklyCost` | `false` | Show estimated session / daily / weekly USD cost |

---

## Verification & Troubleshooting

```bash
# Check statusLine and timing hooks configuration
cat ~/.gemini/antigravity-cli/settings.json | grep -A3 statusLine
cat ~/.gemini/config/hooks.json

# Test HUD rendering directly
node ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-hud.js < /dev/null

# Run unit tests (from repo root)
npm test
```

---

## Uninstall

**macOS / Linux:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-check/main/uninstall.sh)
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/kid0114/agy-check/main/uninstall.ps1 | iex
```

This cleanly removes `statusLine` from `settings.json`, removes `agy-hud-invocation-timer` from `hooks.json` (leaving other hooks untouched), deletes `agy-hud-runtime` and caches, and uninstalls the plugin.

---

## License & Attribution

Licensed under the [MIT License](./LICENSE).

Originally based on [`icebear0828/agy-hud`](https://github.com/icebear0828/agy-hud) (MIT). All upstream credits belong to its authors.
