# agy-check

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Monitor and manage every Antigravity CLI (`agy`) session across all your devices — desktop, phone, tablet, LAN/TUN, or remote server.** Stay synced live on cache hit rate, output speed, tool time, context use, quota, and estimated cost, and rename, archive, or bulk-delete sessions from whichever screen is in front of you.

[中文文档](./README_zh.md)

![agy-check desktop dashboard](./assets/panel-overview.png)

<p align="center">
  <img src="./assets/phone-overview.png" alt="Overview on a phone" width="230">
  <img src="./assets/phone-sessions.png" alt="Session cards on a phone" width="230">
  <img src="./assets/phone-detail.png" alt="Session detail on a phone" width="230">
</p>

<sub>Desktop, tablet, and phone views stay synced live over Server-Sent Events. All screenshots use synthetic demo data.</sub>

---

## Why agy-check

- **Multi-device & remote server live sync:** Watch and control every `agy` session from terminal HUD, desktop browser, phone/tablet (PWA, 6-digit pairing, 30-day sign-in), LAN, TUN overlay (`Tailscale` / `ZeroTier` / `WireGuard`), or headless server (`--lan --networks <cidr>` or SSH tunnel).
- **Manage sessions anywhere:** Search, rename (persisted to `agy`'s source of truth), archive/unarchive, and **Select All** bulk archive or safe permanent delete (with running-window check).
- **Multi-account & cache visibility:** 5h/weekly quota across accounts, stale `unsynced` window warnings, range-based API cost estimates, and automatic cache-miss diagnosis.
- **Zero-effort, local-first:** Zero runtime deps, zero-token `/check` inside `agy`, no telemetry, `127.0.0.1`-only until you enable `--lan`.

| Where you want to view | Command | Notes |
|---|---|---|
| **Local desktop** | `/check` (or `agy-check panel`) | Opens `http://127.0.0.1:18721` |
| **Phone / Tablet (same LAN)** | `/check lan` | Prints LAN URL + 6-digit pairing code (30-day sign-in, PWA) |
| **Remote / Headless server (TUN / LAN)** | `agy-check panel --daemon --lan --networks 10.0.0.0/24` | Access from laptop & phone over TUN overlay (Tailscale/ZeroTier/WireGuard) or Linux server LAN |
| **Remote server (SSH tunnel)** | `ssh -L 18721:127.0.0.1:18721 user@server` | Keeps server `127.0.0.1`-only; open `http://127.0.0.1:18721` locally |
| **Terminal / CLI** | Bottom HUD, `/check ls`, `agy-check ls` | Live speed, tool time, cache hit, quota, and plain-text tables |

---

## Multi-device and remote server setup

No cloud account or third-party relay required. Pick the setup that matches where `agy` runs:

### 1. Local computer only (default)

Inside `agy`, run `/check` (zero tokens; intercepted by a hook before any model call). It starts or reuses the background dashboard at `http://127.0.0.1:18721` and opens your browser.

### 2. Phone, tablet, or second laptop on the same LAN

Inside `agy`, type `/check lan` (or `agy-check panel --daemon --lan` in a shell). It prints reachable LAN URLs (e.g. `http://192.168.1.20:18721/`) and a 6-digit pairing code:

1. Open the URL on your phone, tablet, or second computer and enter the 6-digit code (valid 10 minutes, one use, burnt after 5 wrong tries).
2. The device stays signed in for 30 days via a random HttpOnly cookie (only its SHA-256 hash is stored in `agy-hud-panel-lan.json`, mode `0600`). You can also Add to Home Screen (PWA; pair once inside the home-screen app).
3. Manage devices anytime from the host's **Phone** button or via `agy-check panel pair` / `/check lan --revoke`.

<p align="center">
  <img src="./assets/phone-pair.png" alt="One-time pairing screen on a phone" width="240">
</p>

### 3. Remote / headless server (TUN overlay or SSH tunnel)

Running `agy` on a remote Linux/macOS server, homelab, or cloud VM? Access its live dashboard from all your devices in two safe ways:

- **Over a TUN overlay (`Tailscale` / `ZeroTier` / `WireGuard`) or server LAN subnet** — whitelist the CIDR once and pair phones, tablets, and laptops with a 6-digit code (no SSH app needed on mobile):
  ```bash
  # On the server (e.g. TUN mesh subnet or Tailscale 100.64.0.0/10; comma-separated for multiple)
  agy-check panel --daemon --lan --networks 10.0.0.0/24
  # Or inside agy:
  /check lan --networks 10.0.0.0/24
  ```
  <sub>By default `--lan` serves physical `en*` / `eth*` / `wlan*` / `wl*` interfaces only; VM bridges and TUN interfaces return `403`. Adding a CIDR via `--networks` enables your TUN overlay — and also covers Linux servers using predictable NIC names such as `ens*` / `enp*`. Pass `--networks none` to clear.</sub>
- **Over an SSH tunnel (keeps the server `127.0.0.1`-only)** — ideal for quick laptop access with zero ports opened on the server:
  ```bash
  # On the server:
  agy-check panel --daemon
  # On your laptop:
  ssh -L 18721:127.0.0.1:18721 user@your-server
  ```
  Then open `http://127.0.0.1:18721` locally.

> **Security note:** Paired devices can view everything, refresh quota, rename, archive, and delete sessions; account sync, pairing codes, and sign-out stay restricted to the host running `agy`. Traffic is plain HTTP — use `--lan` only inside a trusted LAN or encrypted TUN overlay (or use SSH forwarding), and never expose port `18721` to the public internet.

---

## Install

Run from a normal shell, **not** inside an active `agy` session (`agy` may overwrite `settings.json` on exit). Re-running safely updates or repairs the setup.

**macOS / Linux**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/install.sh)
```

**Windows PowerShell**
```powershell
irm https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/install.ps1 | iex
```

**Windows CMD**
```cmd
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/install.ps1 | iex"
```

**From a local clone**
```bash
git clone https://github.com/kid0114/agy-check.git
cd agy-check
agy plugin install .
node scripts/bootstrap.js
```

The installer sets up the plugin, runtime (`~/.gemini/antigravity-cli/agy-hud-runtime/`), `statusLine.command`, timing hooks, and the zero-token `/check` hook + skill (preserving any existing hooks or custom `check` skill). Open a new `agy` session to see the status line.

---

## Dashboard & session management

- **Live sync:** Updates within ~1s via Server-Sent Events whenever `agy` transcripts, titles, annotations, locks, or presence change. Includes 20s heartbeats, automatic reconnect/refetch after phone or laptop sleep, 5s polling fallback while reconnecting, clickable **Live** manual sync, and quiet 3-minute background quota refresh while a tab is open.
- **Full overview:** Page-wide time range (`Active`, `24h`, `Today`, `7d`, `30d`, `All`), weighted cache hit rate, average `out`/`net≈` speed, API-equivalent cost ladder (`Today` / `7d` / `30d` / `This month`), per-account 5h & weekly quota, and per-model breakdown.
- **Session detail & cache diagnosis:** Click any row (navigate with `↑` / `↓`, close with `Esc`) to inspect turn-by-turn hit rates, per-turn costs, and flagged cache-miss causes.
- **Search, persistent rename, archive & bulk delete:**
  - Rename (`F2` or click title/pencil) and Archive/Unarchive persist directly to `agy`'s source of truth (`ConversationService/UpdateConversation` when a live loopback endpoint is available, else atomic update of `annotations/<id>.pbtxt`), so `/resume` and refreshes stay in sync.
  - Toggle **Select** to pick rows (or **Select all**) and archive, unarchive, or permanently delete via `agy`'s `DeleteConversation` API (requires typing `DELETE`, detects open `agy` windows and lets you explicitly close them first; hand off a live endpoint anytime with `agy-check panel handoff`).

![Session detail](./assets/panel-session-detail.png)

![Filter, select all, and bulk archive or delete](./assets/panel-bulk-ops.png)

### Commands

Inside `agy` (zero tokens):

| Slash command | What it does |
|---|---|
| `/check` or `/check panel` | Start or reuse the dashboard and open it in your browser |
| `/check lan [--networks <cidr,...>\|none] [--revoke]` | Enable multi-device LAN/TUN access and print URLs + pairing code |
| `/check ls [active\|24h\|today\|7d\|30d\|all]` | Print the session table in chat |
| `/check session [id]` | Per-turn cache detail for a session (defaults to current) |
| `/check refresh` | Refresh quota and print the session table |
| `/check sync [--apply]` | Preview or execute optional account sync |
| `/check stop` | Stop the background dashboard |

Standalone CLI (optional symlink: `ln -s ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-check.js ~/.local/bin/agy-check`):

```text
agy-check panel [--port 18721] [--daemon] [--open]   Start dashboard (127.0.0.1)
   [--lan] [--networks <cidr,...>|none]              Enable multi-device LAN/TUN mode with pairing code
