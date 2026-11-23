---
name: checkagy
description: >-
  Launch and open the agy-check multi-session cache hit rate, remaining quota,
  and account-sync WebUI panel directly from agy CLI (/checkagy [panel|ls|session|sync|refresh|stop]).
---

# /checkagy — Multi-Session Cache Hit Rate & Quota Panel

When invoked via `/checkagy` in Antigravity CLI, the `agy-check-slash-command` `PreInvocation` hook intercepts the command directly (zero tokens) and opens the local WebUI panel at `http://127.0.0.1:18721`.

If hooks are disabled and this skill runs via the agent instead, execute the matching local command and return its concise English summary without modifying repository files:

- `/checkagy` or `/checkagy panel`: `agy-check panel --daemon --open`
- `/checkagy stop`: `agy-check panel stop`
- `/checkagy ls [range]`: `agy-check ls --range <range>` (default `24h`)
- `/checkagy session [id]`: `agy-check session <id>` (defaults to the current conversation ID)
- `/checkagy refresh`: `agy-check ls --refresh`
- `/checkagy sync`: `agy-check sync` (dry-run preview only; pass `--apply` only when the user explicitly wrote `--apply`)
