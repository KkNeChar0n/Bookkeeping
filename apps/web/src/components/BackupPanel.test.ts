import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BackupPanel } from './BackupPanel';

function renderBackupPanel(): string {
  const queryClient = new QueryClient();
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(BackupPanel)),
    );
  } finally {
    queryClient.clear();
  }
}

test('backup panel retains backup export and import controls', () => {
  const markup = renderBackupPanel();

  assert.match(markup, /数据备份/);
  assert.match(markup, /<button[^>]*>导出备份<\/button>/);
  assert.match(markup, /<button[^>]*>导入备份<\/button>/);
  assert.match(markup, /<input[^>]*type="file"[^>]*accept="application\/json,\.json"/);
});

test('backup panel does not render the retired ordinary-ledger clearing controls', () => {
  const markup = renderBackupPanel();

  assert.doesNotMatch(markup, /危险操作|清空普通账本|保留基金市值与预充/);
  assert.equal((markup.match(/<button\b/g) ?? []).length, 2);
});