agy-check panel pair | revoke                        Generate pairing code | sign out all paired devices
agy-check panel handoff                              Hand this agy window's local API endpoint to the panel (for delete)
agy-check panel stop                                 Stop the background dashboard
agy-check ls [--range 24h] [--sort recent]           Print the session table
   [--account all|unsynced|email] [--q text] [--limit 20] [--refresh] [--json]
agy-check session <id-prefix> [--json]               Per-turn cache hit rate and miss diagnosis
agy-check sync [--apply]                             Preview (default) or run account sync
agy-check config                                     Status line configuration wizard
agy-check update                                     Update the runtime
```

---

## Terminal status line & multi-account sync

![Status line](./assets/demo.png)

Compared with upstream [`agy-hud`](https://github.com/icebear0828/agy-hud), the status line adds hook-timed output speed (`out` total with thinking and `net≈` visible text speed, excluding tool wait), cumulative `tooltime`, exact on-by-default cache hit rate (`0.0%` cold turns + whole-session `avg`), native `antigravity-cli` transcript parsing, and per-account quota caching.

- **Multi-account quota & drift detection:** Quota snapshots are cached per account email so you can view inactive accounts' last saved quota alongside the active login. After switching accounts, older `agy` windows that still hold the previous login in memory are flagged **unsynced** in the dashboard, CLI, and their own status line.
- **Optional Sync sessions script:** If you provide a script via `AGY_SYNC_SCRIPT` (default `~/tool-scripts/agy/agy-sync-keychain.sh`, not included in this repo), the dashboard runs `--dry-run` first and executes only after explicit local confirmation. The button stays hidden when no script is present.

---

## Metrics & configuration at a glance

| Item | Source | Notes |
|---|---|---|
| **Speed (`out` / `net≈`) & `tooltime`** | `agy` hooks (`speed-cache/`) + transcripts | Separates model decode time from tool wait; `out` includes thinking, `net≈` is visible text |
| **Cache hit rate & miss cause** | `transcript.jsonl` | Exact `cache_read / (input + cache_read + cache_write)` (`0.0%` on cold turns); flags model switch, 5m TTL, >25% context drop, or prefix change |
| **Estimated API cost** | `transcript.jsonl` + [`runtime/cost.js`](./runtime/cost.js) | Google API / partner-model list rates per turn; unknown models show **unpriced**; membership usage isn't billed per token |
| **Quota & multi-account drift** | Antigravity quota API + local Keychain/session locks | Cached per account email; flags open windows still holding a previous login as **unsynced** |
| **Session titles, archive & delete** | `agy` local API / `annotations/*.pbtxt` | Persists to `agy`'s source of truth; permanent delete uses `DeleteConversation` (`agy-check panel handoff` if needed) |
| **HUD configuration** | `agy-check config` or `agy-hud.config.json` | Interactive wizard for theme, speed/cache/cost toggles, quota style (`table`/`compact`/`models`), and Nerd Fonts |

---

## Privacy, troubleshooting & uninstall

- **Privacy:** Local-first with zero telemetry. Outbound network calls go only to Google's Antigravity quota/userinfo endpoints (using your active login; macOS Keychain tokens are never printed) plus a once-a-day version check against this repo's `package.json`. Dashboard binds to `127.0.0.1` unless `/check lan` is enabled (see [Multi-device and remote server setup](#multi-device-and-remote-server-setup)); write endpoints enforce same-origin checks, and handed-off `agy` API endpoints (`agy-check-ls-endpoints.json`, mode `0600`) never leave the server process.
- **Troubleshooting:**
  ```bash
  node ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-hud.js < /dev/null   # Test HUD render
  node ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-check.js panel       # Run panel in foreground
  npm test                                                                            # Run unit tests (from repo)
  ```
- **Uninstall** (stop the panel first with `/check stop`):
  ```bash
  # macOS / Linux
  bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-check/main/uninstall.sh)
  ```
  ```powershell
  # Windows PowerShell
  irm https://raw.githubusercontent.com/kid0114/agy-check/main/uninstall.ps1 | iex
  ```
  Removes `statusLine`, `agy-check` hooks and skill (leaving your own hooks and custom `check` skill intact), runtime/caches, and the plugin.

---

## License and attribution

Licensed under the [MIT License](./LICENSE). Originally based on [`icebear0828/agy-hud`](https://github.com/icebear0828/agy-hud) (MIT).
