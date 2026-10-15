import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaticRouter } from 'react-router-dom/server';
import type { SpendMonthView } from '../services/spend.service';
import { ConsumptionPage } from './ConsumptionPage';
import { DailyPage } from './DailyPage';

function renderPage(Page: ComponentType, consumptionHistory: boolean): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  const view: SpendMonthView = {
    month: '2026-09', quota: '2000.00', hasQuota: true,
    spent: '2285.54', excess: '1000.00', remaining: '714.46',
    overspend: '285.54', overspent: true,
    totalSpent: '2285.54', historicalOnly: false, startDate: '2026-10-01',
    ...(consumptionHistory ? { consumptionHistory: true } : {}),
  };
  queryClient.setQueryData(['spend', 'month', '2026-09'], view);
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient },
        createElement(StaticRouter, { location: '/?date=2026-09-15' }, createElement(Page))),
    );
  } finally {
    queryClient.clear();
  }
}

for (const [name, Page] of [['daily', DailyPage], ['consumption', ConsumptionPage]] as const) {
  test(`${name} shows the normal quota and overspend before asset restart when consumption history is enabled`, () => {
    const markup = renderPage(Page, true);
    assert.match(markup, /2,000\.00/);
    assert.match(markup, /285\.54/);
    assert.doesNotMatch(markup, /该月全部消费|新账本月|历史消费不占用新账额度|补录只供查询/);
  });

  test(`${name} retains the historical-only display for older restart modes`, () => {
    const markup = renderPage(Page, false);
    assert.match(markup, /该月全部消费/);
    assert.doesNotMatch(markup, /2,000\.00/);
  });
}
