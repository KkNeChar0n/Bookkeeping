import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { spendService } from './spend.service';
import { spendStatsService } from './spendStats.service';

test('global month and year views use exact-month sums and only virtual consumption transactions', async () => {
  await db.open();
  await db.cards.bulkPut([
    { id: 's1', name: '储蓄甲', type: 'SAVINGS', initialBalance: 0, isDefault: 1, sortOrder: 1, createdAt: 1 },
    { id: 's2', name: '储蓄乙', type: 'SAVINGS', initialBalance: 0, isDefault: 0, sortOrder: 2, createdAt: 2 },
  ]);
  await db.consumptionBudgets.bulkAdd([
    { id: 'july', savingsCardId: 's1', month: '2026-07', amount: 218_095, updatedAt: 1 },
    { id: 'aug-a', savingsCardId: 's1', month: '2026-08', amount: 120_000, updatedAt: 2 },
    { id: 'aug-b', savingsCardId: 's2', month: '2026-08', amount: 80_000, updatedAt: 3 },
  ]);
  await db.savingsEntries.bulkAdd([
    { id: 'ex-a', cardId: 's1', month: '2026-08', kind: 'EXCESS', amount: 30_000, createdAt: 1 },
    { id: 'ex-b', cardId: 's2', month: '2026-08', kind: 'EXCESS', amount: 20_000, createdAt: 2 },
    { id: 'ex-other', cardId: 's1', month: '2026-09', kind: 'EXCESS', amount: 99_999, createdAt: 3 },
  ]);
  await db.transactions.bulkAdd([
    { id: 'consume', cardId: VIRTUAL_CONSUMPTION_CARD_ID, date: '2026-08-03', type: 'OUT', amount: -220_000, category: '餐饮', note: null, peerCardId: null, transferGroupId: null, createdAt: 1 },
    { id: 'not-consume', cardId: 's1', date: '2026-08-03', type: 'OUT', amount: -999_999, category: '不应统计', note: null, peerCardId: null, transferGroupId: null, createdAt: 2 },
  ]);

  assert.deepEqual(await spendService.monthView('2026-08'), {
    month: '2026-08', quota: '2000.00', hasQuota: true, spent: '2200.00', excess: '500.00',
    remaining: '300.00', overspend: '200.00', overspent: true,
  });
  const annual = await spendService.periodView('2026');
  assert.equal(annual.quota, '4180.95');
  assert.equal(annual.overspend, '200.00');
  const stats = await spendStatsService.byCategory('2026-08');
  assert.equal(stats.total, '2200.00');
  assert.deepEqual(stats.rows.map((row) => row.category), ['餐饮']);
  db.close();
  await db.delete();
});
