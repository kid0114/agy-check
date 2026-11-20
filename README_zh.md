# agy-hud-plus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> **Antigravity CLI (`agy`) 增强版实时状态栏 HUD** — 基于 [`icebear0828/agy-hud`](https://github.com/icebear0828/agy-hud)（MIT）深度增强，新增 Hook 精准双速统计（总输出 `out` + 去思考可见净速 `net≈`）、累计工具执行耗时（`tooltime`）、修正并补全单轮 + 整会话累计 Prompt 缓存命中率（`cache ... avg ...`），以及多账号切换防配额缓存串号。

[English](./README.md)

---

## 效果演示

![agy-hud-plus demo](./assets/demo.png)

```text
user@gmail.com │ project │ ⎇ main │ Gemini 4 Neon (XHigh) │ Google AI Ultra │ out: 68.5 (net≈24.1) tok/s │ tooltime: 3m30s
⚿ Tokens 300.8k (in: 2.5k, out: 78.1k, cache: 220.1k) │ cache 98.9% (220.1k/222.7k, avg 92.6%) │ ⛁ 200k/1M [██░░░░░░░░] 19%
1 AGENTS.md
  ─────────────────────────────────────────────────────────────────────────────────
  Google 5h   [█████░]  78% ~1h5m  │ Claude 5h   [██████] 100% ~4h43m
  Google week [█████░]  83% ~4d19h │ Claude week [██████]  98% ~5d21h
```

---

## 相对原版 `agy-hud` 的增强项

| 功能 | 原版 `agy-hud` | `agy-hud-plus` |
|---|---|---|
| **输出速度（`out` / `net≈`）** | 仅估算总输出速度，且未精准扣除工具执行耗时 | 通过 `PreInvocation` / `PostToolUse` / `PostInvocation` Hook 精确拆分模型推理与工具执行时间，同时展示总输出速度（含 thinking）与可见净输出速度 `net≈` |
| **工具耗时（`tooltime`）** | 不支持 | 累计当前会话全部工具调用耗时，安装脚本自动注册到 `~/.gemini/config/hooks.json` |
| **Prompt 缓存命中率（`cache`）** | 默认关闭；`input_tokens >= cache_read` 时分母启发式会高估命中率；冷启动 `0%` 可能被隐藏或被平滑逻辑掩盖 | 默认开启；按实测 `agy` 增量口径 `input + cache_read + cache_write` 精确计算，冷启动/切模型如实显示 `0.0%`，并追加整会话累计均值 `avg XX.X%` |
| **Transcript 路径与字段解析** | `agy` 传入旧路径 `~/.gemini/antigravity/brain/...` 时读不到文件，且未解析 `PLANNER_RESPONSE` 顶层 token 字段 | 自动提取 UUID 定位 `antigravity-cli/brain/<id>/.../transcript.jsonl`，完整解析原生 `input_tokens` 与 `cache_read_tokens` |
| **多账号配额隔离** | 切换账号后短时间可能残留上一账号的套餐/额度缓存 | 以活跃账号邮箱隔离配额与套餐缓存，切号立即刷新 |

---

## 每一项指标如何计算

所有数据均来自 `agy` 实时 `statusLine` 标准输入 JSON、会话日志 `transcript.jsonl` / `transcript_full.jsonl`、Hook 计时记录（`~/.gemini/antigravity-cli/speed-cache/hook-timing-<id>.json`）以及 Antigravity 云端配额接口。

### 第一行：身份、模型、双速与工具耗时

| 显示项 | 示例 | 数据来源与精确计算公式 |
|---|---|---|
| **当前账号** | `user@gmail.com` | 优先级：当前活跃 OAuth Token 缓存的 userinfo 邮箱 → `~/.gemini/google_accounts.json` → `~/.gemini/oauth_creds.json` JWT payload（仅展示）→ 系统用户名。开关：`display.showUsername`。 |
| **工作目录** | `lny` | `path.basename(agyData.workspace.current_dir \|\| cwd)`。开关：`display.showCurrentDir`。 |
| **Git 分支** | `⎇ main` | 在工作目录执行 `git rev-parse --abbrev-ref HEAD`。开关：`display.showGitBranch`。 |
| **当前模型** | `Gemini 4 Neon (XHigh)` | 读取 `agyData.model.display_name \|\| agyData.model.id`，并对常见 `Gemini` / `Claude` / `GPT-OSS` 名称做紧凑缩写。 |
| **账号套餐** | `Google AI Ultra` | 来自 `loadCodeAssist` 并绑定当前账号邮箱缓存（切号不串号），不可用时回退到 `agyData.plan_tier \|\| 'Free'`。 |
| **总输出速度（`out`）** | `out: 68.5 tok/s` | $$\text{out} = \frac{\Delta \text{total\_output\_tokens}}{\Delta t_{\text{model}}}$$ 其中 $\Delta t_{\text{model}} = t_{\text{invocation}} - t_{\text{tool}}$，由 `invocation-timer.js` Hook 记录整轮调用墙钟耗时并扣除工具执行耗时。分子包含思维链（thinking）token；单次模型耗时 `< 500ms` 视为噪声并保持上次有效读数。 |
| **可见净输出速度（`net≈`）** | `(net≈24.1)` | $$\text{net} \approx \frac{\min(\Delta \text{total\_output\_tokens},\; \Delta \text{visible\_tokens})}{\Delta t_{\text{model}}}$$ 从 `transcript_full.jsonl` 的每条 `PLANNER_RESPONSE` 提取可见正文 `content` 与 `tool_calls`（不含 `thinking`），按 $\text{中日韩字符数} \times 0.9 + \text{其他字符数} \times 0.26$ 估算可见 token（单步不超过 `entry.output_tokens`），除以同一段纯模型推理耗时。 |
| **工具累计耗时（`tooltime`）** | `tooltime: 3m30s` | 累计当前会话所有调用中的工具运行时间。单次调用内，`resolveToolWindowMs()` 将 `transcript.jsonl` 中最早被追踪工具步骤的 `created_at + 500ms`（补偿 1 秒向下取整精度误差）作为起点，以最晚一次 `PostToolUse` Hook 的精确时间戳作为终点，截取在 `[invocationStart, invocationEnd]` 内并累加。 |

