import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderPanelHtml, renderPairingHtml } = require('../../runtime/panel-ui.js');

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

describe('panel UI session ops', () => {
  test('panel HTML stays strictly English and inline script parses cleanly', () => {
    const html = renderPanelHtml();
    assert.equal(CJK_RE.test(html), false, 'Panel HTML must contain no CJK characters');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'inline script exists');
    new Function(scriptMatch[1]);

    const pairHtml = renderPairingHtml();
    assert.equal(CJK_RE.test(pairHtml), false, 'Pairing HTML must contain no CJK characters');
  });

  test('renders archive, delete, bulk selection, show-archived, and confirmation modal controls', () => {
    const html = renderPanelHtml();
    const requiredIds = [
      'btnToggleArchived',
      'btnSelectMode',
      'selectAll',
      'btnArchiveDetail',
      'btnArchiveDetailLabel',
      'detailDeleteWrap',
      'btnDeleteDetail',
      'detailOpsNote',
      'bulkBar',
      'bulkCount',
      'btnBulkSelectAll',
      'btnBulkArchive',
      'btnBulkUnarchive',
      'bulkDeleteWrap',
      'btnBulkDelete',
      'btnBulkClear',
      'opToast',
      'opToastBody',
      'btnToastClose',
      'deleteModal',
      'deleteModalTitle',
      'deleteWarn',
      'deleteList',
      'deleteConfirmWrap',
      'deleteConfirmInput',
      'deleteCloseRow',
      'deleteCloseCheck',
      'deleteStatus',
      'deleteHandoff',
      'deleteResults',
      'btnDeleteCancel',
      'btnDeleteConfirm',
    ];
    for (const id of requiredIds) {
      assert.ok(html.includes(`id="${id}"`), `missing element #${id}`);
    }
    assert.ok(html.includes('SESSION_COLS = 11'), 'table column count includes checkbox column');
    assert.ok(html.includes('/api/sessions/archive'), 'archive endpoint wired');
    assert.ok(html.includes('/api/sessions/delete'), 'delete endpoint wired');
    assert.ok(html.includes("confirm: 'DELETE'"), 'typed DELETE confirmation wired');
    assert.ok(html.includes('agy-check panel handoff'), 'handoff command present');
  });
});
