import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import type { BookkeepingStartRow } from '../db/db';
import { ConsumptionHistoryRecoveryPanel } from '../components/ConsumptionHistoryRecoveryPanel';
import { addMonths, currentMonthStr } from '../lib/format';
import { SavingsCardPage } from './SavingsCardPage';
import { SummaryPage } from './SummaryPage';

const month = currentMonthStr();
const start: BookkeepingStartRow = {
  id: 'active',
  startDate: `${addMonths(month, 1)}-01`,
  createdAt: Date.parse(`${month}-14T00:00:00Z`),
  openingFundPrepaid: 0,
  openingFundMarketValue: 0,
  openingSavings: [],
  manualOpening: true,
  consumptionHistory: true,
};

function renderPage(
  Page: ComponentType,
  opening: BookkeepingStartRow | null,
  seed?: (queryClient: QueryClient) => void,
): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  queryClient.setQueryData(['bookkeepingStart'], opening);
  seed?.(queryClient);
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient },
        createElement(StaticRouter, { location: '/savings/test' },
          createElement(Routes, {},
            createElement(Route, { path: '/savings/:id', element: createElement(Page) })))),
    );
  } finally {
    queryClient.clear();
  }
}

for (const consumptionHistory of [true, undefined] as const) {
  test(`consumption recovery is available for manual opening with history flag ${String(consumptionHistory)}`, () => {
    const markup = renderPage(ConsumptionHistoryRecoveryPanel, { ...start, consumptionHistory });
    assert.match(markup, /恢复历史消费资金/);
    assert.match(markup, /选择清账前备份，预览消费资金/);
    assert.match(markup, /type="file"/);
    assert.doesNotMatch(markup, /确认恢复消费资金<\/button>/);
  });
}

for (const [name, opening] of [
  ['no opening', null],
  ['non-manual opening', { ...start, manualOpening: undefined, consumptionHistory: undefined }],
] as const) {
  test(`consumption recovery is not offered with ${name}`, () => {
    const markup = renderPage(ConsumptionHistoryRecoveryPanel, opening);
    assert.doesNotMatch(markup, /恢复历史消费资金|type="file"/);
  });
}

function seedConsumption(queryClient: QueryClient, historicalOnly: boolean) {
  queryClient.setQueryData(['spend', 'period', month], {
    month, quota: '2000.00', hasQuota: true,
    spent: '2200.00', excess: '500.00', remaining: '300.00',
    overspend: '200.00', overspent: true, totalSpent: '2200.00',
    historicalOnly, startDate: start.startDate, months: [],
  });
  queryClient.setQueryData(['consumptionBudget', 'reconcileTotals', month], {
    budget: '8000.00', excess: '2500.00', spent: '9000.00', overspend: '1200.00',
  });
}

test('summary displays complete cumulative consumption before the asset opening month without old asset reconciliation', () => {
  const markup = renderPage(SummaryPage, start, (queryClient) => seedConsumption(queryClient, false));

  assert.match(markup, /完整消费累计（截至/);
  assert.match(markup, /累计消费定额<\/span><span>8,000\.00/);
  assert.match(markup, /累计超额充值<\/span><span>2,500\.00/);
  assert.match(markup, /累计已消费<\/span><span>9,000\.00/);
  assert.match(markup, /累计消费超支<\/span><b[^>]*>1,200\.00/);
  assert.match(markup, /该月的消费明细、消费定额、超额充值及超支仍正常统计/);
  assert.doesNotMatch(markup, /历史消费合计|对账 · 总资产|收入 · 实际与预期|储蓄 · 各卡金额/);
});

test('summary retains historical-only consumption for manual opening without the explicit history flag', () => {
  const markup = renderPage(
    SummaryPage, { ...start, consumptionHistory: undefined },
    (queryClient) => seedConsumption(queryClient, true),
  );

  assert.match(markup, /仅保留历史消费查询/);
  assert.match(markup, /历史消费合计/);
  assert.doesNotMatch(markup, /完整消费累计（截至|累计消费定额<\/span>|对账 · 总资产/);
});

test('historical savings editor exposes only consumption funding and EXCESS logs when full history is enabled', () => {
  const markup = renderPage(SavingsCardPage, start, (queryClient) => {
    queryClient.setQueryData(['savings', 'logs', 'test', month], [
      { id: 'old-amount', field: 'AMOUNT', amount: '777.77', createdAt: start.createdAt },
      { id: 'old-income', field: 'INCOME', amount: '888.88', createdAt: start.createdAt },
      { id: 'funding-excess', field: 'EXCESS', amount: '123.45', createdAt: start.createdAt },
    ]);
  });

  assert.match(markup, /超额充值 · 额外充给全局消费账户的钱/);
  assert.match(markup, /全局消费预算的贡献/);
  assert.match(markup, /保存并返回/);
  assert.match(markup, /123\.45/);
  assert.doesNotMatch(markup, /<label>真实储蓄金额|<label>本月收入|填写真实储蓄金额|清除本月数据/);
  assert.doesNotMatch(markup, /777\.77|888\.88|删除此卡|改初始/);
});

test('historical savings funding editor stays unavailable without the full-history flag', () => {
  const markup = renderPage(SavingsCardPage, { ...start, consumptionHistory: undefined });
  assert.doesNotMatch(markup, /全局消费预算的贡献|保存并返回|<label>真实储蓄金额|清除本月数据/);
});