### 第二行：Token 用量、缓存命中率与上下文窗口

| 显示项 | 示例 | 数据来源与精确计算公式 |
|---|---|---|
| **Token 构成** | `⚿ Tokens 300.8k (in: 2.5k, out: 78.1k, cache: 220.1k)` | <ul><li>`in`：当前轮次未命中缓存的新增输入 `current_usage.input_tokens`（无 `current_usage` 时回退为 `max(0, total_input_tokens - cacheTotal)`）。</li><li>`out`：会话累计输出 `context_window.total_output_tokens`。</li><li>`cache`：`cache_read_input_tokens + cache_creation_input_tokens`（为 `0` 时省略）。</li><li>`Tokens`：`in + out + cache`。</li></ul> |
| **单轮缓存命中率** | `cache 98.9% (220.1k/222.7k, ...)` | $$\text{单轮命中率} = \frac{\text{cache\_read}}{\text{input\_tokens} + \text{cache\_read} + \text{cache\_creation}} \times 100\%$$ **为什么分母是总输入而不是输出？** Prompt / KV Cache 只缓存输入前缀，模型输出每次都是现解码生成的，不可能走缓存。在 `agy` 中（跨 Gemini 与 Claude 模型实测验证），后端返回的 `input_tokens` 始终是不含缓存读取的未命中增量，因此本轮真实总输入为 `input + cache_read + cache_write`。冷启动或切模型导致 `cache_read` 为 `0` 或被省略时，如实显示 `0.0%`。 |
| **整会话累计命中率（`avg`）** | `(..., avg 92.6%)` | $$\text{avg} = \frac{\sum \text{cache\_read\_tokens}}{\sum (\text{input\_tokens} + \text{cache\_read\_tokens} + \text{cache\_creation\_tokens})} \times 100\%$$ 逐行汇总当前会话 `transcript.jsonl` 中所有 `PLANNER_RESPONSE` 的真实 token，将首轮冷启动、切换模型失效、缓存过期全部摊算在内。会话达到 2 轮及以上时显示（首轮与单轮相同故省略），可通过 `display.showSessionCacheHitRate: false` 关闭。 |
| **命中率色阶** | 绿 / 黄 / 灰 | 默认阈值（`display.cacheHitThresholds`）：**≥ 80%** 粗绿、**50%–79.9%** 黄、**0.1%–49.9%** 暗黄、**0%** 暗灰。 |
| **上下文窗口** | `⛁ 200k/1M [██░░░░░░░░] 19%` | 直接展示 `agy` 上报的 `context_window.total_input_tokens / context_window.context_window_size` 与 `used_percentage`。进度条超过 `thresholds.warning`（70%）变黄，超过 `thresholds.critical`（90%）变红。 |

### 第三行：项目元数据（仅非零项显示）

自动扫描工作区的记忆文件（`AGENTS.md` / `GEMINI.md` / `CLAUDE.md` / `MEMORY.md`）、规则目录（`.gemini/rules`、`.claude/rules`、`.cursor/rules`、`.github/rules`）、已配置 MCP 数量以及 `.git/hooks` 活跃脚本数；全为零时自动隐藏整行。

### 额度面板：Google / Claude 5h 与周额度

