'use strict';

function renderPanelHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0c0f" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="agy-check" />
  <title>agy-check · Sessions &amp; Quota</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0c0f;
      --surface: #121419;
      --surface-2: #181b21;
      --surface-3: #20242b;
      --border: #23272e;
      --border-strong: #323843;
      --text: #e9ebef;
      --text-2: #b3b9c4;
      --muted: #7c8491;
      --accent: #7c9cff;
      --accent-soft: rgba(124, 156, 255, 0.12);
      --green: #4cc38a;
      --green-soft: rgba(76, 195, 138, 0.14);
      --amber: #e9a23b;
      --amber-soft: rgba(233, 162, 59, 0.12);
      --red: #f0646a;
      --red-soft: rgba(240, 100, 106, 0.12);
      --cyan: #4cb8d4;
      --violet: #a78bfa;
      --radius: 12px;
      --mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      font-variant-numeric: tabular-nums;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    .muted { color: var(--muted); }
    .mono { font-family: var(--mono); }
    .nw { white-space: nowrap; }
    code {
      font-family: var(--mono);
      font-size: 12px;
      background: var(--surface-3);
      padding: 1px 5px;
      border-radius: 4px;
    }

    /* Controls */
    button, select, input { font: inherit; font-size: 13px; color: var(--text); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--border-strong);
      background: var(--surface-2);
      cursor: pointer;
      font-weight: 500;
      white-space: nowrap;
      transition: background-color 0.12s, border-color 0.12s, color 0.12s;
    }
    .btn:hover { background: var(--surface-3); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn svg { width: 15px; height: 15px; flex: none; }
    .btn.sm { height: 30px; padding: 0 11px; font-size: 12.5px; }
    .btn.icon { width: 34px; padding: 0; justify-content: center; }
    .btn.ghost { background: transparent; border-color: transparent; color: var(--text-2); }
    .btn.ghost:hover { background: var(--surface-2); color: var(--text); }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #0b0c0f; }
    .btn.primary:hover { background: #93adff; }
    .btn.warn { background: var(--amber-soft); border-color: rgba(233, 162, 59, 0.45); color: var(--amber); }
    .btn.warn:hover { background: rgba(233, 162, 59, 0.2); }
    .btn.toggle[aria-pressed="true"] { background: var(--accent-soft); border-color: rgba(124, 156, 255, 0.45); color: var(--accent); }
    .field {
      height: 34px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid var(--border-strong);
      background-color: var(--surface-2);
      outline: none;
    }
    .field:focus { border-color: var(--accent); }
    select.field {
      appearance: none;
      -webkit-appearance: none;
      padding-right: 32px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237c8491' stroke-width='1.5'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      cursor: pointer;
    }
    .field.search {
      width: 300px;
      padding-left: 34px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237c8491' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: 12px center;
    }
    .seg {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .seg button {
      height: 30px;
      padding: 0 14px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--muted);
      font-weight: 500;
      cursor: pointer;
    }
    .seg button:hover { color: var(--text); }
    .seg button.on { background: var(--surface-3); color: var(--text); box-shadow: inset 0 0 0 1px var(--border-strong); }

    /* Status vocabulary */
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4a515c; flex: none; display: inline-block; }
    .dot.generating { background: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
    .dot.running { background: var(--accent); }
    .dot.recent { background: var(--amber); }
    .dot.live { background: var(--green); }
    .dot.warn { background: var(--amber); }
    .pill {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-2);
      background: var(--surface-3);
    }
    .pill.warn { color: var(--amber); background: var(--amber-soft); }
    .pill.bad { color: var(--red); background: var(--red-soft); }
    .pill.ok { color: var(--green); background: var(--green-soft); }
    .pill.info { color: var(--accent); background: var(--accent-soft); }
    .meter { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
    .meter > span { display: block; height: 100%; border-radius: inherit; background: var(--green); }
    .meter > span.warn { background: var(--amber); }
    .meter > span.bad { background: var(--red); }
    .meter > span.info { background: var(--accent); }
    .meter.sm { width: 52px; height: 4px; flex: none; }
    .meter.xs { width: 44px; height: 3px; margin: 6px 0 0 auto; }

    /* Top bar */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .topbar-inner {
      max-width: 1560px;
      margin: 0 auto;
      padding: 12px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand, .top-right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .logo {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--accent);
      background: var(--accent-soft);
      border: 1px solid rgba(124, 156, 255, 0.35);
    }
    .logo svg { width: 16px; height: 16px; }
    .brand-name { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
    .conn { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--muted); }
    .acct { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-2); }
    .acct[hidden] { display: none; }
    .acct-menu-wrap { position: relative; display: inline-flex; align-items: center; }
    .acct-chip-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.025);
      color: var(--text);
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.12s, border-color 0.12s, opacity 0.15s;
    }
    .acct-chip-btn[hidden] { display: none; }
    .acct-chip-btn:hover,
    .acct-chip-btn[aria-expanded="true"] {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
    }
    .acct-chip-btn.switching { opacity: 0.55; }
    .acct-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--green); }
    .acct-dot.warn { background: var(--amber); box-shadow: 0 0 0 2px rgba(233, 162, 59, 0.22); }
    .acct-dot.muted { background: #5a6270; }
    .acct-menu-label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acct-chip-btn .tier { padding: 1px 7px; font-size: 10.5px; }
    .acct-chev { width: 12px; height: 12px; color: var(--muted); flex: none; transition: transform 0.12s ease; }
    .acct-chip-btn[aria-expanded="true"] .acct-chev { transform: rotate(180deg); color: var(--text-2); }

    .acct-pop {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 45;
      width: 356px;
      max-width: calc(100vw - 24px);
      background: #17181c;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 12px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 16px 40px rgba(0, 0, 0, 0.55);
      overflow: hidden;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 0.12s ease, transform 0.12s ease;
    }
    .acct-pop.open { opacity: 1; transform: translateY(0); }
    .acct-pop[hidden] { display: none; }
    .acct-pop-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 14px 9px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .acct-pop-head .sub { font-weight: 500; letter-spacing: 0; text-transform: none; color: #67707e; }
    .acct-pop-unsaved {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 14px;
      background: rgba(233, 162, 59, 0.09);
      border-bottom: 1px solid rgba(233, 162, 59, 0.22);
      font-size: 12px;
      color: #f3c47a;
    }
    .acct-pop-unsaved span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acct-pop-unsaved strong { color: #ffd799; font-weight: 600; }
    .acct-pop-list { max-height: 300px; overflow-y: auto; }
    .acct-pop-empty { padding: 14px; font-size: 12px; color: var(--muted); }
    .acct-pop-item { border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .acct-pop-item:last-child { border-bottom: 0; }
    .acct-pop-item.is-active { box-shadow: inset 2px 0 0 var(--accent); background: rgba(124, 156, 255, 0.045); }
    .acct-pop-row {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      padding: 10px 14px;
    }
    .acct-pop-info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .acct-pop-email { font-size: 12.5px; font-weight: 500; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acct-pop-meta { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acct-pop-meta .warn-txt { color: var(--amber); }
    .acct-pop-acts { display: inline-flex; align-items: center; gap: 5px; }
    .acct-pop-active-lbl { font-size: 11px; font-weight: 600; color: var(--green); padding: 0 4px; }
    .btn.acct-pop-btn {
      min-width: 60px;
      height: 26px;
      min-height: 26px;
      padding: 0 10px;
      font-size: 11.5px;
      justify-content: center;
      background: rgba(255, 255, 255, 0.035);
      border-color: rgba(255, 255, 255, 0.13);
      color: var(--text);
    }
    .btn.acct-pop-btn:hover {
      background: rgba(255, 255, 255, 0.085);
      border-color: rgba(255, 255, 255, 0.24);
    }
    .acct-pop-del {
      width: 24px;
      height: 24px;
      min-height: 24px;
      padding: 0;
      color: var(--muted);
      opacity: 0;
      transition: opacity 0.12s, color 0.12s, background-color 0.12s;
    }
    .acct-pop-row:hover .acct-pop-del,
    .acct-pop-row:focus-within .acct-pop-del { opacity: 1; }
    .acct-pop-del:hover { color: var(--red); background: var(--red-soft); border-color: rgba(240, 100, 106, 0.3); }
    .acct-pop-rm-confirm { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: #f7a8ac; }
    .acct-pop-rm-confirm .btn.xs { height: 24px; min-height: 24px; padding: 0 8px; font-size: 11px; }
    .acct-pop-expand {
      padding: 0 14px 11px 33px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      font-size: 11.5px;
      color: #f3c47a;
    }
    .acct-pop-expand strong { color: #ffd799; }
    .acct-pop-expand-acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .acct-pop-expand-acts .btn.xs { height: 26px; min-height: 26px; padding: 0 9px; font-size: 11.5px; }
    .acct-pop-foot {
      padding: 8px 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.015);
    }
    .acct-pop-signin-btn {
      width: 100%;
      justify-content: flex-start;
      height: 30px;
      min-height: 30px;
      padding: 0 8px;
      font-size: 12px;
      color: var(--text-2);
    }
    .acct-pop-signin-btn:hover { color: var(--text); }
    .acct-pop-signin-box {
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 11.5px;
      color: var(--text-2);
      line-height: 1.45;
    }
    .acct-pop-signin-box strong { color: var(--text); }
    .acct-pop-signin-acts { display: flex; align-items: center; gap: 6px; }
    .acct-pop-signin-acts .btn.xs { height: 26px; min-height: 26px; padding: 0 10px; font-size: 11.5px; }
    .quota-vault-foot {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--muted);
    }
    .quota-vault-foot .link-btn {
      background: none;
      border: 0;
      padding: 2px 4px;
      border-radius: 5px;
      color: var(--text-2);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .quota-vault-foot .link-btn:hover { color: var(--accent); background: var(--accent-soft); }
    @media (prefers-reduced-motion: reduce) {
      .acct-pop, .acct-chev, .acct-chip-btn { transition: none; }
    }
    .tier {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 9px;
      border-radius: 999px;
      color: var(--violet);
      background: rgba(167, 139, 250, 0.12);
      border: 1px solid rgba(167, 139, 250, 0.3);
    }

    /* Page */
    .app {
      max-width: 1560px;
      margin: 0 auto;
      padding: 28px 40px 72px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .page-head h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
    .page-sub { margin-top: 4px; font-size: 13px; color: var(--muted); }
    .banner {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      border-radius: var(--radius);
      border: 1px solid rgba(233, 162, 59, 0.4);
      background: var(--amber-soft);
      color: #f3c47a;
    }
    .banner.show { display: flex; flex-wrap: wrap; }
    .banner strong { color: #ffd38a; }

    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); min-width: 0; }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      padding: 16px 22px;
      border-bottom: 1px solid var(--border);
    }
    .card-title { font-size: 14px; font-weight: 600; }
    .card-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .card-title-row { display: flex; align-items: baseline; gap: 10px; }
    .card-title-row .card-sub { margin-top: 0; }
    .card-body { padding: 20px 22px; }
    .grid-2 { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 20px; }

    /* KPI strip */
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .kpi { padding: 20px 24px; border-left: 1px solid var(--border); min-width: 0; }
    .kpi:first-child { border-left: 0; }
    .kpi-label { font-size: 12px; font-weight: 500; color: var(--muted); }
    .kpi-value { margin-top: 6px; font-size: 28px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; white-space: nowrap; }
    .unit { margin-left: 6px; font-size: 13px; font-weight: 500; letter-spacing: 0; color: var(--muted); }
    .kpi-meter { margin-top: 12px; }
    .kpi-sub { margin-top: 10px; font-size: 12px; color: var(--muted); }
    .kpi-note { margin-top: 6px; font-size: 12px; }
    .cost-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 26px;
      padding: 0 11px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
    }
    .cost-pill .k { font-weight: 500; color: var(--muted); }
    .cost-ladder { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 16px; }
    .cost-ladder > span { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; color: var(--text-2); }
    .cost-ladder > span > span { color: var(--muted); }
    .cost-ladder > span.on, .cost-ladder > span.on > span { color: var(--text); font-weight: 600; }

    /* Quota */
    .providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 22px 32px; }
    .prov-name { font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 18px; }
    .qrow + .qrow { margin-top: 24px; }
    .qrow-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; font-size: 12.5px; color: var(--text-2); }
    .qpct { font-size: 16px; font-weight: 650; }
    .qrow-foot { margin-top: 6px; font-size: 11.5px; color: var(--muted); }
    .acct-list { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
    .acct-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-2); }
    .acct-row .acct-email { font-weight: 500; color: var(--text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acct-row .push { margin-left: auto; white-space: nowrap; }

    /* Models */
    .mtable { width: 100%; border-collapse: collapse; }
    .mtable th { text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); padding: 0 0 10px 16px; white-space: nowrap; }
    .mtable td { padding: 8px 0 8px 16px; border-top: 1px solid var(--border); font-size: 13px; white-space: nowrap; }
    .mtable th:first-child, .mtable td:first-child { padding-left: 0; }
    .mtable td:first-child { font-weight: 500; }
    .mtable .r { text-align: right; }
    .mtable .hitcol { width: 34%; }
    .hitbar { display: flex; align-items: center; gap: 12px; }
    .hitbar .meter { flex: 1; }
    .hitbar span:last-child { width: 52px; text-align: right; font-weight: 500; }
    .more { margin-top: 10px; font-size: 12px; }

    /* Sessions table */
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .table-scroll { overflow-x: auto; }
    table.sessions { width: 100%; min-width: 1060px; border-collapse: collapse; }
    table.sessions th {
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    table.sessions th[data-sort] { cursor: pointer; user-select: none; }
    table.sessions th[data-sort]:hover, table.sessions th.sorted { color: var(--text); }
    .ind { margin-left: 5px; color: var(--accent); font-size: 11px; }
    table.sessions td { padding: 14px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; font-size: 13px; }
    table.sessions tbody tr:last-child td { border-bottom: 0; }
    table.sessions .r { text-align: right; }
    table.sessions.hide-cost .col-cost { display: none; }
    #sessionsBody > tr[data-id] { cursor: pointer; scroll-margin-top: 72px; }
    #sessionsBody > tr[data-id]:hover > td { background: var(--surface-2); }
    #sessionsBody > tr.unsynced > td:first-child { box-shadow: inset 3px 0 0 var(--amber); }
    #sessionsBody > tr.selected > td { background: var(--accent-soft); }
    #sessionsBody > tr.selected > td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
    .col-session { width: 100%; max-width: 0; }
    .title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { margin-top: 3px; font-family: var(--mono); font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; white-space: nowrap; }
    .status .pill { margin-left: 2px; }
    .v { font-weight: 500; white-space: nowrap; }
    .v.model { font-weight: 400; color: var(--text-2); }
    .s { margin-top: 3px; font-size: 12px; color: var(--muted); white-space: nowrap; }
    .hit { display: inline-flex; align-items: center; gap: 10px; }
    .empty { padding: 44px 20px; text-align: center; color: var(--muted); }
    .table-foot { padding: 12px 22px; border-top: 1px solid var(--border); font-size: 12px; }

    /* Detail drawer */
    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 50;
      width: min(980px, max(620px, calc(100vw - 440px)));
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border-left: 1px solid var(--border-strong);
      box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45);
      transform: translateX(100%);
      visibility: hidden;
      transition: transform 0.18s ease, visibility 0.18s;
    }
    .drawer.open { transform: none; visibility: visible; }
    .drawer-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px 16px;
      border-bottom: 1px solid var(--border);
    }
    .drawer-kicker { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font-size: 12px; color: var(--muted); }
    .drawer-title-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; min-width: 0; }
    .drawer-title-row[hidden], .rename-form[hidden], .rename-note[hidden] { display: none; }
    .drawer-title { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; overflow-wrap: anywhere; }
    .drawer-title.editable { cursor: text; }
    .drawer-title.editable:hover { color: var(--accent); }
    .btn.icon.sm-icon { width: 26px; height: 26px; flex: none; color: var(--muted); }
    .btn.icon.sm-icon:hover { color: var(--text); }
    .rename-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
    .rename-input { flex: 1 1 220px; min-width: 0; height: 32px; }
    .rename-actions { display: flex; align-items: center; gap: 6px; flex: none; }
    .rename-note { margin-top: 6px; font-size: 12px; color: var(--muted); line-height: 1.4; }
    .rename-note.warn { color: var(--amber); }
    .rename-note.bad { color: var(--red); }
    .drawer-actions { display: flex; align-items: center; gap: 6px; flex: none; }
    .drawer-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 16px 22px; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: 100%;
      height: 26px;
      padding: 0 10px;
      border-radius: 7px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-2);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .chip[data-copy] { cursor: copy; }
    .chip[data-copy]:hover { border-color: var(--border-strong); color: var(--text); }
    .chip.copied { border-color: var(--green); color: var(--green); }
    .chip .k { color: var(--muted); }
    .chip.mono { font-family: var(--mono); font-size: 11.5px; }
    .chip.warn { border-color: rgba(233, 162, 59, 0.45); color: var(--amber); }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .stat { padding: 14px 22px; border-left: 1px solid var(--border); min-width: 0; }
    .stat:nth-child(4n + 1) { border-left: 0; }
    .stat:nth-child(n + 5) { border-top: 1px solid var(--border); }
    .stat-label { font-size: 12px; color: var(--muted); }
    .stat-value { margin-top: 4px; font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stat-value .unit { font-size: 12px; margin-left: 4px; }
    .stat-note { font-size: 12px; font-weight: 500; margin-left: 6px; }
    .chart-wrap { padding: 18px 22px 14px; border-bottom: 1px solid var(--border); }
    .chart-body { display: flex; }
    .chart-axis { flex: none; display: block; }
    .chart-scroll { flex: 1; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; }
    .chart-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12.5px; font-weight: 500; color: var(--text-2); }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; font-weight: 400; color: var(--muted); }
    .lg-item { display: inline-flex; align-items: center; white-space: nowrap; }
    .lg { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
    .lg.ok { background: var(--green); }
    .lg.warn { background: var(--amber); }
    .lg.bad { background: var(--red); }
    .lg.mk-model { border-radius: 50%; background: var(--violet); }
    .lg.mk-ttl { border-radius: 50%; border: 2px solid var(--amber); }
    .chart-empty { padding: 8px 0; font-size: 13px; color: var(--muted); }
    svg.chart rect.bar:hover { opacity: 0.75; }
    .turns-head { padding: 16px 22px 8px; font-size: 12.5px; font-weight: 500; color: var(--text-2); }
    table.turns { width: 100%; border-collapse: collapse; }
    table.turns th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface);
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    table.turns td { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 13px; white-space: nowrap; vertical-align: top; }
    table.turns th:first-child, table.turns td:first-child { padding-left: 22px; }
    table.turns th:last-child, table.turns td:last-child { padding-right: 22px; }
    table.turns .r { text-align: right; }
    table.turns td.diag { white-space: normal; min-width: 220px; }
    table.turns tbody tr:hover td { background: var(--surface-2); }
    .tag {
      display: inline-block;
      margin: 0 4px 4px 0;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--red);
      background: var(--red-soft);
    }
    .tag.ttl { color: var(--amber); background: var(--amber-soft); }
    .tag.model { color: var(--violet); background: rgba(167, 139, 250, 0.12); }
    .tag.drop { color: var(--cyan); background: rgba(76, 184, 212, 0.12); }

    /* Sync modal */
    .modal-backdrop {
      display: none;
      position: fixed;
      top: var(--vv-top, 0px);
      left: 0;
      right: 0;
      height: var(--vv-h, 100dvh);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(5, 6, 8, 0.72);
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      width: 100%;
      max-width: 720px;
      max-height: calc(var(--vv-h, 100dvh) - 48px);
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      padding: 22px 24px;
    }
    .modal h2 { margin: 0 0 8px; font-size: 16px; font-weight: 650; }
    .modal p { margin: 0 0 16px; font-size: 13px; color: var(--text-2); }
    .modal-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .pre-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      font-family: var(--mono);
      font-size: 11.5px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 280px;
      overflow-y: auto;
      color: var(--text-2);
    }
    .modal-status { margin-top: 12px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

    /* Selection, bulk actions and session ops (archive / delete) */
    table.sessions.select-mode { min-width: 1100px; }
    table.sessions:not(.select-mode) th.c-sel, table.sessions:not(.select-mode) td.c-sel { display: none; }
    table.sessions th.c-sel, table.sessions td.c-sel { width: 46px; padding: 0 0 0 6px; text-align: center; }
    .sel-hit { display: inline-flex; align-items: center; justify-content: center; width: 40px; min-height: 40px; cursor: pointer; }
    .sel-hit input, #selectAll { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
    #selectAll:disabled { cursor: default; opacity: 0.4; }
    #sessionsBody > tr.checked:not(.selected) > td { background: rgba(124, 156, 255, 0.07); }
    #sessionsBody > tr.archived > td:not(.c-sel) { opacity: 0.55; }
    #sessionsBody > tr.archived:hover > td:not(.c-sel), #sessionsBody > tr.archived.selected > td:not(.c-sel) { opacity: 0.85; }
    .btn.danger { background: var(--red-soft); border-color: rgba(240, 100, 106, 0.45); color: var(--red); }
    .btn.danger:hover { background: rgba(240, 100, 106, 0.2); }
    .btn.danger.solid { background: var(--red); border-color: var(--red); color: #0b0c0f; }
    .btn.danger.solid:hover { background: #ff7d82; }
    .ops-wrap { display: inline-flex; }
    .ops-wrap > .btn:disabled { pointer-events: none; }
    .ops-wrap.blocked { cursor: not-allowed; }
    .bulk-bar {
      position: fixed;
      left: 50%;
      bottom: calc(18px + env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 40;
      display: flex;
      align-items: center;
      gap: 8px 10px;
      flex-wrap: wrap;
      max-width: calc(100vw - 24px);
      padding: 8px 10px 8px 16px;
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    }
    .bulk-head { display: flex; align-items: center; gap: 8px; }
    .bulk-count { font-weight: 600; white-space: nowrap; }
    .bulk-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    body.bulk-open .app { padding-bottom: 120px; }
    .toast {
      position: fixed;
      bottom: calc(24px + env(safe-area-inset-bottom));
      right: 24px;
      z-index: 120;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      width: min(440px, calc(100vw - 24px));
      padding: 12px 10px 12px 16px;
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
      border-left: 3px solid var(--accent);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      font-size: 13px;
    }
    .toast.ok { border-left-color: var(--green); }
    .toast.warn { border-left-color: var(--amber); }
    .toast.bad { border-left-color: var(--red); }
    .toast-body { flex: 1; min-width: 0; padding-top: 4px; overflow-wrap: anywhere; }
    .op-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; }
    .handoff { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; color: var(--text-2); }
    .handoff code { font-size: 12px; overflow-wrap: anywhere; }
    .ops-note { margin-top: 6px; font-size: 12px; color: var(--amber); line-height: 1.4; }
    .conn-btn { border: 0; background: transparent; cursor: pointer; padding: 3px 8px; border-radius: 999px; transition: background 0.12s, color 0.12s; }
    .conn-btn:hover { background: var(--surface-2); color: var(--text); }
    .toast-action { margin-top: 8px; }
    #deleteModal .modal { max-width: 580px; }
    .del-list { list-style: none; margin: 0 0 14px; padding: 0; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); max-height: 240px; overflow-y: auto; }
    .del-list li { display: flex; align-items: baseline; gap: 10px; min-width: 0; padding: 8px 12px; border-top: 1px solid var(--border); font-size: 13px; }
    .del-list li:first-child { border-top: 0; }
    .del-list .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .del-list .id { flex: none; font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
    .del-list li.more-row { color: var(--muted); }
    .del-list li.run { flex-direction: column; align-items: stretch; gap: 3px; }
    .run-head { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
    .run-meta { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
    .run-gen { margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--red); }
    .del-warn { margin: 0 0 12px; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(240, 100, 106, 0.4); background: var(--red-soft); color: #f7a8ab; font-size: 13px; }
    .del-warn strong { color: var(--red); }
    .del-confirm-label { display: block; margin-bottom: 6px; font-size: 12.5px; color: var(--text-2); }
    .del-input { width: 100%; font-family: var(--mono); letter-spacing: 0.08em; }
    .check-row { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(240, 100, 106, 0.45); background: var(--surface-2); font-size: 13px; font-weight: 500; cursor: pointer; }
    .check-row input { flex: none; width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--red); cursor: pointer; }
    .del-status { margin-top: 12px; font-size: 13px; color: var(--text-2); overflow-wrap: anywhere; }
    .del-status:empty { display: none; }
    .del-status.ok { color: var(--green); }
    .del-status.warn { color: var(--amber); }
    .del-status.bad { color: var(--red); }
    #deleteResults { margin: 10px 0 0; }
    .spin { display: inline-block; width: 12px; height: 12px; margin-right: 8px; vertical-align: -1px; border: 2px solid var(--border-strong); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Semantic text tones (declared last so they win over muted defaults) */
    .t-ok { color: var(--green); }
    .t-warn { color: var(--amber); }
    .t-bad { color: var(--red); }
    .t-muted { color: var(--muted); }

    @media (max-width: 1180px) {
      .grid-2 { grid-template-columns: minmax(0, 1fr); }
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .kpi { border-left: 0; border-top: 1px solid var(--border); }
      .kpi:nth-child(-n + 2) { border-top: 0; }
      .kpi:nth-child(2n) { border-left: 1px solid var(--border); }
    }
    @media (max-width: 900px) {
      .topbar-inner, .app { padding-left: 20px; padding-right: 20px; }
      .drawer { width: 100vw; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stat:nth-child(n) { border-left: 0; border-top: 1px solid var(--border); }
      .field.search { width: 100%; }
    }
    @media (hover: none) {
      .kbd-hint { display: none; }
    }
    .lan-links { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 14px; }
    .lan-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); }
    .lan-link code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: none; padding: 0; font-size: 12.5px; color: var(--text); }
    .pair-code-box { margin: 0 0 12px; padding: 14px; text-align: center; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); }
    .pair-code { margin: 4px 0; font-size: 34px; font-weight: 650; letter-spacing: 0.3em; text-indent: 0.3em; }
    .modal .small { font-size: 12px; }

    /* Phones: sessions become cards, the detail drawer goes full screen, touch targets grow. */
    @media (max-width: 760px) {
      .topbar-inner { padding: calc(10px + env(safe-area-inset-top)) 16px 10px; gap: 10px; }
      .top-right { width: 100%; justify-content: space-between; gap: 6px 10px; flex-wrap: wrap; }
      .acct { min-width: 0; flex: 1 1 120px; justify-content: flex-end; }
      .acct > .muted, #tierBadge { display: none !important; }
      #acctEmail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
      .app { padding: 18px 14px calc(40px + env(safe-area-inset-bottom)); gap: 14px; }
      .page-head h1 { font-size: 19px; }
      .page-sub { display: none; }
      .seg { width: 100%; }
      .seg button { flex: 1; padding: 0 4px; height: 36px; }
      .btn { min-height: 38px; }
      .btn.sm { min-height: 34px; }
      .kpi { padding: 14px 16px; }
      .kpi-value { font-size: 22px; }
      .kpi:last-child { grid-column: 1 / -1; border-top: 1px solid var(--border); }
      .card-head, .card-body { padding: 14px 16px; }
      .providers { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 18px; }
      .mtable th:nth-child(2), .mtable td:nth-child(2), .mtable th:nth-child(4), .mtable td:nth-child(4) { display: none; }
      .mtable td:first-child { white-space: normal; }
      .mtable .hitcol { width: auto; text-align: right; }
      .hitbar { justify-content: flex-end; }
      .hitbar .meter { display: none; }
      .hitbar span:last-child { width: auto; }
      .acct-row { flex-wrap: wrap; row-gap: 2px; }
      .acct-row .acct-email { flex: 1; }
      .acct-row .acct-q { order: 3; flex-basis: 100%; padding-left: 18px; }
      .toolbar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: 100%; }
      .toolbar .btn { width: 100%; justify-content: center; padding: 0 8px; font-size: 12.5px; }
      .toolbar .field.search, .toolbar #accountFilter { grid-column: 1 / -1; width: 100%; height: 38px; }
      /* iOS zooms into inputs under 16px on focus, which pushes the page past the screen edge. */
      input.field, select.field { font-size: 16px; }

      .table-scroll { overflow: visible; }
      #sessTable, #sessTable.select-mode, #sessTable:not(.select-mode) { min-width: 0; }
      table.sessions, table.sessions tbody { display: block; width: 100%; }
      table.sessions thead { display: none; }
      #sessionsBody > tr[data-id] {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        grid-template-areas:
          "session session session session cost cost"
          "status status status model model model"
          "hit hit speed speed tokens tokens"
          "turns turns ctx ctx tool tool";
        gap: 12px 14px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
      }
      #sessTable.hide-cost #sessionsBody > tr[data-id] {
        grid-template-areas:
          "session session session session session session"
          "status status status model model model"
          "hit hit speed speed tokens tokens"
          "turns turns ctx ctx tool tool";
      }
      #sessTable.hide-cost #sessionsBody > tr[data-id] > td.c-cost { display: none; }
      #sessionsBody > tr[data-id] > td,
      #sessionsBody > tr[data-id]:hover > td,
      #sessionsBody > tr.selected > td,
      #sessionsBody > tr.checked:not(.selected) > td,
      #sessionsBody > tr.checked:not(.selected):hover > td {
        display: block;
        min-width: 0;
        padding: 0;
        border: 0;
        text-align: left;
        background: transparent;
      }
      #sessionsBody > tr[data-id] > td:first-child { box-shadow: none; }
      #sessionsBody > tr.selected { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
      #sessionsBody > tr.unsynced { box-shadow: inset 3px 0 0 var(--amber); }
      #sessionsBody > tr:not([data-id]) > td { display: block; }
      #sessionsBody > tr[data-id] > td.c-cost, #sessionsBody > tr[data-id] > td.c-model { text-align: right; }
      td.c-session { grid-area: session; width: auto; max-width: none; }
      td.c-cost { grid-area: cost; }
      td.c-status { grid-area: status; }
      td.c-model { grid-area: model; }
      td.c-hit { grid-area: hit; }
      td.c-speed { grid-area: speed; }
      td.c-tokens { grid-area: tokens; }
      td.c-turns { grid-area: turns; }
      td.c-ctx { grid-area: ctx; }
      td.c-tool { grid-area: tool; }
      td[data-label]::before { content: attr(data-label); display: block; margin-bottom: 3px; font-size: 11px; color: var(--muted); }
      td.c-status .status { flex-wrap: wrap; row-gap: 4px; }
      td.c-status .s { display: inline; margin-left: 8px; }
      td.c-session .title { font-size: 14.5px; }
      td.c-session .meta { white-space: normal; }
      .meta .nw { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: top; }
      td.c-hit .hit { flex-direction: column-reverse; align-items: flex-start; gap: 6px; }
      td.c-hit .meter.sm { width: 44px; height: 3px; }
      td.c-hit .s { margin-top: 6px; }
      .meter.xs { margin: 6px 0 0; }
      td.c-tokens .s { white-space: normal; }
      td.c-model .v { white-space: normal; overflow-wrap: anywhere; }
      .table-foot { padding: 12px 16px; }

      .drawer-head { position: relative; flex-direction: column; align-items: stretch; gap: 10px; padding: calc(14px + env(safe-area-inset-top)) 16px 12px; }
      .drawer-head > div:first-child { padding-right: 42px; }
      #btnCloseDetail { position: absolute; top: calc(12px + env(safe-area-inset-top)); right: 12px; }
      .drawer-actions { width: 100%; flex-wrap: wrap; gap: 8px; }
      .drawer-actions > .btn, .drawer-actions > .ops-wrap { flex: 1 1 0; min-width: 0; }
      .drawer-actions > .ops-wrap > .btn { flex: 1; }
      .drawer-actions .btn.sm { justify-content: center; padding: 0 10px; }
      .drawer-actions .copy-long { display: none; }
      .btn.icon.sm-icon { width: 32px; height: 32px; min-height: 32px; }
      .rename-input { flex-basis: 100%; height: 38px; font-size: 16px; }
      .chips { padding: 12px 16px; }
      .stat { padding: 12px 16px; }
      .stat-value { font-size: 16px; }
      .chart-wrap { padding: 14px 16px 10px; }
      .turns-head { padding: 14px 16px 6px; }
      table.turns th:nth-child(n + 2):nth-child(-n + 7), table.turns td:nth-child(n + 2):nth-child(-n + 7) { display: none; }
      table.turns th:first-child, table.turns td:first-child { padding-left: 16px; }
      table.turns th:last-child, table.turns td:last-child { padding-right: 16px; }
      table.turns td.diag { min-width: 0; }
      .modal-backdrop { padding: 12px; align-items: flex-start; overflow-y: auto; }
      .modal { max-height: calc(var(--vv-h, 100dvh) - 24px); margin: auto 0; padding: 18px 18px calc(18px + env(safe-area-inset-bottom)); }
      .modal-actions { flex-wrap: wrap; }

      /* Selection checkbox appears only in Select mode, pinned to the card's left edge with a 44px touch target. */
      #sessTable:not(.select-mode) #sessionsBody > tr[data-id] > td.c-sel { display: none; }
      #sessTable.select-mode #sessionsBody > tr[data-id] { position: relative; padding-left: 52px; }
      #sessionsBody > tr.checked:not(.selected) { background: rgba(124, 156, 255, 0.07); }
      #sessTable.select-mode #sessionsBody > tr[data-id] > td.c-sel { display: block; position: absolute; left: 4px; top: 6px; width: 44px; }
      .sel-hit { width: 44px; min-height: 44px; }
      .sel-hit input { width: 20px; height: 20px; }
      .bulk-bar { left: 10px; right: 10px; transform: none; max-width: none; padding: 10px 12px; }
      .bulk-head { flex: 1 1 100%; justify-content: space-between; }
      .bulk-count { flex: 1 1 auto; }
      .bulk-actions { flex: 1 1 100%; flex-wrap: nowrap; }
      .bulk-actions > .btn, .bulk-actions > .ops-wrap { flex: 1 1 0; min-width: 0; }
      .bulk-actions .btn { justify-content: center; padding: 0 8px; }
      .bulk-actions > .ops-wrap > .btn { flex: 1; }
      body.bulk-open .app { padding-bottom: calc(150px + env(safe-area-inset-bottom)); }
      .toast { left: 12px; right: 12px; width: auto; top: calc(10px + env(safe-area-inset-top)); bottom: auto; }
    }

    /* ---- Depth & translucency (cross-platform progressive enhancement) ---- */
    body {
      background-color: var(--bg);
      background-image:
        radial-gradient(ellipse 60% 100% at 50% 0%, rgba(124, 156, 255, 0.085) 0%, rgba(124, 156, 255, 0.05) 32%, rgba(124, 156, 255, 0.018) 62%, rgba(124, 156, 255, 0) 100%),
        radial-gradient(ellipse 34% 80% at 84% 0%, rgba(167, 139, 250, 0.05) 0%, rgba(167, 139, 250, 0.018) 55%, rgba(167, 139, 250, 0) 100%);
      background-repeat: no-repeat;
      background-size: 100% 560px;
    }
    .card {
      border-top-color: #2c313a;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 14px 32px -18px rgba(0, 0, 0, 0.65);
    }
    .modal {
      border-top-color: #3d4451;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 28px 64px -16px rgba(0, 0, 0, 0.75);
    }
    @media (min-width: 761px) {
      .bulk-bar { left: 0; right: 0; margin-inline: auto; width: max-content; transform: none; }
    }
    @media (max-width: 760px) {
      body {
        background-image:
          radial-gradient(ellipse 120% 100% at 50% 0%, rgba(124, 156, 255, 0.08) 0%, rgba(124, 156, 255, 0.045) 34%, rgba(124, 156, 255, 0.015) 64%, rgba(124, 156, 255, 0) 100%);
        background-size: 100% 380px;
      }
    }
    @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .topbar {
        background: rgba(11, 12, 15, 0.72);
        border-bottom-color: rgba(255, 255, 255, 0.06);
        -webkit-backdrop-filter: blur(14px) saturate(140%);
        backdrop-filter: blur(14px) saturate(140%);
      }
      .bulk-bar {
        background: rgba(24, 27, 33, 0.78);
        border-color: rgba(255, 255, 255, 0.09);
        -webkit-backdrop-filter: blur(14px) saturate(140%);
        backdrop-filter: blur(14px) saturate(140%);
      }
      .toast {
        background: rgba(24, 27, 33, 0.82);
        border-top-color: rgba(255, 255, 255, 0.09);
        border-right-color: rgba(255, 255, 255, 0.09);
        border-bottom-color: rgba(255, 255, 255, 0.09);
        -webkit-backdrop-filter: blur(14px) saturate(140%);
        backdrop-filter: blur(14px) saturate(140%);
      }
      @media (hover: hover) and (pointer: fine) {
        .modal-backdrop {
          background: rgba(5, 6, 8, 0.58);
          -webkit-backdrop-filter: blur(6px) saturate(120%);
          backdrop-filter: blur(6px) saturate(120%);
        }
      }
    }
    @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
      .topbar { background: var(--bg); border-bottom-color: var(--border); }
      .bulk-bar { background: var(--surface-2); border-color: var(--border-strong); }
      .toast {
        background: var(--surface-2);
        border-top-color: var(--border-strong);
        border-right-color: var(--border-strong);
        border-bottom-color: var(--border-strong);
      }
      .modal-backdrop { background: rgba(5, 6, 8, 0.72); }
      .topbar, .bulk-bar, .toast, .modal-backdrop { -webkit-backdrop-filter: none; backdrop-filter: none; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <span class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4.5-6"/></svg></span>
        <span class="brand-name">agy-check</span>
        <button id="connState" class="conn conn-btn" type="button" title="Live sync status — click to sync now"><span class="dot"></span>Connecting</button>
      </div>
      <div class="top-right">
        <span id="rangeCost" class="cost-pill" title="Estimated API cost for the selected range; updates after every completed turn"><span class="k">24h</span>--</span>
        <div id="acctMenuWrap" class="acct-menu-wrap">
          <button id="btnAcctMenu" class="acct-chip-btn" type="button" aria-haspopup="dialog" aria-expanded="false" hidden>
            <span id="acctMenuDot" class="acct-dot"></span>
            <span id="acctMenuLabel" class="acct-menu-label">--</span>
            <span id="acctMenuTier" class="tier" hidden></span>
            <svg class="acct-chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 6 7.5 9 4.5"/></svg>
          </button>
          <span id="acctStatic" class="acct"><span class="muted">Account</span><span id="acctEmail">--</span><span id="tierBadge" class="tier" hidden></span></span>
          <div id="acctPopover" class="acct-pop" role="dialog" aria-label="Accounts" hidden></div>
        </div>
        <button id="btnPhone" class="btn ghost sm" hidden title="Open this panel on a phone on the same network">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>
          Phone
        </button>
        <button id="btnSyncModal" class="btn ghost sm" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13l-3-3"/><path d="M20 17H7l3 3"/></svg>
          Sync sessions
        </button>
      </div>
    </div>
  </header>

  <main class="app">
    <div id="driftBanner" class="banner">
      <div><strong>Account drift.</strong> <span id="driftText"></span></div>
      <button id="btnDriftSync" class="btn warn">Review &amp; sync</button>
    </div>

    <div class="page-head">
      <div>
        <h1 id="rangeTitle">Last 24 hours</h1>
        <div class="page-sub">Cache efficiency, output speed and quota across every agy session</div>
      </div>
      <div id="rangeSeg" class="seg">
        <button data-range="active">Active</button>
        <button data-range="24h">24h</button>
        <button data-range="today">Today</button>
        <button data-range="7d">7d</button>
        <button data-range="30d">30d</button>
        <button data-range="all">All</button>
      </div>
    </div>

    <section id="kpis" class="card kpis"></section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Quota remaining</div>
            <div id="quotaUpdated" class="card-sub">--</div>
          </div>
          <button id="btnRefreshQuota" class="btn sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>
            <span id="btnRefreshQuotaLabel">Refresh</span>
          </button>
        </div>
        <div id="quotaBody" class="card-body"></div>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Models</div>
            <div class="card-sub">Cost counts turns inside the range; tokens and hit rate cover sessions in range</div>
          </div>
        </div>
        <div id="modelsBody" class="card-body"></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div class="card-title-row"><span class="card-title">Sessions</span><span id="sessCount" class="card-sub"></span></div>
        <div class="toolbar">
          <input id="searchInput" class="field search" type="search" placeholder="Search title, dir, branch, model, ID" />
          <select id="accountFilter" class="field" hidden></select>
          <button id="btnToggleEmpty" class="btn toggle" aria-pressed="false">Show empty</button>
          <button id="btnToggleArchived" class="btn toggle" aria-pressed="false">Show archived</button>
          <button id="btnToggleCost" class="btn toggle" aria-pressed="false">Show cost</button>
          <button id="btnSelectMode" class="btn toggle" type="button" aria-pressed="false">Select</button>
        </div>
      </div>
      <div class="table-scroll">
        <table id="sessTable" class="sessions hide-cost">
          <thead>
            <tr>
              <th class="c-sel"><label class="sel-hit" title="Select all visible sessions"><input id="selectAll" type="checkbox" aria-label="Select all visible sessions" /></label></th>
              <th data-sort="recent" title="Sort by activity">Status<span class="ind"></span></th>
              <th>Session</th>
              <th>Model</th>
              <th class="r" data-sort="turns">Turns<span class="ind"></span></th>
              <th class="r" data-sort="hit" title="Session cache hit rate; last turn below. Click again to reverse.">Cache hit<span class="ind"></span></th>
              <th class="r" data-sort="tokens" title="Prompt tokens; uncached input and output below">Tokens<span class="ind"></span></th>
              <th class="r" title="Context window used">Context</th>
              <th class="r" data-sort="speed" title="Output t/s incl. thinking; visible (net) t/s below. Click again to sort by net.">Speed<span class="ind"></span></th>
              <th class="r" title="Tool time; API time below">Tool</th>
              <th class="r col-cost" data-sort="cost" title="Cost of this session's turns inside the selected range; whole-session total below (today's share for All/Active)">Cost<span class="ind"></span></th>
            </tr>
          </thead>
          <tbody id="sessionsBody">
            <tr><td colspan="11" class="empty">Loading sessions…</td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-foot muted"><span class="kbd-hint">Click a session for turn-by-turn detail · ↑ ↓ to step through sessions · Esc to close · </span>Costs are API-equivalent estimates: every model Antigravity serves (Gemini and 3P such as Opus) is priced at its Google list rate for each turn's time. Antigravity membership usage is not billed per token; models without a known price show as unpriced, never as free.<span id="accessNote"></span></div>
    </section>
  </main>

  <aside id="drawer" class="drawer" aria-hidden="true">
    <div class="drawer-head">
      <div style="min-width:0;flex:1">
        <div id="detailKicker" class="drawer-kicker"></div>
        <div id="detailTitleRow" class="drawer-title-row">
          <h2 id="detailTitle" class="drawer-title">Session</h2>
          <button id="btnRenameTitle" class="btn ghost icon sm-icon" type="button" title="Rename session (F2)" aria-label="Rename session" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
        <form id="renameForm" class="rename-form" hidden>
          <input id="renameInput" class="field rename-input" type="text" maxlength="200" autocomplete="off" aria-label="Session title" />
          <div class="rename-actions">
            <button id="btnRenameSave" class="btn sm primary" type="submit">Save</button>
            <button id="btnRenameCancel" class="btn sm" type="button">Cancel</button>
          </div>
        </form>
        <div id="renameNote" class="rename-note" hidden></div>
        <div id="detailOpsNote" class="ops-note" hidden></div>
      </div>
      <div class="drawer-actions">
        <button id="btnArchiveDetail" class="btn sm" type="button" hidden aria-label="Archive session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
          <span id="btnArchiveDetailLabel" class="act-label">Archive</span>
        </button>
        <span id="detailDeleteWrap" class="ops-wrap" hidden>
          <button id="btnDeleteDetail" class="btn sm danger" type="button" aria-label="Delete session permanently">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            <span class="act-label">Delete</span>
          </button>
        </span>
        <button id="btnCopyResume" class="btn sm" aria-label="Copy resume command">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          <span id="btnCopyResumeLabel">Copy<span class="copy-long"> resume command</span></span>
        </button>
        <button id="btnCloseDetail" class="btn ghost icon" title="Close (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div id="drawerBody" class="drawer-body">
      <div id="detailChips" class="chips"></div>
      <div id="detailStats" class="stats"></div>
      <div id="detailChart" class="chart-wrap"></div>
      <div class="turns-head">Turns <span class="muted">· newest first</span></div>
      <table class="turns">
        <thead>
          <tr>
            <th>Turn</th>
            <th>Time</th>
            <th class="r">Gap</th>
            <th>Model</th>
            <th class="r">Uncached</th>
            <th class="r">Cache read</th>
            <th class="r">Output</th>
            <th class="r">Cost</th>
            <th class="r">Hit</th>
            <th>Miss diagnosis</th>
          </tr>
        </thead>
        <tbody id="detailTurnsBody"></tbody>
      </table>
    </div>
  </aside>

  <div id="bulkBar" class="bulk-bar" role="region" aria-label="Bulk session actions" hidden>
    <div class="bulk-head">
      <span id="bulkCount" class="bulk-count">0 selected</span>
      <button id="btnBulkSelectAll" class="btn sm ghost" type="button" aria-label="Select all visible sessions">Select all</button>
      <button id="btnBulkClear" class="btn sm ghost" type="button" aria-label="Exit selection mode">Done</button>
    </div>
    <div class="bulk-actions">
      <button id="btnBulkArchive" class="btn sm" type="button" aria-label="Archive selected sessions">Archive</button>
      <button id="btnBulkUnarchive" class="btn sm" type="button" aria-label="Unarchive selected sessions">Unarchive</button>
      <span id="bulkDeleteWrap" class="ops-wrap">
        <button id="btnBulkDelete" class="btn sm danger" type="button" aria-label="Delete selected sessions permanently">Delete</button>
      </span>
    </div>
  </div>

  <div id="opToast" class="toast" role="status" aria-live="polite" hidden>
    <div id="opToastBody" class="toast-body"></div>
    <button id="btnToastClose" class="btn ghost icon sm-icon" type="button" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <div id="deleteModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="deleteModalTitle">
    <div class="modal">
      <h2 id="deleteModalTitle">Permanently delete session</h2>
      <div id="deleteWarn" class="del-warn"></div>
      <ul id="deleteList" class="del-list"></ul>
      <div id="deleteConfirmWrap">
        <label for="deleteConfirmInput" class="del-confirm-label">Type <code>DELETE</code> to confirm permanent deletion</label>
        <input id="deleteConfirmInput" class="field del-input" type="text" autocomplete="off" spellcheck="false" placeholder="DELETE" aria-label="Type DELETE to confirm" />
      </div>
      <label id="deleteCloseRow" class="check-row" hidden>
        <input id="deleteCloseCheck" type="checkbox" />
        <span id="deleteCloseLabel">Close these open agy window(s) and permanently delete the selected session(s)</span>
      </label>
      <div id="deleteStatus" class="del-status" role="status"></div>
      <div id="deleteHandoff" class="handoff" hidden></div>
      <ul id="deleteResults" class="del-list" hidden></ul>
      <div class="modal-actions">
        <button id="btnDeleteCancel" class="btn" type="button">Cancel</button>
        <button id="btnDeleteConfirm" class="btn danger solid" type="button" disabled>Delete permanently</button>
      </div>
    </div>
  </div>

  <div id="lanModal" class="modal-backdrop">
    <div class="modal">
      <h2>Open on a phone</h2>
      <p>On the phone, open one of these addresses and enter the pairing code. A paired phone stays signed in for 30 days and can view this panel, refresh quota, rename, archive and delete sessions; account sync stays on this Mac.</p>
      <div id="lanLinks" class="lan-links"></div>
      <div class="pair-code-box">
        <div class="muted small">Pairing code</div>
        <div id="pairCode" class="pair-code">------</div>
        <div id="pairExpiry" class="muted small"></div>
      </div>
      <p id="pairDevices" class="muted small"></p>
      <div class="modal-actions">
        <button id="btnRevokeDevices" class="btn">Sign out all phones</button>
        <button id="btnNewCode" class="btn">New code</button>
        <button id="btnLanClose" class="btn primary">Done</button>
      </div>
    </div>
  </div>

  <div id="syncModal" class="modal-backdrop">
    <div class="modal">
      <h2>Sync stale agy sessions with the active Keychain account</h2>
      <p>
        <code>agy-sync-keychain.sh</code> restarts managed <code>agy</code> sessions in-place on the same tab, closes empty owned tabs cleanly, and stops any unmanaged interactive <code>agy</code> processes (leaving their shells open) while reopening non-empty conversations in new managed tabs.
      </p>
      <div id="syncPreviewSummary" class="modal-summary"></div>
      <div id="syncRawOutput" class="pre-box">Loading dry-run preview…</div>
      <div id="syncExecStatus" class="modal-status"></div>
      <div class="modal-actions">
        <button id="btnSyncCancel" class="btn">Close</button>
        <button id="btnSyncConfirm" class="btn primary" disabled>Confirm &amp; sync</button>
      </div>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const LOCAL_VAULT_TOKEN = document.querySelector('meta[name="agy-local-token"]')?.getAttribute('content') || '';
    const SESSION_COLS = 11;
    const PREFS_KEY = 'agy-check.panel.prefs.v2';
    const RANGES = { active: 'Active sessions', '24h': 'Last 24 hours', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' };
    const RANGE_COST_UNIT = { active: 'active sessions', '24h': 'last 24h', today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', all: 'all time' };
    const RANGE_PILL = { active: 'Active', '24h': '24h', today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All time' };
    const COST_WINDOW = { '24h': 'last24h', today: 'today', '7d': 'last7d', '30d': 'last30d' };
    const SORTS = ['recent', 'hit_asc', 'hit_desc', 'speed_out_desc', 'speed_net_desc', 'tokens_desc', 'turns_desc', 'cost_desc'];
    const STATUS_LABEL = { generating: 'Generating', running: 'Running', recent: 'Recent', idle: 'Idle' };
    const CHART = { ok: '#4cc38a', warn: '#e9a23b', bad: '#f0646a', grid: '#262a31', text: '#7c8491', violet: '#a78bfa' };

    const state = {
      range: '24h',
      sort: 'recent',
      query: '',
      account: 'all',
      showCost: true,
      showEmpty: false,
      showArchived: false,
      selectMode: false,
      selectedId: null,
      checkedIds: new Set(),
      ops: { archiveAvailable: true, deleteAvailable: false, endpointCount: 0, handoffCommand: 'agy-check panel handoff' },
      delModal: null,
      opsBusy: false,
      vaultBusy: false,
      acctMenuOpen: false,
      acctMenuKey: '',
      acctInline: null,
      acctSignInConfirm: false,
      overview: null,
      detail: null,
    };

    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (RANGES[prefs.range]) state.range = prefs.range;
      if (SORTS.includes(prefs.sort)) state.sort = prefs.sort;
      state.showEmpty = prefs.showEmpty === true;
      state.showArchived = prefs.showArchived === true;
      state.showCost = prefs.showCost !== false;
    } catch {}

    function savePrefs() {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({
          range: state.range,
          sort: state.sort,
          showEmpty: state.showEmpty,
          showArchived: state.showArchived,
          showCost: state.showCost,
        }));
      } catch {}
    }

    function esc(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fmtTok(n) {
      const v = Number(n || 0);
      if (v >= 999950) return (v / 1e6).toFixed(1).replace(/\\.0$/, '') + 'M';
      if (v >= 999.5) return (v / 1e3).toFixed(1).replace(/\\.0$/, '') + 'k';
      return String(Math.round(v));
    }

    function fmtInt(n) {
      return Number(n || 0).toLocaleString('en-US');
    }

    function fmtPct(v) {
      return typeof v === 'number' ? v.toFixed(1) + '%' : '--';
    }

    function fmtUsd(v) {
      const n = Number(v || 0);
      if (n <= 0) return '$0.00';
      if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (n >= 0.1) return '$' + n.toFixed(3);
      return '$' + n.toFixed(4);
    }

    function fmtRel(ms) {
      if (!ms) return '--';
      const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    function fmtStamp(ms) {
      return ms ? new Date(ms).toLocaleString('en-GB', { hour12: false }) : '';
    }

    function fmtGap(ms) {
      if (ms === null || ms === undefined) return '--';
      const sec = Math.round(ms / 1000);
      if (sec < 60) return sec + 's';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (m < 60) return s > 0 ? m + 'm' + s + 's' : m + 'm';
      const h = Math.floor(m / 60);
      return h + 'h' + (m % 60) + 'm';
    }

    function fmtDur(ms) {
      if (ms === null || ms === undefined) return '--';
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h > 0 ? h + 'h' + m + 'm' : m + 'm' + (s % 60) + 's';
    }

    function hitTone(v) {
      if (typeof v !== 'number') return 'muted';
      if (v >= 80) return 'ok';
      if (v >= 50) return 'warn';
      return 'bad';
    }

    function quotaTone(v) {
      if (v <= 10) return 'bad';
      if (v <= 30) return 'warn';
      return 'ok';
    }

    function meter(pct, tone, cls) {
      const w = Math.max(0, Math.min(100, Number(pct) || 0));
      return '<div class="meter' + (cls ? ' ' + cls : '') + '"><span class="' + (tone || 'ok') + '" style="width:' + w + '%"></span></div>';
    }

    // Joins HTML parts with " · " so wrapped lines break only between parts, never inside one.
    function segs(parts) {
      return parts.filter(Boolean).map(p => '<span class="nw">' + p + '</span>').join('&nbsp;· ');
    }

    function statusOf(s) {
      return STATUS_LABEL[s && s.status] ? s.status : 'idle';
    }

    function speedParts(sp) {
      const s = sp || {};
      return {
        out: typeof s.totalSpeed === 'number' ? s.totalSpeed.toFixed(1) : null,
        net: typeof s.visibleSpeed === 'number' ? s.visibleSpeed.toFixed(1) : null,
        avgOut: typeof s.avgTotalSpeed === 'number' ? s.avgTotalSpeed.toFixed(1) : null,
        avgNet: typeof s.avgVisibleSpeed === 'number' ? s.avgVisibleSpeed.toFixed(1) : null,
        source: s.source || null,
      };
    }

    // ---------- Overview ----------

    function renderOverview(data) {
      state.overview = data;
      updateConnTitle();
      handleUiHash(data.uiHash);
      if (data.ops) state.ops = data.ops;
      const auth = data.auth || {};
      const quota = data.quota || {};
      const summary = data.summary || {};
      const vault = data.vault || null;
      renderTopbar(auth, quota, summary, vault);
      state.lanUrls = data.lan?.urls || [];
      $('btnPhone').hidden = !data.lan;
      const expiresAt = data.viewer && data.viewer.local === false ? data.viewer.accessExpiresAt : null;
      $('accessNote').textContent = expiresAt
        ? ' · This device is signed in until ' + new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '.'
        : '';
      renderBanner(auth, summary);
      $('rangeTitle').textContent = RANGES[state.range] || state.range;
      $('rangeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.range === state.range));
      renderKpis(summary);
      renderQuota(quota, data.accounts || [], vault);
      renderModels(summary.byModel || [], summary.cost?.byModel || {});
      renderSessions(data, summary);
      if (state.acctMenuOpen) {
        const nextKey = computeVaultMenuKey(vault);
        if (nextKey !== state.acctMenuKey) {
          state.acctMenuKey = nextKey;
          renderAcctPopover();
        }
      }
      if (state.detail && $('drawer').classList.contains('open')) {
        renderDetailOps(state.detail);
      }
    }

    function shortTierLabel(tier) {
      if (!tier) return '';
      const s = String(tier).trim();
      if (/ultra/i.test(s)) return 'Ultra';
      if (/pro/i.test(s)) return 'Pro';
      if (/free/i.test(s)) return 'Free';
      return s.length > 12 ? s.slice(0, 12) : s;
    }

    function emailLocalPart(email) {
      if (!email) return '';
      const at = String(email).indexOf('@');
      return at > 0 ? String(email).slice(0, at) : String(email);
    }

    function canManageVault(vault) {
      return Boolean(vault && vault.supported && LOCAL_VAULT_TOKEN);
    }

    function computeVaultMenuKey(vault) {
      if (!vault) return '';
      const list = (vault.accounts || []).map(a => a.email + ':' + a.status + ':' + (a.hasRefreshToken ? 1 : 0)).join('|');
      return (vault.activeEmail || '') + '|' + (vault.activeSaved ? 1 : 0) + '|' + (vault.activeExpired ? 1 : 0) + '|' + list;
    }

    function renderTopbar(auth, quota, summary, vault = null) {
      const emailText = auth.activeEmail
        ? auth.activeEmail + (auth.expired ? ' (expired)' : '')
        : (auth.loggedIn ? 'Signed in' : 'Not logged in');
      $('acctEmail').textContent = emailText;
      $('acctEmail').className = auth.expired ? 't-bad' : (auth.loggedIn ? '' : 't-warn');
      $('tierBadge').hidden = !quota.tier;
      $('tierBadge').textContent = quota.tier || '';

      const interactive = canManageVault(vault);
      $('btnAcctMenu').hidden = !interactive;
      $('acctStatic').hidden = interactive;
      if (interactive) {
        const active = vault.activeEmail || auth.activeEmail || null;
        const unsaved = Boolean(active && !vault.activeSaved);
        const dot = $('acctMenuDot');
        dot.className = 'acct-dot' + (!active ? ' muted' : ((unsaved || auth.expired) ? ' warn' : ''));
        $('acctMenuLabel').textContent = active ? emailLocalPart(active) : 'Sign in';
        const shortTier = shortTierLabel(quota.tier);
        $('acctMenuTier').hidden = !shortTier;
        $('acctMenuTier').textContent = shortTier;
        const aria = active
          ? active + (unsaved ? ' (not saved in vault)' : '') + (auth.expired ? ' (refresh needed)' : '') + ' — manage accounts'
          : 'Not signed in — manage accounts';
        $('btnAcctMenu').title = aria;
        $('btnAcctMenu').setAttribute('aria-label', aria);
      } else if (state.acctMenuOpen) {
        closeAcctPopover(false);
      }

      const syncBtn = $('btnSyncModal');
      syncBtn.hidden = !auth.syncBridgeAvailable;
      syncBtn.className = 'btn sm ' + ((summary.unsyncedCount || 0) > 0 ? 'warn' : 'ghost');
      $('quotaUpdated').textContent = quota.lastRefreshed ? 'Updated ' + fmtRel(quota.lastRefreshed) : 'Not cached yet';
      $('rangeCost').innerHTML = '<span class="k">' + (RANGE_PILL[state.range] || '') + '</span>' + fmtUsd(summary.cost?.range);
    }

    function renderBanner(auth, summary) {
      const n = summary.unsyncedCount || 0;
      $('driftBanner').classList.toggle('show', n > 0);
      $('btnDriftSync').hidden = !auth.syncBridgeAvailable;
      if (n > 0) {
        $('driftText').textContent = n + ' running agy session(s) still hold an older account while Keychain is now ' +
          (auth.activeEmail || 'a different account') +
          '. Avoid prompting in those tabs until synced, or they may overwrite Keychain backwards.';
      }
    }

    function kpi(label, value, sub, extra, title) {
      return '<div class="kpi"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
        '<div class="kpi-label">' + label + '</div>' +
        '<div class="kpi-value">' + value + '</div>' +
        (extra || '') +
        '<div class="kpi-sub">' + sub + '</div>' +
      '</div>';
    }

    function renderKpis(summary) {
      const wHit = summary.weightedHitRate;
      const avgOut = typeof summary.avgOutSpeed === 'number' ? summary.avgOutSpeed.toFixed(1) : '--';
      const avgNet = typeof summary.avgNetSpeed === 'number' ? summary.avgNetSpeed.toFixed(1) : '--';
      const unsynced = summary.unsyncedCount || 0;
      const cost = summary.cost || {};
      $('kpis').innerHTML = [
        kpi('Cache hit rate',
          '<span class="t-' + hitTone(wHit) + '">' + fmtPct(wHit) + '</span>',
          segs([fmtTok(summary.totalCacheRead) + ' / ' + fmtTok(summary.totalPrompt) + ' read', fmtInt(summary.totalMissTurns) + ' misses']),
          typeof wHit === 'number' ? meter(wHit, hitTone(wHit), 'kpi-meter') : ''),
        kpi('Sessions',
          fmtInt(summary.sessionCount) + '<span class="unit">of ' + fmtInt(summary.totalSessionsAll) + '</span>',
          segs([fmtInt(summary.runningCount) + ' running', fmtInt(summary.totalTurns) + ' turns',
            unsynced > 0 ? '<span class="t-warn">' + unsynced + ' unsynced</span>' : ''])),
        kpi('Output speed',
          avgOut + '<span class="unit">t/s</span>',
          segs(['Net ' + avgNet + ' t/s', 'visible text only']),
          '',
          'out: total output incl. thinking | net: visible output excl. thinking'),
        kpi('Tokens',
          fmtTok((summary.totalPrompt || 0) + (summary.totalOutput || 0)),
          segs([fmtTok(summary.totalCacheRead) + ' cache', fmtTok(summary.totalUncachedInput) + ' unc', fmtTok(summary.totalOutput) + ' out'])),
        kpi('Est. API cost',
          fmtUsd(cost.range) + '<span class="unit">' + (RANGE_COST_UNIT[state.range] || '') + '</span>',
          '<div class="cost-ladder">' + [
            ['today', 'Today', cost.today],
            ['7d', '7 days', cost.last7d],
            ['30d', '30 days', cost.last30d],
            ['month', 'This month', cost.month],
          ].map(([key, label, v]) => '<span class="' + (key === state.range ? 'on' : '') + '"><span>' + label + '</span>' + fmtUsd(v) + '</span>').join('') + '</div>' +
            (cost.unpricedTurns > 0 ? '<div class="kpi-note t-warn">' + fmtInt(cost.unpricedTurns) + ' turns on unpriced models excluded</div>' : ''),
          '',
          'API-equivalent estimate: every model Antigravity serves (Gemini and 3P such as Opus) is priced at its Google list rate in effect when each turn ran.'),
      ].join('');
    }

    function quotaRow(label, win) {
      if (!win) {
        return '<div class="qrow"><div class="qrow-top"><span>' + label + '</span><span class="qpct t-muted">n/a</span></div>' +
          meter(0, 'ok') + '<div class="qrow-foot">Not reported</div></div>';
      }
      const tone = quotaTone(win.percent);
      const foot = win.resetIn
        ? 'Resets in ' + esc(win.resetIn)
        : (win.percent === 100 ? 'Full · starts on use' : '&nbsp;');
      return '<div class="qrow"><div class="qrow-top"><span>' + label + '</span><span class="qpct t-' + tone + '">' + win.percent + '%</span></div>' +
        meter(win.percent, tone) +
        '<div class="qrow-foot">' + foot + '</div></div>';
    }

    function renderQuota(quota, accounts, vault = null) {
      const providers = quota.providers || [];
      let html;
      if (providers.length === 0 || (quota.unavailableReason && providers.every(p => !p.fiveHour && !p.weekly))) {
        html = '<div class="t-warn">Quota unavailable' + (quota.unavailableReason ? ': ' + esc(quota.unavailableReason) : '') + '</div>';
      } else {
        html = '<div class="providers">' + providers.map(p =>
          '<div class="prov"><div class="prov-name">' + esc(p.label) + '</div>' +
          quotaRow('5-hour window', p.fiveHour) +
          quotaRow('Weekly', p.weekly) +
          '</div>').join('') + '</div>';
      }

      if (accounts.length > 1) {
        html += '<div class="acct-list">' + accounts.map(a => {
          const g = (a.quota?.providers || []).find(p => p.key === 'google');
          const c = (a.quota?.providers || []).find(p => p.key === 'claude');
          const gStr = 'Gemini ' + (g?.fiveHour ? g.fiveHour.percent + '%' : '--');
          const cStr = '3P ' + (c?.fiveHour ? c.fiveHour.percent + '%' : '--');
          return '<div class="acct-row"><span class="dot ' + (a.isActive ? 'live' : '') + '"></span>' +
            '<span class="acct-email">' + esc(a.email) + '</span>' +
            '<span class="acct-q">' + esc(gStr + ' · ' + cStr) + '</span>' +
            '<span class="muted push">' + esc(fmtRel(a.lastRefreshed)) + '</span></div>';
        }).join('') + '</div>';
      }

      if (canManageVault(vault)) {
        const savedCount = (vault.accounts || []).length;
        const parts = [savedCount + ' saved'];
        if (vault.activeEmail && !vault.activeSaved) parts.push('current unsaved');
        const refreshCnt = (vault.accounts || []).filter(a => !a.isActive && a.expired).length;
        if (refreshCnt > 0) parts.push(refreshCnt + ' refresh needed');
        html += '<div class="quota-vault-foot">' +
          '<span>' + esc(parts.join(' · ')) + '</span>' +
          '<button class="link-btn" type="button" data-open-acct-menu="1">Manage ↗</button>' +
        '</div>';
      }

      $('quotaBody').innerHTML = html;
    }

    function renderModels(byModel, costByModel) {
      if (byModel.length === 0) {
        $('modelsBody').innerHTML = '<div class="muted">No model activity in this range.</div>';
        return;
      }
      const rows = byModel.slice().sort((a, b) => (b.totalPrompt || 0) - (a.totalPrompt || 0)).slice(0, 6);
      $('modelsBody').innerHTML =
        '<table class="mtable"><thead><tr>' +
          '<th>Model</th><th class="r">Sessions</th><th class="r">Turns</th><th class="r">Input</th><th class="r">Cost</th><th class="hitcol">Cache hit</th>' +
        '</tr></thead><tbody>' +
        rows.map(m => {
          const tone = hitTone(m.hitRate);
          return '<tr>' +
            '<td>' + esc(m.modelLabel) + '</td>' +
            '<td class="r">' + fmtInt(m.sessions) + '</td>' +
            '<td class="r">' + fmtInt(m.turns) + '</td>' +
            '<td class="r">' + fmtTok(m.totalPrompt) + '</td>' +
            '<td class="r">' + (m.unpricedTurns >= m.turns
              ? '<span class="t-muted" title="No known price for this model">unpriced</span>'
              : fmtUsd(costByModel[m.model] ?? m.estimatedCostUsd) + (m.unpricedTurns > 0 ? '<span class="t-warn" title="' + m.unpricedTurns + ' unpriced turns"> *</span>' : '')) + '</td>' +
            '<td class="hitcol"><div class="hitbar">' + meter(m.hitRate ?? 0, tone) + '<span class="t-' + tone + '">' + fmtPct(m.hitRate) + '</span></div></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>' +
        (byModel.length > 6 ? '<div class="more muted">+' + (byModel.length - 6) + ' more models</div>' : '');
    }

    // ---------- Sessions table ----------

    let acctOptionsKey = '';
    function updateAccountFilter(accounts, sessions, summary) {
      const emails = new Set();
      for (const a of accounts) if (a.email) emails.add(a.email);
      for (const s of sessions) if (s.accountEmail) emails.add(s.accountEmail);
      const list = Array.from(emails).sort();
      const unsynced = summary.unsyncedCount || 0;
      const sel = $('accountFilter');
      // A single account with nothing unsynced has nothing to filter.
      sel.hidden = list.length <= 1 && unsynced === 0 && state.account === 'all';
      const key = list.join('|') + '#' + unsynced;
      if (key !== acctOptionsKey) {
        acctOptionsKey = key;
        sel.innerHTML =
          '<option value="all">All accounts</option>' +
          '<option value="unsynced">Unsynced only (' + unsynced + ')</option>' +
          list.map(e => '<option value="' + esc(e) + '">' + esc(e) + '</option>').join('');
      }
      sel.value = Array.from(sel.options).some(o => o.value === state.account) ? state.account : 'all';
    }

    function sortGroup(sort) {
      if (sort.startsWith('hit_')) return 'hit';
      if (sort.startsWith('speed_')) return 'speed';
      return sort.replace(/_desc$/, '');
    }

    function nextSort(key) {
      if (key === 'hit') return state.sort === 'hit_desc' ? 'hit_asc' : 'hit_desc';
      if (key === 'speed') return state.sort === 'speed_out_desc' ? 'speed_net_desc' : 'speed_out_desc';
      if (key === 'recent') return 'recent';
      return key + '_desc';
    }

    function updateSortHeaders() {
      const group = sortGroup(state.sort);
      document.querySelectorAll('#sessTable th[data-sort]').forEach(th => {
        const on = th.dataset.sort === group;
        th.classList.toggle('sorted', on);
        let ind = '';
        if (on) {
          ind = state.sort === 'hit_asc' ? '↑' : '↓';
          if (group === 'speed') ind += state.sort === 'speed_net_desc' ? ' net' : ' out';
        }
        th.querySelector('.ind').textContent = ind;
      });
    }

    function costCell(s) {
      const unpriced = s.unpricedTurnCount || 0;
      if (s.turnsCount > 0 && unpriced >= s.turnsCount) {
        return '<div class="v t-muted" title="No known price for this model">unpriced</div>';
      }
      const win = COST_WINDOW[state.range];
      const value = win ? (s.costPeriods?.[win] || 0) : s.estimatedCostUsd;
      const note = win ? 'total ' + fmtUsd(s.estimatedCostUsd) : 'today ' + fmtUsd(s.costPeriods?.today);
      const partial = unpriced > 0
        ? ' <span class="t-warn" title="' + unpriced + ' turn(s) on models without a known price">partial</span>'
        : '';
      return '<div class="v">' + fmtUsd(value) + '</div><div class="s">' + note + partial + '</div>';
    }

    function isSelectableSession(s) {
      return Boolean(s && s.conversationId && !String(s.conversationId).startsWith('pid-') && (s.canArchive !== false || s.canDelete !== false));
    }

    function opsState() {
      return state.overview?.ops || state.ops;
    }

    function handoffCmd() {
      return opsState().handoffCommand || 'agy-check panel handoff';
    }

    function deleteBlockedTip() {
      return 'Permanent delete needs a live agy API connection. Ask an agy agent to run: ' + handoffCmd();
    }

    function handoffHtml(cmd) {
      const c = cmd || handoffCmd();
      return '<span>In any open agy window, ask the agent to run</span> <code>' + esc(c) + '</code> ' +
        '<button class="btn sm" type="button" data-copy-handoff="' + esc(c) + '">Copy</button>';
    }

    function sessionRow(s) {
      const st = statusOf(s);
      const selectable = isSelectableSession(s);
      const checked = selectable && state.checkedIds.has(s.conversationId);
      const syncPill = s.syncStatus === 'unsynced'
        ? '<span class="pill warn" title="Running process holds an older account">unsynced</span>'
        : (s.syncStatus === 'other_account' && s.accountEmail
          ? '<span class="pill" title="' + esc(s.accountEmail) + '">' + esc(s.accountEmail.split('@')[0]) + '</span>'
          : '');
      const archPill = s.archived ? '<span class="pill">archived</span>' : '';
      const meta = segs([
        s.shortId,
        s.currentDir,
        s.branch,
        s.pid ? 'pid ' + s.pid : '',
        !s.hasTranscript && s.steps > 0 ? s.steps + ' steps (summary only)' : '',
      ].map(v => v && esc(v)));

      const hit = s.sessionHitRate;
      const hitCell = typeof hit === 'number'
        ? '<div class="hit">' + meter(hit, hitTone(hit), 'sm') + '<span class="v t-' + hitTone(hit) + '">' + fmtPct(hit) + '</span></div>' +
          '<div class="s">last ' + fmtPct(s.lastTurnHitRate) + '</div>'
        : '<div class="v t-muted">--</div>';

      const ctx = s.contextWindow && typeof s.contextWindow.usedPercentage === 'number' ? s.contextWindow.usedPercentage : null;
      const ctxCell = ctx === null
        ? '<div class="v t-muted">--</div>'
        : '<div class="v">' + Math.round(ctx) + '%</div>' + meter(ctx, ctx >= 80 ? 'warn' : 'info', 'xs');

      const sp = speedParts(s.speed);
      const speedTip = [
        sp.out !== null ? 'out (incl. thinking): ' + sp.out + ' t/s' : '',
        sp.net !== null ? 'net (visible): ' + sp.net + ' t/s' : '',
        sp.avgOut !== null ? 'session avg: out ' + sp.avgOut + ' / net ' + (sp.avgNet ?? '--') + ' t/s' : '',
        sp.source ? 'source: ' + sp.source : '',
      ].filter(Boolean).join(' | ');
      const speedCell = sp.out === null && sp.net === null
        ? '<div class="v t-muted">--</div>'
        : '<div class="v">' + (sp.out ?? '--') + '</div><div class="s">net ' + (sp.net ?? '--') + '</div>';

      const tokTip = 'Prompt ' + fmtInt(s.totalPrompt) + ' = cache ' + fmtInt(s.totalCacheRead) +
        ' + uncached ' + fmtInt(s.totalUncachedInput) + ' | output ' + fmtInt(s.totalOutput);
      const rowCls = [
        state.selectedId === s.conversationId ? 'selected' : '',
        checked ? 'checked' : '',
        s.archived ? 'archived' : '',
        s.syncStatus === 'unsynced' ? 'unsynced' : '',
      ].filter(Boolean).join(' ');

      const selCell = selectable
        ? '<td class="c-sel"><label class="sel-hit"><input class="row-check" type="checkbox" data-check-id="' + esc(s.conversationId) + '" aria-label="Select ' + esc(s.title || s.shortId) + '"' + (checked ? ' checked' : '') + ' /></label></td>'
        : '<td class="c-sel"></td>';

      return '<tr class="' + rowCls + '" data-id="' + esc(s.conversationId) + '">' +
        selCell +
        '<td class="c-status"><div class="status"><span class="dot ' + st + '"></span>' + STATUS_LABEL[st] + syncPill + archPill + '</div>' +
          '<div class="s" title="' + esc(fmtStamp(s.lastActivityMs)) + '">' + fmtRel(s.lastActivityMs) + '</div></td>' +
        '<td class="col-session c-session"><div class="title" title="' + esc(s.title) + '">' + esc(s.title || s.shortId) + '</div>' +
          '<div class="meta">' + meta + '</div></td>' +
        '<td class="c-model"><div class="v model">' + esc(s.modelLabel || '--') + '</div></td>' +
        '<td class="r c-turns" data-label="Turns"><div class="v">' + fmtInt(s.turnsCount) + '</div>' +
          (s.missTurnCount > 0 ? '<div class="s t-warn" title="Turns with a diagnosed cache miss">' + s.missTurnCount + ' miss</div>' : '') + '</td>' +
        '<td class="r c-hit" data-label="Cache hit">' + hitCell + '</td>' +
        '<td class="r c-tokens" data-label="Tokens" title="' + esc(tokTip) + '"><div class="v">' + fmtTok(s.totalPrompt) + '</div>' +
          '<div class="s">' + segs([fmtTok(s.totalUncachedInput) + ' unc', fmtTok(s.totalOutput) + ' out']) + '</div></td>' +
        '<td class="r c-ctx" data-label="Context">' + ctxCell + '</td>' +
        '<td class="r c-speed" data-label="Speed t/s" title="' + esc(speedTip) + '">' + speedCell + '</td>' +
        '<td class="r c-tool" data-label="Tool"><div class="v">' + (s.toolDurationMs ? fmtDur(s.toolDurationMs) : '--') + '</div>' +
          (s.apiDurationMs ? '<div class="s">api ' + fmtDur(s.apiDurationMs) + '</div>' : '') + '</td>' +
        '<td class="r col-cost c-cost">' + costCell(s) + '</td>' +
      '</tr>';
    }

    function renderSessions(data, summary) {
      const sessions = data.sessions || [];
      $('sessCount').textContent = fmtInt(sessions.length) + ' shown · ' + fmtInt(summary.totalSessionsAll) + ' total';
      const hiddenEmpty = summary.hiddenEmptyCount || 0;
      $('btnToggleEmpty').textContent = 'Show empty' + (!state.showEmpty && hiddenEmpty > 0 ? ' (' + hiddenEmpty + ')' : '');
      $('btnToggleEmpty').setAttribute('aria-pressed', String(state.showEmpty));
      const archivedCount = summary.archivedCount || 0;
      $('btnToggleArchived').textContent = 'Show archived' + (archivedCount > 0 ? ' (' + archivedCount + ')' : '');
      $('btnToggleArchived').setAttribute('aria-pressed', String(state.showArchived));
      $('btnToggleCost').setAttribute('aria-pressed', String(state.showCost));
      $('sessTable').classList.toggle('hide-cost', !state.showCost);
      $('sessTable').classList.toggle('select-mode', state.selectMode);
      $('btnSelectMode').setAttribute('aria-pressed', String(state.selectMode));
      $('btnSelectMode').textContent = state.selectMode ? 'Done' : 'Select';
      updateAccountFilter(data.accounts || [], sessions, summary);
      updateSortHeaders();

      const visibleSelectable = new Set(sessions.filter(isSelectableSession).map(s => s.conversationId));
      for (const id of Array.from(state.checkedIds)) {
        if (!visibleSelectable.has(id)) state.checkedIds.delete(id);
      }

      $('sessionsBody').innerHTML = sessions.length === 0
        ? '<tr><td colspan="' + (state.selectMode ? SESSION_COLS : SESSION_COLS - 1) + '" class="empty">No sessions match the current filter.</td></tr>'
        : sessions.map(sessionRow).join('');
      updateBulkBar();
    }

    function markSelectedRow() {
      document.querySelectorAll('#sessionsBody > tr[data-id]').forEach(tr => {
        tr.classList.toggle('selected', tr.dataset.id === state.selectedId);
      });
    }

    // ---------- Detail drawer ----------

    function chip(label, value, opts = {}) {
      const cls = ['chip', opts.mono ? 'mono' : '', opts.tone || ''].filter(Boolean).join(' ');
      return '<span class="' + cls + '" title="' + esc(opts.copy ? 'Click to copy: ' + value : value) + '"' +
        (opts.copy ? ' data-copy="' + esc(value) + '"' : '') + '>' +
        '<span class="k">' + esc(label) + '</span>' + esc(value) + '</span>';
    }

    function stat(label, value, tone) {
      return '<div class="stat"><div class="stat-label">' + label + '</div>' +
        '<div class="stat-value' + (tone ? ' t-' + tone : '') + '">' + value + '</div></div>';
    }

    function renderTurnChart(turns, d) {
      if (!turns || turns.length === 0) {
        if (d && String(d.conversationId || '').startsWith('pid-')) {
          return '<div class="chart-empty">Live idle agy window: no conversation started yet.</div>';
        }
        if (d && d.hasTranscript === false) {
          return '<div class="chart-empty">Historical summary from conversation_summaries.db (' + (d.steps || 0) + ' steps); transcript.jsonl is not on disk.</div>';
        }
        return '<div class="chart-empty">No PLANNER_RESPONSE turns recorded in transcript.jsonl yet.</div>';
      }
      const n = turns.length;
      const axisW = 40;
      const padIn = 6;
      const padR = 8;
      const padT = 20;
      const chartH = 150;
      // Fit bars to the drawer width; only very long sessions scroll sideways, with the % axis pinned.
      const wrap = $('detailChart');
      const wrapStyle = getComputedStyle(wrap);
      const avail = Math.max(240, wrap.clientWidth - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight)) - axisW;
      const slot = Math.max(3, Math.min(56, (avail - padIn - padR) / n));
      const gap = slot >= 12 ? 4 : 1;
      const barW = Math.max(1, Math.min(36, slot - gap));
      const width = Math.max(avail, Math.ceil(padIn + n * slot + padR));
      const height = padT + chartH + 26;
      const labelEvery = Math.max(1, Math.ceil(30 / slot));
      const yOf = (p) => padT + chartH - (p / 100) * chartH;

      const axis = [0, 50, 100].map(p =>
        '<text x="' + (axisW - 8) + '" y="' + (yOf(p) + 3.5) + '" fill="' + CHART.text + '" font-size="10.5" text-anchor="end">' + p + '%</text>'
      ).join('') +
        '<text x="' + (axisW - 8) + '" y="' + (yOf(80) + 3.5) + '" fill="' + CHART.ok + '" font-size="10.5" text-anchor="end">80%</text>';
      const grid = [0, 50, 100].map(p =>
        '<line x1="0" y1="' + yOf(p) + '" x2="' + (width - padR) + '" y2="' + yOf(p) + '" stroke="' + CHART.grid + '" />'
      ).join('') +
        '<line x1="0" y1="' + yOf(80) + '" x2="' + (width - padR) + '" y2="' + yOf(80) + '" stroke="' + CHART.ok + '" stroke-opacity="0.45" stroke-dasharray="4,4" />';

      const bars = turns.map((t, idx) => {
        const rate = typeof t.hitRate === 'number' ? t.hitRate : 0;
        const x = padIn + idx * slot + (slot - barW) / 2;
        const cx = x + barW / 2;
        const h = Math.max(2, (rate / 100) * chartH);
        const fill = CHART[hitTone(rate)] || CHART.bad;
        const reasons = t.missReasons || [];
        const marker = reasons.some(r => r.code === 'model_switch')
          ? '<circle cx="' + cx + '" cy="' + (padT - 10) + '" r="3.5" fill="' + CHART.violet + '" />'
          : (reasons.some(r => r.code === 'ttl_gap')
            ? '<circle cx="' + cx + '" cy="' + (padT - 10) + '" r="3" fill="none" stroke="' + CHART.warn + '" stroke-width="1.8" />'
            : '');
        const tip = 'Turn #' + t.turnIndex + ' (step ' + (t.stepIndex ?? '?') + '): ' + fmtPct(t.hitRate) + ' | ' + t.modelLabel +
          ' | cache ' + fmtTok(t.cacheReadTokens) + ' of ' + fmtTok(t.totalPrompt);
        const lbl = idx % labelEvery === 0
          ? '<text x="' + cx + '" y="' + (padT + chartH + 16) + '" fill="' + CHART.text + '" font-size="10" text-anchor="middle">' + t.turnIndex + '</text>'
          : '';
        return '<g><title>' + esc(tip) + '</title>' + marker +
          '<rect class="bar" x="' + x + '" y="' + (padT + chartH - h) + '" width="' + barW + '" height="' + h + '" rx="' + Math.min(3, barW / 3) + '" fill="' + fill + '" />' +
          lbl + '</g>';
      }).join('');

      return '<div class="chart-head"><span>Cache hit rate per turn</span><span class="legend">' +
          [['ok', '80%+'], ['warn', '50-80%'], ['bad', 'under 50%'], ['mk-model', 'model switch'], ['mk-ttl', 'TTL gap 5m+']]
            .map(([cls, label]) => '<span class="lg-item"><i class="lg ' + cls + '"></i>' + label + '</span>').join('') +
        '</span></div>' +
        '<div class="chart-body">' +
          '<svg class="chart-axis" width="' + axisW + '" height="' + height + '" viewBox="0 0 ' + axisW + ' ' + height + '" font-family="-apple-system, BlinkMacSystemFont, sans-serif">' + axis + '</svg>' +
          '<div class="chart-scroll">' +
            '<svg class="chart" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" style="display:block" font-family="-apple-system, BlinkMacSystemFont, sans-serif">' +
            grid + bars + '</svg>' +
          '</div>' +
        '</div>';
    }

    // Redraws the turn chart, keeping the sideways scroll: a new session or a view already at the
    // newest turn lands on the newest turn; otherwise the reader's position is kept.
    function drawTurnChart(d) {
      const old = $('detailChart').querySelector('.chart-scroll');
      const keep = old && state.chartFor === d.conversationId
        ? { left: old.scrollLeft, atEnd: old.scrollLeft + old.clientWidth >= old.scrollWidth - 2 }
        : null;
      $('detailChart').innerHTML = renderTurnChart(d.turns || [], d);
      state.chartFor = d.conversationId;
      const sc = $('detailChart').querySelector('.chart-scroll');
      if (sc) sc.scrollLeft = !keep || keep.atEnd ? sc.scrollWidth : keep.left;
    }

    function canRenameSession(d) {
      return Boolean(d && d.conversationId && !String(d.conversationId).startsWith('pid-') && d.canRename !== false);
    }

    function setRenameNote(text, tone) {
      const el = $('renameNote');
      if (!text) {
        el.hidden = true;
        el.textContent = '';
        el.className = 'rename-note';
        return;
      }
      el.hidden = false;
      el.textContent = text;
      el.className = 'rename-note' + (tone ? ' ' + tone : '');
    }

    function showRenameNotice(id) {
      const n = state.renameNotice;
      if (n && n.id === id && Date.now() < n.until) setRenameNote(n.text, n.tone);
    }

    function cancelRename() {
      state.renamingId = null;
      $('renameForm').hidden = true;
      $('detailTitleRow').hidden = false;
      $('btnRenameSave').disabled = false;
      $('btnRenameCancel').disabled = false;
      $('renameInput').disabled = false;
      setRenameNote('', '');
    }

    function startRename() {
      const d = state.detail;
      if (!canRenameSession(d)) return;
      state.renamingId = d.conversationId;
      $('detailTitleRow').hidden = true;
      $('renameForm').hidden = false;
      $('renameInput').disabled = false;
      $('btnRenameSave').disabled = false;
      $('btnRenameCancel').disabled = false;
      $('renameInput').value = d.title || '';
      setRenameNote('', '');
      $('renameInput').focus();
      $('renameInput').select();
    }

    async function submitRename(e) {
      e.preventDefault();
      const d = state.detail;
      if (!canRenameSession(d)) return;
      const nextTitle = $('renameInput').value.replace(/[\\r\\n\\t]+/g, ' ').trim();
      if (!nextTitle) {
        setRenameNote('Title cannot be empty.', 'bad');
        $('renameInput').focus();
        return;
      }
      if (nextTitle === (d.title || '').trim()) {
        cancelRename();
        return;
      }
      $('renameInput').disabled = true;
      $('btnRenameSave').disabled = true;
      $('btnRenameCancel').disabled = true;
      setRenameNote('Saving title…', '');
      try {
        const res = await fetch('/api/session/' + encodeURIComponent(d.conversationId) + '/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        if (res.status === 401) {
          location.reload();
          return;
        }
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) {
          $('renameInput').disabled = false;
          $('btnRenameSave').disabled = false;
          $('btnRenameCancel').disabled = false;
          setRenameNote(out.error || 'Rename failed.', 'bad');
          $('renameInput').focus();
          return;
        }
        d.title = out.title;
        $('detailTitle').textContent = out.title;
        cancelRename();
        state.renameNotice = {
          id: d.conversationId,
          text: out.warning || (out.via === 'agy-api' ? 'Saved and synced to agy (agy API).' : 'Saved and synced to agy (annotations file).'),
          tone: out.warning ? 'warn' : '',
          until: Date.now() + (out.warning ? 15000 : 6000),
        };
        showRenameNotice(d.conversationId);
        await fetchOverview();
      } catch {
        $('renameInput').disabled = false;
        $('btnRenameSave').disabled = false;
        $('btnRenameCancel').disabled = false;
        setRenameNote('Could not reach the panel.', 'bad');
        $('renameInput').focus();
      }
    }

    function renderDetailOps(d) {
      const canArch = Boolean(d && isSelectableSession(d) && d.canArchive !== false);
      const canDel = Boolean(d && isSelectableSession(d) && d.canDelete !== false);
      const delReady = Boolean(opsState().deleteAvailable);
      const archBtn = $('btnArchiveDetail');
      archBtn.hidden = !canArch;
      if (canArch) {
        const label = d.archived ? 'Unarchive' : 'Archive';
        $('btnArchiveDetailLabel').textContent = label;
        archBtn.setAttribute('aria-label', label + ' session');
        archBtn.title = label + ' session';
        archBtn.disabled = state.opsBusy;
      }
      const delWrap = $('detailDeleteWrap');
      const delBtn = $('btnDeleteDetail');
      delWrap.hidden = !canDel;
      if (canDel) {
        delBtn.disabled = !delReady || state.opsBusy;
        delWrap.classList.toggle('blocked', !delReady);
        delWrap.title = delReady ? 'Permanently delete session' : deleteBlockedTip();
      }
      const note = $('detailOpsNote');
      if (canDel && !delReady) {
        note.hidden = false;
        note.innerHTML = 'Permanent delete unavailable (no agy API connection). ' + handoffHtml();
      } else {
        note.hidden = true;
        note.innerHTML = '';
      }
    }

    function renderDetail(d) {
      const st = statusOf(d);
      $('detailKicker').innerHTML = '<span class="dot ' + st + '"></span><span>' +
        segs([STATUS_LABEL[st], esc(d.modelLabel || '--'), 'updated ' + esc(fmtRel(d.lastActivityMs))]) + '</span>' +
        (d.archived ? '<span class="pill">archived</span>' : '');
      const editable = canRenameSession(d);
      const isEditingThis = state.renamingId && state.renamingId === d.conversationId;
      $('detailTitle').textContent = d.title || d.conversationId;
      $('detailTitle').classList.toggle('editable', editable);
      $('detailTitle').title = editable ? 'Click or press F2 to rename' : '';
      $('btnRenameTitle').hidden = !editable;
      if (!isEditingThis) {
        cancelRename();
        showRenameNotice(d.conversationId);
      }
      renderDetailOps(d);

      const sp = speedParts(d.speed);
      const syncTone = d.syncStatus === 'unsynced' ? 'warn' : '';
      $('detailChips').innerHTML = [
        d.archived ? chip('state', 'Archived', { tone: 'warn' }) : '',
        chip('id', d.conversationId, { mono: true, copy: true }),
        d.cwd ? chip('cwd', d.cwd, { mono: true, copy: true }) : '',
        d.branch ? chip('branch', d.branch) : '',
        d.pid ? chip('pid', String(d.pid)) : '',
        d.accountEmail
          ? chip('account', d.accountEmail + (d.syncStatus && d.syncStatus !== 'synced' ? ' (' + d.syncStatus + ')' : ''), { tone: syncTone })
          : chip('sync', d.syncStatus || 'unknown', { tone: syncTone }),
        sp.source ? chip('speed source', sp.source) : '',
      ].join('');

      const ctx = d.contextWindow && typeof d.contextWindow.usedPercentage === 'number' ? Math.round(d.contextWindow.usedPercentage) + '%' : '--';
      $('detailStats').innerHTML = [
        stat('Session cache hit', fmtPct(d.sessionHitRate), hitTone(d.sessionHitRate)),
        stat('Last turn hit', fmtPct(d.lastTurnHitRate), hitTone(d.lastTurnHitRate)),
        stat('Turns', fmtInt(d.turnsCount) + (d.missTurnCount > 0 ? '<span class="stat-note t-warn">' + d.missTurnCount + ' miss</span>' : '')),
        stat('Context used', ctx),
        stat('Speed out / net', (sp.out ?? '--') + ' / ' + (sp.net ?? '--') + '<span class="unit">t/s</span>'),
        stat('Session avg out / net', (sp.avgOut ?? '--') + ' / ' + (sp.avgNet ?? '--') + '<span class="unit">t/s</span>'),
        stat('Tool / API time', fmtDur(d.toolDurationMs) + ' / ' + fmtDur(d.apiDurationMs)),
        stat('Est. cost', d.turnsCount > 0 && (d.unpricedTurnCount || 0) >= d.turnsCount
          ? '<span class="t-muted">unpriced</span>'
          : fmtUsd(d.estimatedCostUsd) + '<span class="unit">today ' + fmtUsd(d.costPeriods?.today) + '</span>'),
      ].join('');

      const turns = d.turns || [];
      drawTurnChart(d);
      if (turns.length === 0) {
        $('detailTurnsBody').innerHTML = '<tr><td colspan="10" class="empty">' +
          (String(d.conversationId || '').startsWith('pid-')
            ? 'No conversation started in this window yet.'
            : (d.hasTranscript === false ? 'No transcript.jsonl on disk for this historical session.' : 'No turn token data recorded.')) +
          '</td></tr>';
        return;
      }
      $('detailTurnsBody').innerHTML = turns.slice().reverse().map(t => {
        const reasons = (t.missReasons || []).map(r => {
          const cls = r.code === 'ttl_gap' ? 'ttl' : r.code === 'model_switch' ? 'model' : r.code === 'context_drop' ? 'drop' : '';
          return '<span class="tag ' + cls + '" title="' + esc(r.detail) + '">' + esc(r.label) + ': ' + esc(r.detail) + '</span>';
        }).join('');
        const time = t.createdAt ? new Date(t.createdAt).toLocaleTimeString('en-GB', { hour12: false }) : '--';
        return '<tr>' +
          '<td><div class="v">#' + t.turnIndex + '</div><div class="s">step ' + (t.stepIndex ?? '--') + '</div></td>' +
          '<td class="muted">' + esc(time) + '</td>' +
          '<td class="r ' + (t.gapMs >= 300000 ? 't-warn' : 'muted') + '">' + fmtGap(t.gapMs) + '</td>' +
          '<td>' + esc(t.modelLabel) + '</td>' +
          '<td class="r">' + fmtTok(t.inputTokens) + '</td>' +
          '<td class="r">' + fmtTok(t.cacheReadTokens) + '</td>' +
          '<td class="r muted">' + fmtTok(t.outputTokens) + '</td>' +
          '<td class="r">' + (typeof t.estimatedCostUsd === 'number'
            ? fmtUsd(t.estimatedCostUsd)
            : '<span class="muted" title="No known price for this model">--</span>') + '</td>' +
          '<td class="r"><span class="v t-' + hitTone(t.hitRate) + '">' + fmtPct(t.hitRate) + '</span></td>' +
          '<td class="diag">' + (reasons || '<span class="muted">--</span>') + '</td>' +
        '</tr>';
      }).join('');
    }

    function setDrawer(open) {
      $('drawer').classList.toggle('open', open);
      $('drawer').setAttribute('aria-hidden', String(!open));
    }

    async function fetchDetail(id) {
      const switching = state.selectedId !== id;
      state.selectedId = id;
      markSelectedRow();
      let detail = null;
      try {
        const res = await fetch('/api/session/' + encodeURIComponent(id));
        if (res.ok) detail = await res.json();
      } catch {}
      if (state.selectedId !== id) return;
      if (!detail) {
        // Fall back to the overview row so the drawer still opens with what is known.
        const row = (state.overview?.sessions || []).find(s => s.conversationId === id);
        if (!row) {
          closeDetail();
          return;
        }
        detail = Object.assign({}, row, { turns: [] });
      }
      state.detail = detail;
      setDrawer(true);
      renderDetail(detail);
      if (switching) $('drawerBody').scrollTop = 0;
    }

    function closeDetail() {
      cancelRename();
      state.selectedId = null;
      state.detail = null;
      state.chartFor = null;
      setDrawer(false);
      markSelectedRow();
    }

    function moveSelection(delta) {
      const rows = Array.from(document.querySelectorAll('#sessionsBody > tr[data-id]'));
      if (rows.length === 0) return;
      let idx = rows.findIndex(tr => tr.dataset.id === state.selectedId);
      idx = idx < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, idx + delta));
      rows[idx].scrollIntoView({ block: 'nearest' });
      fetchDetail(rows[idx].dataset.id);
    }

    // ---------- Data ----------

    let overviewSeq = 0;
    async function fetchOverview() {
      const seq = ++overviewSeq;
      const qs = new URLSearchParams({
        range: state.range,
        sort: state.sort,
        q: state.query,
        account: state.account,
      });
      if (state.showEmpty) qs.set('empty', '1');
      if (state.showArchived) qs.set('archived', '1');
      try {
        const res = await fetch('/api/overview?' + qs.toString());
        if (res.status === 401) {
          location.reload(); // this device was signed out; the server now shows the pairing page
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (seq !== overviewSeq) return; // a newer request superseded this one
        lastSyncedAt = Date.now();
        renderOverview(data);
      } catch {
        return;
      }
      if (state.selectedId) await fetchDetail(state.selectedId);
    }

    async function openSyncModal() {
      $('syncModal').classList.add('open');
      $('syncRawOutput').textContent = 'Running agy-sync-keychain.sh --dry-run …';
      $('syncPreviewSummary').innerHTML = '';
      $('syncExecStatus').innerHTML = '';
      $('btnSyncConfirm').disabled = true;

      let data;
      try {
        const res = await fetch('/api/sync/preview');
        data = await res.json();
      } catch (err) {
        $('syncPreviewSummary').innerHTML = '<span class="pill bad">' + esc(err.message) + '</span>';
        return;
      }
      $('syncRawOutput').textContent = data.rawOutput || data.error || '(empty output)';
      if (!data.available || data.error) {
        $('syncPreviewSummary').innerHTML = '<span class="pill bad">' + esc(data.error || 'Sync helper unavailable') + '</span>';
        return;
      }
      const plan = data.plan || {};
      const pills = ['<span class="pill info">Keychain: ' + esc(plan.keychain?.email || 'unknown') + '</span>'];
      const repCount = (plan.replace || []).length;
      const reoCount = (plan.reopen || []).length;
      const clsCount = (plan.close || []).length;
      const skpCount = (plan.skipped || []).length;
      if (repCount > 0) pills.push('<span class="pill ok">In-place restart: ' + repCount + '</span>');
      if (reoCount > 0) pills.push('<span class="pill warn">Reopen in managed tab: ' + reoCount + '</span>');
      if (clsCount > 0) pills.push('<span class="pill">Close empty owned tab: ' + clsCount + '</span>');
      if (skpCount > 0) pills.push('<span class="pill">Stop (not reopened): ' + skpCount + '</span>');
      if (repCount + reoCount + clsCount + skpCount === 0) pills.push('<span class="pill">No other sessions to restart</span>');
      $('syncPreviewSummary').innerHTML = pills.join('');
      $('btnSyncConfirm').disabled = false;
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
      // Phones open the panel over plain http on the LAN, where the Clipboard API is unavailable.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {}
      ta.remove();
      return ok;
    }

    // ---------- Session archive / delete & bulk selection ----------

    let toastTimer = null;
    function hideToast() {
      clearTimeout(toastTimer);
      toastTimer = null;
      $('opToast').hidden = true;
    }

    function showToast(text, opts = {}) {
      clearTimeout(toastTimer);
      toastTimer = null;
      const el = $('opToast');
      el.className = 'toast' + (opts.tone ? ' ' + opts.tone : '');
      let body = '<div>' + esc(text) + '</div>';
      if (Array.isArray(opts.failures) && opts.failures.length > 0) {
        body += '<ul class="op-list">' + opts.failures.slice(0, 6).map(f =>
          '<li class="t-bad">' + esc(f.label) + ': ' + esc(f.error) + '</li>'
        ).join('') + (opts.failures.length > 6 ? '<li class="muted">+' + (opts.failures.length - 6) + ' more failures</li>' : '') + '</ul>';
      }
      if (opts.handoff) {
        body += '<div class="handoff">' + handoffHtml(opts.handoff) + '</div>';
      }
      if (opts.action) {
        body += '<div class="toast-action"><button class="btn sm primary" type="button" ' + opts.action.attr + '>' + esc(opts.action.label) + '</button></div>';
      }
      $('opToastBody').innerHTML = body;
      el.hidden = false;
      if (!opts.sticky) {
        toastTimer = setTimeout(hideToast, opts.duration || 6500);
      }
    }

    function showHandoffToast(message, cmd) {
      showToast(message || 'Permanent delete needs a live agy API connection.', {
        tone: 'warn',
        handoff: cmd || handoffCmd(),
        sticky: true,
      });
    }

    function sessionLookup(id) {
      const fromOv = (state.overview?.sessions || []).find(s => s.conversationId === id);
      if (fromOv) return fromOv;
      if (state.detail && state.detail.conversationId === id) return state.detail;
      return { conversationId: id, shortId: id.slice(0, 8), title: id.slice(0, 8) };
    }

    function syncRowChecks() {
      document.querySelectorAll('#sessionsBody > tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        const checked = state.checkedIds.has(id);
        tr.classList.toggle('checked', checked);
        const cb = tr.querySelector('input.row-check');
        if (cb) cb.checked = checked;
      });
    }

    function setSelectMode(on) {
      state.selectMode = Boolean(on);
      if (!state.selectMode) state.checkedIds.clear();
      $('sessTable').classList.toggle('select-mode', state.selectMode);
      $('btnSelectMode').setAttribute('aria-pressed', String(state.selectMode));
      $('btnSelectMode').textContent = state.selectMode ? 'Done' : 'Select';
      syncRowChecks();
      updateBulkBar();
    }

    function toggleSelectAllVisible() {
      const sessions = (state.overview?.sessions || []).filter(isSelectableSession);
      const allSelected = sessions.length > 0 && sessions.every(s => state.checkedIds.has(s.conversationId));
      if (allSelected) {
        state.checkedIds.clear();
      } else {
        for (const s of sessions) state.checkedIds.add(s.conversationId);
      }
      syncRowChecks();
      updateBulkBar();
    }

    function updateBulkBar() {
      const sessions = state.overview?.sessions || [];
      const selectable = sessions.filter(isSelectableSession);
      const count = state.checkedIds.size;
      const allSelected = selectable.length > 0 && selectable.every(s => state.checkedIds.has(s.conversationId));
      const selectAll = $('selectAll');
      selectAll.disabled = selectable.length === 0;
      selectAll.checked = allSelected;
      selectAll.indeterminate = count > 0 && !allSelected;

      const showBar = state.selectMode || count > 0;
      const bar = $('bulkBar');
      bar.hidden = !showBar;
      document.body.classList.toggle('bulk-open', showBar);
      if (!showBar) return;

      $('bulkCount').textContent = count + (count === 1 ? ' selected' : ' selected');
      $('btnBulkSelectAll').disabled = state.opsBusy || selectable.length === 0;
      $('btnBulkSelectAll').textContent = allSelected ? 'Deselect all' : 'Select all';

      const selectedRows = selectable.filter(s => state.checkedIds.has(s.conversationId));
      const anyActive = selectedRows.some(s => !s.archived);
      const anyArchived = selectedRows.some(s => s.archived);
      $('btnBulkArchive').disabled = state.opsBusy || count === 0 || !anyActive;
      $('btnBulkUnarchive').disabled = state.opsBusy || count === 0 || !anyArchived;

      const delReady = Boolean(opsState().deleteAvailable);
      $('btnBulkDelete').disabled = state.opsBusy || count === 0 || !delReady;
      $('bulkDeleteWrap').classList.toggle('blocked', count > 0 && !delReady);
      $('bulkDeleteWrap').title = delReady ? 'Permanently delete selected sessions' : deleteBlockedTip();
    }

    function clearSelection() {
      setSelectMode(false);
    }

    async function runArchive(ids, archived, opts = {}) {
      if (!Array.isArray(ids) || ids.length === 0 || state.opsBusy) return;
      state.opsBusy = true;
      updateBulkBar();
      if (state.detail) renderDetailOps(state.detail);
      const verb = archived ? 'Archiving' : 'Unarchiving';
      showToast(verb + ' ' + ids.length + (ids.length === 1 ? ' session…' : ' sessions…'), { sticky: true });
      try {
        const res = await fetch('/api/sessions/archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, archived }),
        });
        if (res.status === 401) {
          location.reload();
          return;
        }
        const out = await res.json().catch(() => ({}));
        if (!Array.isArray(out.results)) {
          showToast(out.error || 'Archive request failed.', { tone: 'bad', sticky: true });
          return;
        }
        const okItems = out.results.filter(r => r.ok);
        const badItems = out.results.filter(r => !r.ok);
        if (state.detail && okItems.some(r => r.conversationId === state.detail.conversationId)) {
          state.detail.archived = archived;
          renderDetail(state.detail);
        }
        if (opts.fromBulk) {
          for (const r of okItems) state.checkedIds.delete(r.conversationId);
          if (badItems.length === 0 && state.checkedIds.size === 0) setSelectMode(false);
        }
        const past = archived ? 'Archived' : 'Unarchived';
        if (badItems.length === 0) {
          const via = okItems.every(r => r.via === 'agy-api') ? ' (agy API)' : '';
          showToast(past + ' ' + okItems.length + (okItems.length === 1 ? ' session' : ' sessions') + via + '.', { tone: 'ok' });
        } else {
          const summary = okItems.length > 0
            ? past + ' ' + okItems.length + ' of ' + out.results.length + ' sessions; ' + badItems.length + ' failed:'
            : (archived ? 'Archive' : 'Unarchive') + ' failed for ' + badItems.length + (badItems.length === 1 ? ' session:' : ' sessions:');
          showToast(summary, {
            tone: okItems.length > 0 ? 'warn' : 'bad',
            failures: badItems.map(r => {
              const s = sessionLookup(r.conversationId);
              return { label: s.title || s.shortId, error: r.error || 'Failed' };
            }),
            sticky: true,
          });
        }
        await fetchOverview();
      } catch {
        showToast('Could not reach the panel.', { tone: 'bad', sticky: true });
      } finally {
        state.opsBusy = false;
        updateBulkBar();
        if (state.detail) renderDetailOps(state.detail);
      }
    }

    function updateDeleteConfirmBtn() {
      const m = state.delModal;
      if (!m) return;
      const btn = $('btnDeleteConfirm');
      if (m.busy || m.doneWithErrors) {
        btn.disabled = true;
        return;
      }
      if (m.step === 'running') {
        btn.disabled = !$('deleteCloseCheck').checked;
      } else {
        btn.disabled = $('deleteConfirmInput').value.trim() !== 'DELETE';
      }
    }

    function renderDeleteModal() {
      const m = state.delModal;
      if (!m) return;
      const n = m.ids.length;
      const plural = n === 1 ? 'session' : n + ' sessions';
      if (m.step === 'running') {
        const rn = m.running.length;
        $('deleteModalTitle').textContent = 'Close open agy window' + (rn === 1 ? '' : 's') + ' and delete';
        $('deleteWarn').innerHTML = '<strong>' + rn + ' selected ' + (rn === 1 ? 'session is' : 'sessions are') +
          ' still open in a running agy window.</strong> Closing them sends SIGTERM (then SIGKILL after 5s) and will interrupt any unsaved or ongoing work in those windows before permanently deleting ' + esc(plural) + '.';
        $('deleteList').innerHTML = m.running.map(r => {
          const metaParts = [
            'PID ' + r.pid,
            r.startedAtMs ? 'open since ' + fmtRel(r.startedAtMs) : '',
            r.cwd || '',
          ].filter(Boolean);
          return '<li class="run">' +
            '<div class="run-head"><span class="t" title="' + esc(r.title || r.conversationId) + '">' + esc(r.title || r.conversationId) + '</span>' +
            '<span class="id">' + esc(String(r.conversationId || '').slice(0, 8)) + '</span></div>' +
            '<div class="run-meta" title="' + esc(fmtStamp(r.startedAtMs)) + '">' + esc(metaParts.join(' · ')) + '</div>' +
            (r.isGenerating ? '<div class="run-gen">Currently generating a response — closing now will interrupt it.</div>' : '') +
          '</li>';
        }).join('');
        $('deleteConfirmWrap').hidden = true;
        $('deleteCloseRow').hidden = false;
        $('deleteCloseCheck').disabled = m.busy;
        $('deleteCloseLabel').textContent = 'Close ' + (rn === 1 ? 'this open agy window' : 'these ' + rn + ' open agy windows') + ' and permanently delete ' + plural;
        $('btnDeleteConfirm').textContent = m.busy ? 'Closing & deleting…' : 'Close windows & delete';
      } else {
        $('deleteModalTitle').textContent = n === 1 ? 'Permanently delete session' : 'Permanently delete ' + n + ' sessions';
        $('deleteWarn').innerHTML = '<strong>This cannot be undone.</strong> The selected ' + (n === 1 ? 'session' : n + ' sessions') +
          ' will be permanently removed via agy (transcript, database, annotations, and search index).';
        const cap = 8;
        const shown = m.items.slice(0, cap).map(item =>
          '<li><span class="t" title="' + esc(item.title) + '">' + esc(item.title) + '</span><span class="id">' + esc(item.shortId) + '</span></li>'
        );
        if (m.items.length > cap) {
          shown.push('<li class="more-row">+' + (m.items.length - cap) + ' more sessions</li>');
        }
        $('deleteList').innerHTML = shown.join('');
        $('deleteConfirmWrap').hidden = false;
        $('deleteConfirmInput').disabled = m.busy;
        $('deleteCloseRow').hidden = true;
        $('btnDeleteConfirm').textContent = m.busy ? 'Deleting…' : 'Delete permanently';
      }
      $('btnDeleteCancel').disabled = m.busy;
      $('btnDeleteCancel').textContent = m.doneWithErrors ? 'Close' : 'Cancel';
      $('btnDeleteConfirm').hidden = Boolean(m.doneWithErrors);
      updateDeleteConfirmBtn();
    }

    function openDeleteModal(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return;
      if (!opsState().deleteAvailable) {
        showHandoffToast();
        return;
      }
      const items = ids.map(id => {
        const s = sessionLookup(id);
        return { conversationId: id, shortId: s.shortId || id.slice(0, 8), title: s.title || s.shortId || id.slice(0, 8) };
      });
      state.delModal = { ids: ids.slice(), items, step: 'confirm', running: [], busy: false, doneWithErrors: false };
      $('deleteConfirmInput').value = '';
      $('deleteCloseCheck').checked = false;
      $('deleteStatus').className = 'del-status';
      $('deleteStatus').innerHTML = '';
      $('deleteHandoff').hidden = true;
      $('deleteHandoff').innerHTML = '';
      $('deleteResults').hidden = true;
      $('deleteResults').innerHTML = '';
      renderDeleteModal();
      syncVisualViewport();
      $('deleteModal').classList.add('open');
      $('deleteConfirmInput').focus();
    }

    function closeDeleteModal() {
      if (state.delModal && state.delModal.busy) return;
      state.delModal = null;
      $('deleteModal').classList.remove('open');
    }

    async function submitDeleteModal() {
      const m = state.delModal;
      if (!m || m.busy || $('btnDeleteConfirm').disabled) return;
      const closeRunning = m.step === 'running';
      m.busy = true;
      $('deleteHandoff').hidden = true;
      $('deleteHandoff').innerHTML = '';
      $('deleteResults').hidden = true;
      $('deleteResults').innerHTML = '';
      $('deleteStatus').className = 'del-status';
      $('deleteStatus').innerHTML = '<span class="spin"></span>' +
        (closeRunning ? 'Closing agy window(s) and deleting through agy (this may take a few seconds)…' : 'Deleting through agy…');
      renderDeleteModal();

      try {
        const res = await fetch('/api/sessions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: m.ids, closeRunning, confirm: 'DELETE' }),
        });
        if (res.status === 401) {
          location.reload();
          return;
        }
        const out = await res.json().catch(() => ({}));
        if (res.status === 409 && out.code === 'running') {
          m.busy = false;
          m.step = 'running';
          m.running = Array.isArray(out.running) ? out.running : [];
          $('deleteCloseCheck').checked = false;
          $('deleteStatus').className = 'del-status';
          $('deleteStatus').innerHTML = '';
          renderDeleteModal();
          $('deleteCloseCheck').focus();
          return;
        }
        if (res.status === 409 && (out.code === 'no_endpoint' || out.code === 'endpoint_would_close')) {
          m.busy = false;
          $('deleteStatus').className = 'del-status warn';
          $('deleteStatus').textContent = out.error || 'No usable agy API connection.';
          $('deleteHandoff').hidden = false;
          $('deleteHandoff').innerHTML = handoffHtml(out.handoffCommand);
          renderDeleteModal();
          return;
        }
        if (!Array.isArray(out.results)) {
          m.busy = false;
          $('deleteStatus').className = 'del-status bad';
          $('deleteStatus').textContent = out.error || 'Permanent delete failed.';
          renderDeleteModal();
          return;
        }

        const okItems = out.results.filter(r => r.ok);
        const badItems = out.results.filter(r => !r.ok);
        const closedCount = Array.isArray(out.closedPids) ? out.closedPids.length : 0;
        for (const r of okItems) {
          state.checkedIds.delete(r.conversationId);
          if (state.selectedId === r.conversationId) closeDetail();
        }
        await fetchOverview();

        if (badItems.length === 0) {
          m.busy = false;
          closeDeleteModal();
          if (state.selectMode && state.checkedIds.size === 0) setSelectMode(false);
          const msg = 'Deleted ' + okItems.length + (okItems.length === 1 ? ' session' : ' sessions') +
            (closedCount > 0 ? ' and closed ' + closedCount + (closedCount === 1 ? ' agy window' : ' agy windows') : '') + '.';
          showToast(msg, { tone: 'ok' });
          return;
        }

        m.busy = false;
        m.doneWithErrors = true;
        $('deleteStatus').className = 'del-status ' + (okItems.length > 0 ? 'warn' : 'bad');
        $('deleteStatus').textContent = (okItems.length > 0
          ? 'Deleted ' + okItems.length + ' of ' + out.results.length + ' sessions' + (closedCount > 0 ? ' (closed ' + closedCount + ' window(s))' : '') + '. '
          : 'Delete failed. ') + badItems.length + (badItems.length === 1 ? ' item could not be deleted:' : ' items could not be deleted:');
        $('deleteResults').hidden = false;
        $('deleteResults').innerHTML = badItems.map(r => {
          const item = m.items.find(x => x.conversationId === r.conversationId) || sessionLookup(r.conversationId);
          return '<li class="run"><div class="run-head"><span class="t">' + esc(item.title || item.shortId) + '</span>' +
            '<span class="id">' + esc(item.shortId || r.conversationId.slice(0, 8)) + '</span></div>' +
            '<div class="run-meta t-bad">' + esc(r.error || 'Delete failed') + '</div></li>';
        }).join('');
        renderDeleteModal();
      } catch {
        m.busy = false;
        $('deleteStatus').className = 'del-status bad';
        $('deleteStatus').textContent = 'Could not reach the panel.';
        renderDeleteModal();
      }
    }

    // ---------- Events ----------

    $('rangeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-range]');
      if (!btn || btn.dataset.range === state.range) return;
      state.range = btn.dataset.range;
      savePrefs();
      $('rangeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      fetchOverview();
    });

    document.querySelector('#sessTable thead').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      state.sort = nextSort(th.dataset.sort);
      savePrefs();
      updateSortHeaders();
      fetchOverview();
    });

    $('accountFilter').addEventListener('change', (e) => {
      state.account = e.target.value;
      fetchOverview();
    });

    let searchTimer = null;
    $('searchInput').addEventListener('input', (e) => {
      state.query = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(fetchOverview, 180);
    });

    $('btnToggleEmpty').addEventListener('click', () => {
      state.showEmpty = !state.showEmpty;
      savePrefs();
      fetchOverview();
    });

    $('btnToggleArchived').addEventListener('click', () => {
      state.showArchived = !state.showArchived;
      savePrefs();
      fetchOverview();
    });

    $('btnToggleCost').addEventListener('click', () => {
      state.showCost = !state.showCost;
      savePrefs();
      $('btnToggleCost').setAttribute('aria-pressed', String(state.showCost));
      $('sessTable').classList.toggle('hide-cost', !state.showCost);
    });

    $('btnSelectMode').addEventListener('click', () => setSelectMode(!state.selectMode));
    $('btnBulkSelectAll').addEventListener('click', toggleSelectAllVisible);

    $('selectAll').addEventListener('change', (e) => {
      const sessions = (state.overview?.sessions || []).filter(isSelectableSession);
      if (e.target.checked) {
        for (const s of sessions) state.checkedIds.add(s.conversationId);
      } else {
        state.checkedIds.clear();
      }
      syncRowChecks();
      updateBulkBar();
    });

    $('sessionsBody').addEventListener('change', (e) => {
      const cb = e.target.closest('input.row-check');
      if (!cb) return;
      const id = cb.dataset.checkId;
      if (!id) return;
      if (cb.checked) state.checkedIds.add(id);
      else state.checkedIds.delete(id);
      const tr = cb.closest('tr[data-id]');
      if (tr) tr.classList.toggle('checked', cb.checked);
      updateBulkBar();
    });

    $('sessionsBody').addEventListener('click', (e) => {
      if (e.target.closest('.c-sel')) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (state.selectMode) {
        const id = tr.dataset.id;
        if (!isSelectableSession(sessionLookup(id))) return;
        if (state.checkedIds.has(id)) state.checkedIds.delete(id);
        else state.checkedIds.add(id);
        syncRowChecks();
        updateBulkBar();
        return;
      }
      if (tr.dataset.id === state.selectedId) {
        closeDetail();
        return;
      }
      fetchDetail(tr.dataset.id);
    });

    $('btnBulkArchive').addEventListener('click', () => {
      const ids = Array.from(state.checkedIds).filter(id => !sessionLookup(id).archived);
      runArchive(ids, true, { fromBulk: true });
    });
    $('btnBulkUnarchive').addEventListener('click', () => {
      const ids = Array.from(state.checkedIds).filter(id => sessionLookup(id).archived);
      runArchive(ids, false, { fromBulk: true });
    });
    $('btnBulkDelete').addEventListener('click', () => openDeleteModal(Array.from(state.checkedIds)));
    $('bulkDeleteWrap').addEventListener('click', (e) => {
      if ($('bulkDeleteWrap').classList.contains('blocked')) {
        e.preventDefault();
        showHandoffToast();
      }
    });
    $('btnBulkClear').addEventListener('click', clearSelection);

    $('btnArchiveDetail').addEventListener('click', () => {
      if (!state.detail || !isSelectableSession(state.detail)) return;
      runArchive([state.detail.conversationId], !state.detail.archived, { fromBulk: false });
    });
    $('btnDeleteDetail').addEventListener('click', () => {
      if (!state.detail || !isSelectableSession(state.detail)) return;
      openDeleteModal([state.detail.conversationId]);
    });
    $('detailDeleteWrap').addEventListener('click', (e) => {
      if ($('detailDeleteWrap').classList.contains('blocked')) {
        e.preventDefault();
        showHandoffToast();
      }
    });

    $('deleteConfirmInput').addEventListener('input', updateDeleteConfirmBtn);
    $('deleteConfirmInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !$('btnDeleteConfirm').disabled) {
        e.preventDefault();
        submitDeleteModal();
      }
    });
    $('deleteCloseCheck').addEventListener('change', updateDeleteConfirmBtn);
    $('deleteCloseCheck').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !$('btnDeleteConfirm').disabled) {
        e.preventDefault();
        submitDeleteModal();
      }
    });
    $('btnDeleteCancel').addEventListener('click', closeDeleteModal);
    $('btnDeleteConfirm').addEventListener('click', submitDeleteModal);
    $('deleteModal').addEventListener('click', (e) => {
      if (e.target === $('deleteModal')) closeDeleteModal();
    });
    $('deleteModal').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDeleteModal();
      }
    });

    function openAcctPopover() {
      const vault = state.overview?.vault || null;
      if (!canManageVault(vault)) return;
      state.acctMenuOpen = true;
      state.acctInline = null;
      state.acctSignInConfirm = false;
      state.acctMenuKey = computeVaultMenuKey(vault);
      renderAcctPopover();
      const pop = $('acctPopover');
      pop.hidden = false;
      $('btnAcctMenu').setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        pop.classList.add('open');
        const firstBtn = pop.querySelector('button:not(:disabled)');
        if (firstBtn) firstBtn.focus();
      });
    }

    function closeAcctPopover(restoreFocus = false) {
      if (!state.acctMenuOpen) return;
      state.acctMenuOpen = false;
      state.acctInline = null;
      state.acctSignInConfirm = false;
      const pop = $('acctPopover');
      pop.classList.remove('open');
      pop.hidden = true;
      $('btnAcctMenu').setAttribute('aria-expanded', 'false');
      if (restoreFocus && !$('btnAcctMenu').hidden) {
        $('btnAcctMenu').focus();
      }
    }

    function renderAcctPopover() {
      const pop = $('acctPopover');
      const data = state.overview || {};
      const vault = data.vault || null;
      const auth = data.auth || {};
      const summary = data.summary || {};
      if (!canManageVault(vault)) {
        pop.innerHTML = '';
        return;
      }

      const quotaByEmail = new Map();
      for (const a of data.accounts || []) {
        if (a && a.email) quotaByEmail.set(a.email.toLowerCase(), a);
      }
      const vaultByEmail = new Map();
      for (const v of vault.accounts || []) {
        if (v && v.email) vaultByEmail.set(v.email.toLowerCase(), v);
      }
      const emails = new Set([...vaultByEmail.keys()]);
      if (vault.activeEmail) emails.add(vault.activeEmail.toLowerCase());

      const rows = Array.from(emails).map(key => {
        const v = vaultByEmail.get(key) || null;
        const q = quotaByEmail.get(key) || null;
        const email = v?.email || q?.email || key;
        const isActive = Boolean(vault.activeEmail && email.toLowerCase() === vault.activeEmail.toLowerCase());
        return {
          email,
          saved: Boolean(v),
          isActive,
          expired: v ? Boolean(v.expired) : (isActive && Boolean(vault.activeExpired)),
          hasRefreshToken: v ? Boolean(v.hasRefreshToken) : (isActive && Boolean(vault.activeHasRefreshToken)),
          tier: shortTierLabel(q?.tier || (isActive ? data.quota?.tier : null)),
          lastRefreshed: q?.lastRefreshed || null,
          quota: q?.quota || null,
          sortTime: v?.lastSwitchedAt || v?.updatedAt || v?.savedAt || q?.lastRefreshed || 0,
        };
      }).sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.saved !== b.saved) return a.saved ? -1 : 1;
        if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
        return a.email.localeCompare(b.email);
      });

      const savedTotal = (vault.accounts || []).length;
      const runningCount = summary.runningCount || 0;
      const syncAvail = Boolean(auth.syncBridgeAvailable);
      const trashSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

      let html = '<div class="acct-pop-head">' +
        '<span>Accounts · ' + savedTotal + ' saved</span>' +
        '<span class="sub">Local Keychain</span>' +
      '</div>';

      if (vault.activeEmail && !vault.activeSaved) {
        html += '<div class="acct-pop-unsaved">' +
          '<span title="' + esc(vault.activeEmail) + '"><strong>' + esc(emailLocalPart(vault.activeEmail)) + '</strong> is not saved</span>' +
          '<button class="btn sm primary" type="button" data-acct-save="1"' + (state.vaultBusy ? ' disabled' : '') + '>Save</button>' +
        '</div>';
      }

      if (rows.length === 0) {
        html += '<div class="acct-pop-empty">No saved accounts yet. Sign in with agy and save your credentials to switch in one click.</div>';
      } else {
        html += '<div class="acct-pop-list">' + rows.map(a => {
          const g = (a.quota?.providers || []).find(p => p.key === 'google');
          const c = (a.quota?.providers || []).find(p => p.key === 'claude');
          const metaParts = [];
          if (a.tier) metaParts.push(esc(a.tier));
          if (g?.fiveHour) metaParts.push('G ' + g.fiveHour.percent + '%');
          if (c?.fiveHour) metaParts.push('3P ' + c.fiveHour.percent + '%');
          if (a.lastRefreshed) metaParts.push(esc(fmtRel(a.lastRefreshed)));
          if (a.expired) metaParts.push('<span class="warn-txt">' + (a.hasRefreshToken ? 'Refresh on next run' : 'Sign in again') + '</span>');
          else if (!a.saved) metaParts.push('<span class="warn-txt">Not saved</span>');

          const dotCls = a.isActive
            ? ((a.expired || !a.saved) ? 'acct-dot warn' : 'acct-dot')
            : (a.expired ? 'acct-dot warn' : (a.saved ? 'acct-dot' : 'acct-dot muted'));

          const inline = state.acctInline;
          const isRemoving = Boolean(inline && inline.email === a.email && inline.mode === 'remove');
          const isExpandingSwitch = Boolean(inline && inline.email === a.email && inline.mode === 'switch');

          let actsHtml = '';
          if (isRemoving) {
            actsHtml = '<div class="acct-pop-rm-confirm">' +
              '<span>Remove?</span>' +
              '<button class="btn xs ghost" type="button" data-acct-inline-cancel="1"' + (state.vaultBusy ? ' disabled' : '') + '>Cancel</button>' +
              '<button class="btn xs danger solid" type="button" data-acct-remove-confirm="' + esc(a.email) + '"' + (state.vaultBusy ? ' disabled' : '') + '>Remove</button>' +
            '</div>';
          } else if (a.isActive) {
            actsHtml = '<div class="acct-pop-acts">' +
              '<span class="acct-pop-active-lbl">Active</span>' +
              (a.saved
                ? '<button class="btn ghost icon acct-pop-del" type="button" data-acct-remove="' + esc(a.email) + '" title="Remove saved copy (does not sign out agy)" aria-label="Remove saved copy for ' + esc(a.email) + '"' + (state.vaultBusy ? ' disabled' : '') + '>' + trashSvg + '</button>'
                : '') +
            '</div>';
          } else if (a.saved) {
            const canSwitch = !a.expired || a.hasRefreshToken;
            actsHtml = '<div class="acct-pop-acts">' +
              (canSwitch
                ? '<button class="btn ghost acct-pop-btn" type="button" data-acct-switch="' + esc(a.email) + '"' + (state.vaultBusy ? ' disabled' : '') + '>Switch</button>'
                : '<button class="btn ghost acct-pop-btn" type="button" data-acct-signin-start="1"' + (state.vaultBusy ? ' disabled' : '') + '>Sign in</button>') +
              '<button class="btn ghost icon acct-pop-del" type="button" data-acct-remove="' + esc(a.email) + '" title="Remove saved copy (does not sign out agy)" aria-label="Remove saved copy for ' + esc(a.email) + '"' + (state.vaultBusy ? ' disabled' : '') + '>' + trashSvg + '</button>' +
            '</div>';
          }

          let expandHtml = '';
          if (isExpandingSwitch) {
            expandHtml = '<div class="acct-pop-expand">' +
              '<div><strong>' + runningCount + ' running agy ' + (runningCount === 1 ? 'window</strong> stays' : 'windows</strong> stay') + ' on ' + esc(emailLocalPart(vault.activeEmail || 'current')) + ' and may overwrite Keychain (~1h).</div>' +
              '<div class="acct-pop-expand-acts">' +
                (syncAvail
                  ? '<button class="btn xs primary" type="button" data-acct-switch-sync="' + esc(a.email) + '" title="Switch account and open Sync sessions review"' + (state.vaultBusy ? ' disabled' : '') + '>Switch &amp; sync (' + runningCount + ')</button>'
                  : '') +
                '<button class="btn xs" type="button" data-acct-switch-only="' + esc(a.email) + '"' + (state.vaultBusy ? ' disabled' : '') + '>Switch only</button>' +
                '<button class="btn xs ghost" type="button" data-acct-inline-cancel="1"' + (state.vaultBusy ? ' disabled' : '') + '>Cancel</button>' +
              '</div></div>';
          } else if (isRemoving) {
            expandHtml = '<div class="acct-pop-expand" style="color:var(--muted)">Removes only the vault copy; active agy login and Google access are untouched.</div>';
          }

          return '<div class="acct-pop-item' + (a.isActive ? ' is-active' : '') + '">' +
            '<div class="acct-pop-row">' +
              '<span class="' + dotCls + '"></span>' +
              '<div class="acct-pop-info">' +
                '<div class="acct-pop-email" title="' + esc(a.email) + '">' + esc(a.email) + '</div>' +
                '<div class="acct-pop-meta">' + (metaParts.join(' · ') || 'Saved in Keychain') + '</div>' +
              '</div>' +
              actsHtml +
            '</div>' +
            expandHtml +
          '</div>';
        }).join('') + '</div>';
      }

      if (state.acctSignInConfirm) {
        const desc = vault.activeEmail
          ? 'Saves <strong>' + esc(vault.activeEmail) + '</strong> to local Keychain first, clears the active login slot, and starts <code>agy</code> in a terminal for official Google sign-in.'
          : 'Starts <code>agy</code> in a terminal for official Google sign-in.';
        html += '<div class="acct-pop-foot"><div class="acct-pop-signin-box">' +
          '<div>' + desc + '</div>' +
          '<div class="acct-pop-signin-acts">' +
            '<button class="btn xs primary" type="button" data-acct-signin-confirm="1"' + (state.vaultBusy ? ' disabled' : '') + '>Open sign-in</button>' +
            '<button class="btn xs ghost" type="button" data-acct-signin-cancel="1"' + (state.vaultBusy ? ' disabled' : '') + '>Cancel</button>' +
          '</div></div></div>';
      } else {
        html += '<div class="acct-pop-foot">' +
          '<button class="btn ghost acct-pop-signin-btn" type="button" data-acct-signin-start="1"' + (state.vaultBusy ? ' disabled' : '') + '>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
            'Sign in new account' +
          '</button>' +
        '</div>';
      }

      pop.innerHTML = html;
      if (state.acctInline && state.acctInline.mode === 'remove') {
        const cancelBtn = pop.querySelector('button[data-acct-inline-cancel]');
        if (cancelBtn) cancelBtn.focus();
      }
    }

    async function vaultPost(pathname, body) {
      const res = await fetch(pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agy-Local-Token': LOCAL_VAULT_TOKEN,
        },
        body: JSON.stringify(body || {}),
      });
      const out = await res.json().catch(() => ({}));
      return { ok: res.ok && out.ok !== false, status: res.status, data: out };
    }

    async function handleSaveAccount() {
      if (state.vaultBusy || !LOCAL_VAULT_TOKEN) return;
      state.vaultBusy = true;
      if (state.acctMenuOpen) renderAcctPopover();
      try {
        const res = await vaultPost('/api/accounts/save', {});
        if (!res.ok) {
          showToast(res.data?.error || 'Could not save current account.', { tone: 'bad', sticky: true });
          return;
        }
        const msg = res.data.keptNewer
          ? 'Kept newer saved credential for ' + res.data.email + '.'
          : 'Saved ' + res.data.email + ' to local Keychain.';
        showToast(msg, { tone: 'ok' });
        await fetchOverview();
        if (state.acctMenuOpen) {
          state.acctMenuKey = computeVaultMenuKey(state.overview?.vault);
          renderAcctPopover();
        }
      } catch {
        showToast('Could not reach the panel.', { tone: 'bad', sticky: true });
      } finally {
        state.vaultBusy = false;
        if (state.acctMenuOpen) renderAcctPopover();
      }
    }

    async function executeAccountSwitch(email, opts = {}) {
      if (!email || state.vaultBusy || !LOCAL_VAULT_TOKEN) return;
      state.vaultBusy = true;
      state.acctInline = null;
      $('btnAcctMenu').classList.add('switching');
      if (state.acctMenuOpen) renderAcctPopover();
      showToast((opts.isUndo ? 'Restoring ' : 'Switching to ') + email + '…', { sticky: true });
      try {
        const res = await vaultPost('/api/accounts/switch', { email, skipBackgroundRefresh: Boolean(opts.openSync) });
        if (!res.ok) {
          showToast(res.data?.error || 'Account switch failed.', { tone: 'bad', sticky: true });
          return;
        }
        closeAcctPopover(false);
        await fetchOverview();
        if (res.data.alreadyActive) {
          showToast(email + ' is already active.', { tone: 'ok' });
          return;
        }
        const suffix = res.data.refreshNeeded
          ? (opts.openSync ? ' (verified · quota syncs after restart)' : ' (verified · syncing quota…)')
          : (res.data.quotaRefreshed ? ' (verified · quota refreshed)' : ' (verified)');
        const toastOpts = { tone: 'ok', duration: 10000 };
        if (!opts.isUndo && res.data.canUndo && res.data.previousEmail) {
          toastOpts.action = {
            label: 'Undo',
            attr: 'data-undo-switch="' + esc(res.data.previousEmail) + '"',
          };
        }
        showToast('Switched to ' + res.data.email + suffix, toastOpts);
        if (opts.openSync && state.overview?.auth?.syncBridgeAvailable) {
          openSyncModal();
        }
      } catch {
        showToast('Could not reach the panel.', { tone: 'bad', sticky: true });
      } finally {
        state.vaultBusy = false;
        $('btnAcctMenu').classList.remove('switching');
        if (state.acctMenuOpen) renderAcctPopover();
      }
    }

    async function handleRemoveAccount(email) {
      if (!email || state.vaultBusy || !LOCAL_VAULT_TOKEN) return;
      state.vaultBusy = true;
      state.acctInline = null;
      if (state.acctMenuOpen) renderAcctPopover();
      try {
        const res = await vaultPost('/api/accounts/remove', { email });
        if (!res.ok) {
          showToast(res.data?.error || 'Could not remove saved account.', { tone: 'bad', sticky: true });
          return;
        }
        showToast('Removed saved copy for ' + res.data.email + ' (agy login unchanged).', { tone: 'ok' });
        await fetchOverview();
        if (state.acctMenuOpen) {
          state.acctMenuKey = computeVaultMenuKey(state.overview?.vault);
          renderAcctPopover();
        }
      } catch {
        showToast('Could not reach the panel.', { tone: 'bad', sticky: true });
      } finally {
        state.vaultBusy = false;
        if (state.acctMenuOpen) renderAcctPopover();
      }
    }

    async function handleSignInNewAccount() {
      if (state.vaultBusy || !LOCAL_VAULT_TOKEN) return;
      state.vaultBusy = true;
      state.acctSignInConfirm = false;
      if (state.acctMenuOpen) renderAcctPopover();
      try {
        const res = await vaultPost('/api/accounts/sign-in', { launchTerminal: true });
        if (!res.ok) {
          showToast(res.data?.error || 'Could not start sign-in.', { tone: 'bad', sticky: true });
          return;
        }
        closeAcctPopover(false);
        await fetchOverview();
        const savedNote = res.data.backedUpEmail ? 'Saved ' + res.data.backedUpEmail + ' to Keychain. ' : '';
        const nextNote = res.data.launchedTerminal
          ? 'Opened agy in a terminal — finish Google sign-in there, then click Save here.'
          : 'Active login cleared — run agy in a terminal to complete Google sign-in, then click Save here.';
        showToast(savedNote + nextNote, { tone: 'ok', duration: 10000 });
      } catch {
        showToast('Could not reach the panel.', { tone: 'bad', sticky: true });
      } finally {
        state.vaultBusy = false;
        if (state.acctMenuOpen) renderAcctPopover();
      }
    }

    $('btnAcctMenu').addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.acctMenuOpen) closeAcctPopover(false);
      else openAcctPopover();
    });

    $('quotaBody').addEventListener('click', (e) => {
      if (e.target.closest('button[data-open-acct-menu]')) {
        e.stopPropagation();
        openAcctPopover();
      }
    });

    $('acctPopover').addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.vaultBusy) return;
      if (e.target.closest('button[data-acct-save]')) {
        handleSaveAccount();
        return;
      }
      if (e.target.closest('button[data-acct-inline-cancel]')) {
        state.acctInline = null;
        renderAcctPopover();
        return;
      }
      if (e.target.closest('button[data-acct-signin-start]')) {
        state.acctInline = null;
        state.acctSignInConfirm = true;
        renderAcctPopover();
        return;
      }
      if (e.target.closest('button[data-acct-signin-cancel]')) {
        state.acctSignInConfirm = false;
        renderAcctPopover();
        return;
      }
      if (e.target.closest('button[data-acct-signin-confirm]')) {
        handleSignInNewAccount();
        return;
      }
      const swBtn = e.target.closest('button[data-acct-switch]');
      if (swBtn) {
        const email = swBtn.dataset.acctSwitch;
        state.acctSignInConfirm = false;
        const running = state.overview?.summary?.runningCount || 0;
        if (running > 0) {
          state.acctInline = (state.acctInline && state.acctInline.email === email && state.acctInline.mode === 'switch')
            ? null
            : { email, mode: 'switch' };
          renderAcctPopover();
        } else {
          executeAccountSwitch(email, { openSync: false });
        }
        return;
      }
      const swOnly = e.target.closest('button[data-acct-switch-only]');
      if (swOnly) {
        executeAccountSwitch(swOnly.dataset.acctSwitchOnly, { openSync: false });
        return;
      }
      const swSync = e.target.closest('button[data-acct-switch-sync]');
      if (swSync) {
        executeAccountSwitch(swSync.dataset.acctSwitchSync, { openSync: true });
        return;
      }
      const rmBtn = e.target.closest('button[data-acct-remove]');
      if (rmBtn) {
        const email = rmBtn.dataset.acctRemove;
        state.acctSignInConfirm = false;
        state.acctInline = (state.acctInline && state.acctInline.email === email && state.acctInline.mode === 'remove')
          ? null
          : { email, mode: 'remove' };
        renderAcctPopover();
        return;
      }
      const rmConfirm = e.target.closest('button[data-acct-remove-confirm]');
      if (rmConfirm) {
        handleRemoveAccount(rmConfirm.dataset.acctRemoveConfirm);
      }
    });

    document.addEventListener('click', (e) => {
      if (state.acctMenuOpen && !e.target.closest('#acctMenuWrap')) {
        closeAcctPopover(false);
      }
    });

    $('btnToastClose').addEventListener('click', hideToast);
    document.addEventListener('click', async (e) => {
      if (e.target.closest('button[data-reload-page]')) {
        location.reload();
        return;
      }
      const undoBtn = e.target.closest('button[data-undo-switch]');
      if (undoBtn) {
        const prevEmail = undoBtn.dataset.undoSwitch;
        if (prevEmail) executeAccountSwitch(prevEmail, { openSync: false, isUndo: true });
        return;
      }
      const btn = e.target.closest('button[data-copy-handoff]');
      if (!btn) return;
      if (await copyText(btn.dataset.copyHandoff || handoffCmd())) {
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      }
    });

    $('btnCloseDetail').addEventListener('click', closeDetail);
    $('btnRenameTitle').addEventListener('click', startRename);
    $('detailTitle').addEventListener('click', () => {
      if (canRenameSession(state.detail)) startRename();
    });
    $('btnRenameCancel').addEventListener('click', cancelRename);
    $('renameForm').addEventListener('submit', submitRename);
    $('renameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelRename();
      }
    });

    $('btnCopyResume').addEventListener('click', async () => {
      if (!state.detail?.resumeCommand) return;
      if (await copyText(state.detail.resumeCommand)) {
        $('btnCopyResumeLabel').textContent = 'Copied';
        setTimeout(() => { $('btnCopyResumeLabel').innerHTML = 'Copy<span class="copy-long"> resume command</span>'; }, 1200);
      }
    });

    $('detailChips').addEventListener('click', async (e) => {
      const el = e.target.closest('[data-copy]');
      if (!el || !(await copyText(el.dataset.copy))) return;
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1000);
    });

    $('btnRefreshQuota').addEventListener('click', async () => {
      $('btnRefreshQuota').disabled = true;
      $('btnRefreshQuotaLabel').textContent = 'Refreshing…';
      try {
        await fetch('/api/quota/refresh', { method: 'POST' });
        await fetchOverview();
      } finally {
        $('btnRefreshQuota').disabled = false;
        $('btnRefreshQuotaLabel').textContent = 'Refresh';
      }
    });

    $('btnSyncModal').addEventListener('click', openSyncModal);
    let pairTimer = null;
    function renderPairing(pair) {
      state.lanUrls = pair.urls || state.lanUrls;
      $('lanLinks').innerHTML = state.lanUrls.map((u, i) =>
        '<div class="lan-link"><code>' + esc(u) + '</code><button class="btn sm" data-lan="' + i + '">Copy</button></div>'
      ).join('') || '<div class="muted">No Wi-Fi/Ethernet or saved network address is up right now.</div>';
      $('pairCode').textContent = pair.code || '------';
      $('pairDevices').textContent = (pair.devices || 0) + ' phone(s) currently signed in.';
      clearInterval(pairTimer);
      const tick = () => {
        const left = Math.max(0, Math.round(((pair.expiresAt || 0) - Date.now()) / 1000));
        $('pairExpiry').textContent = left > 0
          ? 'Valid for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' · one use'
          : 'Expired. Get a new code.';
        if (left === 0) clearInterval(pairTimer);
      };
      tick();
      pairTimer = setInterval(tick, 1000);
    }
    async function requestPairCode() {
      try {
        const res = await fetch('/api/pair/code', { method: 'POST' });
        const pair = await res.json();
        if (res.ok) renderPairing(pair);
        else $('pairExpiry').textContent = pair.error || 'Could not get a code.';
      } catch {
        $('pairExpiry').textContent = 'Could not reach the panel.';
      }
    }
    function closeLanModal() {
      clearInterval(pairTimer);
      $('lanModal').classList.remove('open');
    }
    $('btnPhone').addEventListener('click', () => {
      $('lanModal').classList.add('open');
      requestPairCode();
    });
    $('btnNewCode').addEventListener('click', requestPairCode);
    $('btnRevokeDevices').addEventListener('click', async () => {
      try {
        const res = await fetch('/api/pair/revoke', { method: 'POST' });
        if (res.ok) $('pairDevices').textContent = 'All phones signed out.';
      } catch {}
    });
    $('lanLinks').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-lan]');
      if (!btn || !(await copyText(state.lanUrls[Number(btn.dataset.lan)]))) return;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    });
    $('btnLanClose').addEventListener('click', closeLanModal);
    $('btnDriftSync').addEventListener('click', openSyncModal);
    $('btnSyncCancel').addEventListener('click', () => $('syncModal').classList.remove('open'));
    $('btnSyncConfirm').addEventListener('click', async () => {
      $('btnSyncConfirm').disabled = true;
      $('syncExecStatus').innerHTML = '<span class="pill info">Running sync…</span>';
      try {
        const res = await fetch('/api/sync/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        });
        const out = await res.json();
        if (out.ok) {
          $('syncExecStatus').innerHTML = '<span class="pill ok">Sync completed</span>';
          $('syncRawOutput').textContent = out.output || 'Sync finished.';
          await fetchOverview();
          if (!opsState().deleteAvailable) {
            $('syncExecStatus').innerHTML =
              '<span class="pill ok">Sync completed</span>' +
              '<div class="handoff"><span>Restarted agy windows rotated their local API ports, so permanent delete needs a fresh connection.</span> ' +
              handoffHtml() + '</div>';
          }
        } else {
          $('syncExecStatus').innerHTML = '<span class="pill bad">' + esc(out.error || 'Sync failed') + '</span>';
          if (out.output) $('syncRawOutput').textContent = out.output;
          $('btnSyncConfirm').disabled = false;
        }
      } catch (err) {
        $('syncExecStatus').innerHTML = '<span class="pill bad">' + esc(err.message) + '</span>';
        $('btnSyncConfirm').disabled = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === 'Escape') {
        if ($('deleteModal').classList.contains('open')) closeDeleteModal();
        else if ($('lanModal').classList.contains('open')) closeLanModal();
        else if ($('syncModal').classList.contains('open')) $('syncModal').classList.remove('open');
        else if (state.acctMenuOpen && (state.acctInline || state.acctSignInConfirm)) {
          state.acctInline = null;
          state.acctSignInConfirm = false;
          renderAcctPopover();
        }
        else if (state.acctMenuOpen) closeAcctPopover(true);
        else if (state.selectedId) closeDetail();
        else if (state.selectMode || state.checkedIds.size > 0) clearSelection();
        return;
      }
      if (!state.selectedId || $('deleteModal').classList.contains('open') || $('syncModal').classList.contains('open') || $('lanModal').classList.contains('open')) return;
      if (e.key === 'F2' && canRenameSession(state.detail)) {
        e.preventDefault();
        startRename();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(e.key === 'ArrowDown' ? 1 : -1);
      }
    });

    let resizeTimer = null;
    function syncVisualViewport() {
      const vv = window.visualViewport;
      if (!vv) return;
      document.documentElement.style.setProperty('--vv-h', Math.round(vv.height) + 'px');
      document.documentElement.style.setProperty('--vv-top', Math.round(vv.offsetTop) + 'px');
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncVisualViewport);
      window.visualViewport.addEventListener('scroll', syncVisualViewport);
      syncVisualViewport();
    }
    window.addEventListener('resize', () => {
      syncVisualViewport();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.detail && $('drawer').classList.contains('open')) {
          drawTurnChart(state.detail);
        }
      }, 150);
    });

    // ---------- Automatic live sync, wake recovery & UI reload ----------

    const SSE_STALE_MS = 45000;
    const FALLBACK_POLL_MS = 5000;
    let sse = null;
    let sseConnectedOnce = false;
    let lastSseAt = 0;
    let lastSyncedAt = 0;
    let fallbackPollTimer = null;
    let currentUiHash = null;
    let reloadPromptedHash = null;

    function setConn(kind, label) {
      $('connState').innerHTML = '<span class="dot ' + kind + '"></span>' + label;
    }

    function updateConnTitle() {
      const synced = lastSyncedAt ? 'Last synced ' + fmtRel(lastSyncedAt) + ' · ' : '';
      $('connState').title = synced + 'Click to sync now';
    }

    function handleUiHash(hash) {
      if (!hash || typeof hash !== 'string') return;
      if (!currentUiHash) {
        currentUiHash = hash;
        return;
      }
      if (hash === currentUiHash || reloadPromptedHash === hash) return;
      reloadPromptedHash = hash;
      showToast('Panel updated. Refresh the page whenever you are ready.', {
        tone: 'warn',
        action: { label: 'Refresh', attr: 'data-reload-page="1"' },
        sticky: true,
      });
    }

    function stopFallbackPoll() {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    }

    function startFallbackPoll() {
      if (fallbackPollTimer) return;
      fallbackPollTimer = setInterval(() => {
        if (!document.hidden) fetchOverview();
      }, FALLBACK_POLL_MS);
    }

    function isSseStale() {
      return !sse || sse.readyState === EventSource.CLOSED || (lastSseAt > 0 && Date.now() - lastSseAt > SSE_STALE_MS);
    }

    function connectSse() {
      if (sse) {
        try { sse.close(); } catch {}
      }
      const es = new EventSource('/api/events');
      sse = es;
      es.onopen = () => {
        if (sse !== es) return;
        const reconnected = sseConnectedOnce;
        sseConnectedOnce = true;
        lastSseAt = Date.now();
        stopFallbackPoll();
        setConn('live', 'Live');
        updateConnTitle();
        if (reconnected) fetchOverview();
      };
      es.addEventListener('ready', (ev) => {
        if (sse !== es) return;
        lastSseAt = Date.now();
        try {
          const data = JSON.parse(ev.data || '{}');
          handleUiHash(data.uiHash);
        } catch {}
      });
      es.addEventListener('ping', () => {
        if (sse !== es) return;
        lastSseAt = Date.now();
        updateConnTitle();
      });
      es.addEventListener('changed', () => {
        if (sse !== es) return;
        lastSseAt = Date.now();
        fetchOverview();
      });
      es.onerror = () => {
        if (sse !== es) return;
        setConn('warn', 'Reconnecting');
        startFallbackPoll();
      };
    }

    async function syncNow(forceReconnect = false) {
      if (forceReconnect || isSseStale()) connectSse();
      setConn('live', 'Syncing…');
      await fetchOverview();
      if (sse && sse.readyState === EventSource.OPEN) {
        setConn('live', 'Live');
      } else {
        setConn('warn', 'Reconnecting');
      }
      updateConnTitle();
    }

    $('connState').addEventListener('click', () => syncNow(true));

    // Recover silently stalled mobile/Safari EventSource on tab wake, focus, or network return.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (isSseStale()) connectSse();
      if (Date.now() - lastSyncedAt > 1500) fetchOverview();
    });
    window.addEventListener('online', () => syncNow(true));
    window.addEventListener('focus', () => {
      if (!document.hidden && Date.now() - lastSyncedAt > 5000) fetchOverview();
    });

    // Heartbeat watchdog: rebuild SSE if no ping/event arrived within SSE_STALE_MS.
    setInterval(() => {
      if (!document.hidden && sse && lastSseAt > 0 && Date.now() - lastSseAt > SSE_STALE_MS) {
        setConn('warn', 'Reconnecting');
        connectSse();
        fetchOverview();
      }
    }, 15000);

    // Keep relative times ("4m ago") honest while no SSE change arrives; skipped while the tab is hidden.
    setInterval(() => {
      if (!document.hidden && state.overview) {
        renderOverview(state.overview);
        updateConnTitle();
      }
    }, 60000);

    fetchOverview();
    connectSse();
  </script>
