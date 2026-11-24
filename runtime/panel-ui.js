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
    .drawer-kicker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
    .drawer-title { margin: 6px 0 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
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
      inset: 0;
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
      max-height: 86vh;
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
      .top-right { width: 100%; justify-content: space-between; gap: 10px; flex-wrap: nowrap; }
      .acct { min-width: 0; flex: 1; justify-content: flex-end; }
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
      .toolbar { width: 100%; }
      .toolbar .btn { flex: 1; justify-content: center; }
      .field.search { flex: 1 1 100%; height: 38px; }
      /* iOS zooms into inputs under 16px on focus, which pushes the page past the screen edge. */
      input.field, select.field { font-size: 16px; }

      .table-scroll { overflow: visible; }
      table.sessions { min-width: 0; }
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
      #sessionsBody > tr[data-id] > td,
      #sessionsBody > tr[data-id]:hover > td,
      #sessionsBody > tr.selected > td {
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

      .drawer-head { padding: calc(14px + env(safe-area-inset-top)) 16px 12px; }
      #btnCopyResumeLabel { display: none; }
      .chips { padding: 12px 16px; }
      .stat { padding: 12px 16px; }
      .stat-value { font-size: 16px; }
      .chart-wrap { padding: 14px 16px 10px; }
      .turns-head { padding: 14px 16px 6px; }
      table.turns th:nth-child(n + 2):nth-child(-n + 7), table.turns td:nth-child(n + 2):nth-child(-n + 7) { display: none; }
      table.turns th:first-child, table.turns td:first-child { padding-left: 16px; }
      table.turns th:last-child, table.turns td:last-child { padding-right: 16px; }
      table.turns td.diag { min-width: 0; }
      .modal { padding: 18px 18px calc(18px + env(safe-area-inset-bottom)); }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <span class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4.5-6"/></svg></span>
        <span class="brand-name">agy-check</span>
        <span id="connState" class="conn"><span class="dot"></span>Connecting</span>
      </div>
      <div class="top-right">
        <span id="rangeCost" class="cost-pill" title="Estimated API cost for the selected range; updates after every completed turn"><span class="k">24h</span>--</span>
        <span class="acct"><span class="muted">Account</span><span id="acctEmail">--</span><span id="tierBadge" class="tier" hidden></span></span>
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
          <button id="btnToggleCost" class="btn toggle" aria-pressed="false">Show cost</button>
        </div>
      </div>
      <div class="table-scroll">
        <table id="sessTable" class="sessions hide-cost">
          <thead>
            <tr>
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
            <tr><td colspan="10" class="empty">Loading sessions…</td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-foot muted"><span class="kbd-hint">Click a session for turn-by-turn detail · ↑ ↓ to step through sessions · Esc to close · </span>Costs are API-equivalent estimates: every model Antigravity serves (Gemini and 3P such as Opus) is priced at its Google list rate for each turn's time. Antigravity membership usage is not billed per token; models without a known price show as unpriced, never as free.<span id="accessNote"></span></div>
    </section>
  </main>

  <aside id="drawer" class="drawer" aria-hidden="true">
    <div class="drawer-head">
      <div style="min-width:0">
        <div id="detailKicker" class="drawer-kicker"></div>
        <h2 id="detailTitle" class="drawer-title">Session</h2>
      </div>
      <div class="drawer-actions">
        <button id="btnCopyResume" class="btn sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          <span id="btnCopyResumeLabel">Copy resume command</span>
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

  <div id="lanModal" class="modal-backdrop">
    <div class="modal">
      <h2>Open on a phone</h2>
      <p>On the phone, open one of these addresses and enter the pairing code. A paired phone stays signed in for 30 days and can view this panel and refresh quota; account sync stays on this Mac.</p>
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
        <code>agy-sync-keychain.sh</code> restarts stale interactive <code>agy</code> processes and reopens their non-empty conversations in new iTerm2 tabs, so old in-memory refresh tokens cannot overwrite macOS Keychain backwards.
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
    const SESSION_COLS = 10;
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
      selectedId: null,
      overview: null,
      detail: null,
    };

    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (RANGES[prefs.range]) state.range = prefs.range;
      if (SORTS.includes(prefs.sort)) state.sort = prefs.sort;
      state.showEmpty = prefs.showEmpty === true;
      state.showCost = prefs.showCost !== false;
    } catch {}

    function savePrefs() {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({
          range: state.range,
          sort: state.sort,
          showEmpty: state.showEmpty,
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
      const auth = data.auth || {};
      const quota = data.quota || {};
      const summary = data.summary || {};
      renderTopbar(auth, quota, summary);
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
      renderQuota(quota, data.accounts || []);
      renderModels(summary.byModel || [], summary.cost?.byModel || {});
      renderSessions(data, summary);
    }

    function renderTopbar(auth, quota, summary) {
      $('acctEmail').textContent = auth.activeEmail
        ? auth.activeEmail + (auth.expired ? ' (expired)' : '')
        : (auth.loggedIn ? 'Signed in' : 'Not logged in');
      $('acctEmail').className = auth.expired ? 't-bad' : (auth.loggedIn ? '' : 't-warn');
      $('tierBadge').hidden = !quota.tier;
      $('tierBadge').textContent = quota.tier || '';
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
      return '<div class="qrow"><div class="qrow-top"><span>' + label + '</span><span class="qpct t-' + tone + '">' + win.percent + '%</span></div>' +
        meter(win.percent, tone) +
        '<div class="qrow-foot">' + (win.resetIn ? 'Resets in ' + esc(win.resetIn) : '&nbsp;') + '</div></div>';
    }

    function renderQuota(quota, accounts) {
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

    function sessionRow(s) {
      const st = statusOf(s);
      const syncPill = s.syncStatus === 'unsynced'
        ? '<span class="pill warn" title="Running process holds an older account">unsynced</span>'
        : (s.syncStatus === 'other_account' && s.accountEmail
          ? '<span class="pill" title="' + esc(s.accountEmail) + '">' + esc(s.accountEmail.split('@')[0]) + '</span>'
          : '');
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
        s.syncStatus === 'unsynced' ? 'unsynced' : '',
      ].filter(Boolean).join(' ');

      return '<tr class="' + rowCls + '" data-id="' + esc(s.conversationId) + '">' +
        '<td class="c-status"><div class="status"><span class="dot ' + st + '"></span>' + STATUS_LABEL[st] + syncPill + '</div>' +
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
      $('btnToggleCost').setAttribute('aria-pressed', String(state.showCost));
      $('sessTable').classList.toggle('hide-cost', !state.showCost);
      updateAccountFilter(data.accounts || [], sessions, summary);
      updateSortHeaders();

      $('sessionsBody').innerHTML = sessions.length === 0
        ? '<tr><td colspan="' + SESSION_COLS + '" class="empty">No sessions match the current filter.</td></tr>'
        : sessions.map(sessionRow).join('');
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

    function renderDetail(d) {
      const st = statusOf(d);
      $('detailKicker').innerHTML = '<span class="dot ' + st + '"></span><span>' +
        segs([STATUS_LABEL[st], esc(d.modelLabel || '--'), 'updated ' + esc(fmtRel(d.lastActivityMs))]) + '</span>';
      $('detailTitle').textContent = d.title || d.conversationId;

      const sp = speedParts(d.speed);
      const syncTone = d.syncStatus === 'unsynced' ? 'warn' : '';
      $('detailChips').innerHTML = [
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
        if (!row) return;
        detail = Object.assign({}, row, { turns: [] });
      }
      state.detail = detail;
      setDrawer(true);
      renderDetail(detail);
      if (switching) $('drawerBody').scrollTop = 0;
    }

    function closeDetail() {
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
      try {
        const res = await fetch('/api/overview?' + qs.toString());
        if (res.status === 401) {
          location.reload(); // this device was signed out; the server now shows the pairing page
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (seq !== overviewSeq) return; // a newer request superseded this one
        renderOverview(data);
      } catch {
        return;
      }
      if (state.selectedId) fetchDetail(state.selectedId);
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
      $('syncPreviewSummary').innerHTML =
        '<span class="pill info">Keychain: ' + esc(plan.keychain?.email || 'unknown') + '</span>' +
        '<span class="pill warn">Will restart &amp; reopen: ' + (plan.reopen || []).length + '</span>' +
        '<span class="pill">Skipped empty/other: ' + (plan.skipped || []).length + '</span>';
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

    $('btnToggleCost').addEventListener('click', () => {
      state.showCost = !state.showCost;
      savePrefs();
      $('btnToggleCost').setAttribute('aria-pressed', String(state.showCost));
      $('sessTable').classList.toggle('hide-cost', !state.showCost);
    });

    $('sessionsBody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (tr.dataset.id === state.selectedId) {
        closeDetail();
        return;
      }
      fetchDetail(tr.dataset.id);
    });

    $('btnCloseDetail').addEventListener('click', closeDetail);

    $('btnCopyResume').addEventListener('click', async () => {
      if (!state.detail?.resumeCommand) return;
      if (await copyText(state.detail.resumeCommand)) {
        $('btnCopyResumeLabel').textContent = 'Copied';
        setTimeout(() => { $('btnCopyResumeLabel').textContent = 'Copy resume command'; }, 1200);
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
        if ($('lanModal').classList.contains('open')) closeLanModal();
        else if ($('syncModal').classList.contains('open')) $('syncModal').classList.remove('open');
        else if (state.selectedId) closeDetail();
        return;
      }
      if (!state.selectedId || $('syncModal').classList.contains('open') || $('lanModal').classList.contains('open')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(e.key === 'ArrowDown' ? 1 : -1);
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.detail && $('drawer').classList.contains('open')) {
          drawTurnChart(state.detail);
        }
      }, 150);
    });

    // Keep relative times ("4m ago") honest while no SSE change arrives; skipped while the tab is hidden.
    setInterval(() => {
      if (!document.hidden && state.overview) renderOverview(state.overview);
    }, 60000);

    function setConn(kind, label) {
      $('connState').innerHTML = '<span class="dot ' + kind + '"></span>' + label;
    }

    function connectSse() {
      const es = new EventSource('/api/events');
      es.onopen = () => setConn('live', 'Live');
      es.addEventListener('changed', () => fetchOverview());
      es.onerror = () => setConn('warn', 'Reconnecting');
    }

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
    code { font-family: "SF Mono", ui-monospace, Menlo, monospace; font-size: 13px; padding: 1px 6px; border-radius: 5px; background: #20242b; color: #e9ebef; }
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
    .foot { margin-top: 28px; font-size: 12.5px; color: #7c8491; }
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