| 显示项 | 示例 | 数据来源与精确计算公式 |
|---|---|---|
| **剩余额度百分比** | `Google 5h [█████░] 78%` | 优先使用 `agy` stdin 实时下发的 `quota`（`gemini-5h`、`gemini-weekly`、`3p-5h`、`3p-weekly`），并与云端配额缓存 `agy-hud-quota-cache.json` 合并。百分比按 `floor(remainingFraction * 100)` 向下取整，且非 `1.0` 时封顶 `99%`，避免轻微消耗后一直卡在 `100%`。 |
| **重置倒计时** | `~1h5m` / `~4d19h` | `max(0, resetTime - now)`，按跨度自动格式化为 `Xd`（≥10 天）、`XdYh`、`Xh`（≥10 小时）、`XhYm`、`Ym` 或 `now`。 |

---

## 安装与使用

请在**普通终端**中执行（**不要**在正在运行的 `agy` 会话内执行，因为 `agy` 退出时会写回内存中的 `settings.json`）。

### 一键安装

**macOS / Linux：**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-hud-plus/main/scripts/install.sh)
```

**Windows PowerShell：**
```powershell
irm https://raw.githubusercontent.com/kid0114/agy-hud-plus/main/scripts/install.ps1 | iex
```

**Windows CMD：**
```cmd
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/kid0114/agy-hud-plus/main/scripts/install.ps1 | iex"
```

### 从本地克隆安装

```bash
git clone https://github.com/kid0114/agy-hud-plus.git
cd agy-hud-plus
agy plugin install .
node scripts/bootstrap.js
```

### 安装脚本做了什么

1. 通过 `agy plugin install` 安装插件元数据与 `/hud-config` 配置技能。
2. 将独立运行时部署到 `~/.gemini/antigravity-cli/agy-hud-runtime/`。
3. 在 `~/.gemini/antigravity-cli/settings.json` 中写入 `statusLine.command`。
4. 在 `~/.gemini/config/hooks.json` 中增量注册 `agy-hud-invocation-timer`（`PreInvocation`、`PostToolUse`、`PostInvocation`），保留你原有的其他 Hook，使 `out` / `net≈` / `tooltime` 开箱即用。

安装脚本支持幂等重跑，随时可用来更新或修复配置。安装完成后新开一个 `agy` 会话即可看到状态栏。

---

## 配置说明

- 全局配置文件：`~/.gemini/antigravity-cli/agy-hud-runtime/runtime/agy-hud.config.json`
- 项目级覆盖（可选）：当前目录下的 `./agy-hud.config.json`

交互式配置向导：
```bash
node ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-hud.js --config
```

也可直接编辑 `agy-hud.config.json`：

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

常用 `display` 开关一览：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `showSpeed` | `true` | 第一行显示总输出速度与净速度 `out: X.X (net≈Y.Y) tok/s` |
| `showToolTime` | `true` | 第一行显示累计工具耗时 `tooltime: XmYs` |
| `showTurnCacheHitRate` | `true` | 第二行显示单轮缓存命中率 `cache XX.X% (read/total)` |
| `showSessionCacheHitRate` | `true` | 在缓存徽章中追加整会话累计均值 `, avg YY.Y%`（≥ 2 轮显示） |
| `cacheHitThresholds` | `{ "excellent": 80, "partial": 50 }` | 自定义缓存命中率颜色阈值 |
| `cacheSmoothing` | `false` | 兼容旧版 CLI 波动的可选平滑逻辑，保持 `false` 可如实展示 `0.0%` 缓存失效 |
| `quotaStyle` | `"table"` | `"table"`（Google/Claude 5h+周额度）、`"compact"`（单行迷你条）或 `"models"`（按模型表） |
| `showUsername` | `true` | 显示当前账号邮箱或系统用户名 |
| `useNerdFonts` | `false` | 启用 Nerd Fonts 图标 |
| `showCost` / `showDailyCost` / `showWeeklyCost` | `false` | 显示估算的会话 / 今日 / 本周费用（USD） |

---

## 验证与排查

```bash
# 检查 statusLine 与计时 Hook 配置
cat ~/.gemini/antigravity-cli/settings.json | grep -A3 statusLine
cat ~/.gemini/config/hooks.json

# 直接运行 HUD 渲染测试
node ~/.gemini/antigravity-cli/agy-hud-runtime/runtime/bin/agy-hud.js < /dev/null

# 在仓库根目录运行单元测试
npm test
```

---

## 卸载

**macOS / Linux：**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kid0114/agy-hud-plus/main/uninstall.sh)
```

**Windows PowerShell：**
```powershell
irm https://raw.githubusercontent.com/kid0114/agy-hud-plus/main/uninstall.ps1 | iex
```

卸载脚本会清除 `settings.json` 中的 `statusLine`、移除 `hooks.json` 中的 `agy-hud-invocation-timer`（保留其他 Hook）、删除 `agy-hud-runtime` 与缓存文件，并卸载插件。

---

## 开源协议与致谢

本项目采用 [MIT License](./LICENSE) 开源。

基于 [`icebear0828/agy-hud`](https://github.com/icebear0828/agy-hud)（MIT）二次开发，感谢原作者及社区贡献者。