</body>
</html>`;
}

// Shown to other devices that are not paired yet: enter the 6-digit code from `/check lan`.
function renderPairingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0c0f" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="agy-check" />
  <title>agy-check · Pair this device</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: #0b0c0f;
      color: #e9ebef;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    main { max-width: 380px; margin: 0 auto; padding: calc(64px + env(safe-area-inset-top)) 24px 40px; }
    .logo {
      width: 44px;
      height: 44px;
      margin-bottom: 20px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: #7c9cff;
      background: rgba(124, 156, 255, 0.12);
      border: 1px solid rgba(124, 156, 255, 0.35);
    }
    .logo svg { width: 24px; height: 24px; }
    h1 { margin: 0 0 8px; font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
    p { margin: 0 0 24px; color: #b3b9c4; font-size: 14.5px; line-height: 1.5; }
    code { font-family: "SF Mono", ui-monospace, Menlo, monospace; font-size: 13px; padding: 1px 6px; border-radius: 5px; background: #20242b; color: #e9ebef; white-space: nowrap; }
    input {
      width: 100%;
      height: 56px;
      border-radius: 12px;
      border: 1px solid #323843;
      background: #121419;
      color: #e9ebef;
      font-size: 26px;
      letter-spacing: 0.4em;
      text-indent: 0.4em;
      text-align: center;
      font-variant-numeric: tabular-nums;
      outline: none;
    }
    input:focus { border-color: #7c9cff; }
    button {
      width: 100%;
      height: 50px;
      margin-top: 14px;
      border: 0;
      border-radius: 12px;
      background: #7c9cff;
      color: #0b0c0f;
      font-size: 16px;
      font-weight: 600;
    }
    button:disabled { opacity: 0.5; }
    .msg { min-height: 22px; margin-top: 14px; font-size: 14px; color: #f0646a; text-align: center; }
    .foot { margin-top: 28px; font-size: 12.5px; color: #7c8491; text-align: center; }
    body {
      padding: calc(48px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom));
      background-color: #0b0c0f;
      background-image:
        radial-gradient(ellipse 120% 100% at 50% 0%, rgba(124, 156, 255, 0.09) 0%, rgba(124, 156, 255, 0.05) 34%, rgba(124, 156, 255, 0.016) 64%, rgba(124, 156, 255, 0) 100%);
      background-repeat: no-repeat;
      background-size: 100% 420px;
    }
    main {
      width: min(400px, 100%);
      max-width: none;
      margin: 0 auto;
      padding: 28px 24px 24px;
      background: #121419;
      border: 1px solid #23272e;
      border-top-color: #2c313a;
      border-radius: 16px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 20px 48px -20px rgba(0, 0, 0, 0.7);
    }
    input { background: #0b0c0f; }
    button { cursor: pointer; transition: background-color 0.12s; }
    button:hover:not(:disabled) { background: #93adff; }
    button:focus-visible, input:focus-visible { outline: 2px solid #7c9cff; outline-offset: 2px; }
  </style>
</head>
<body>
  <main>
    <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4.5-6"/></svg></div>
    <h1>Pair this device</h1>
    <p>On the computer running agy, type <code>/check lan</code> (or open the panel and tap <b>Phone</b>), then enter the 6-digit code shown there.</p>
    <form id="pairForm" autocomplete="off">
      <input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="000000" aria-label="Pairing code" autofocus />
      <button id="pairBtn" type="submit">Pair</button>
    </form>
    <div id="msg" class="msg" role="status"></div>
    <div class="foot">A paired device stays signed in for 30 days.</div>
  </main>
  <script>
    const form = document.getElementById('pairForm');
    const input = document.getElementById('code');
    const msg = document.getElementById('msg');
    const btn = document.getElementById('pairBtn');
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\\D/g, '').slice(0, 6);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (input.value.length !== 6) {
        msg.textContent = 'Enter the 6-digit code.';
        return;
      }
      btn.disabled = true;
      msg.textContent = '';
      try {
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: input.value }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          location.replace('/');
          return;
        }
        msg.textContent = data.error || 'Pairing failed.';
      } catch {
        msg.textContent = 'Cannot reach the panel.';
      }
      btn.disabled = false;
      input.select();
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderPanelHtml,
  renderPairingHtml,
};
