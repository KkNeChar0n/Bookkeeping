import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { db } from '../db/db';
import { fundSavingsService } from './fundSavings.service';
import { reconciliationService } from './reconciliation.service';
import { savingsActualService } from './savingsActual.service';

beforeEach(async () => {
  await db.open();
  await db.cards.add({
    id: 'bank', name: '储蓄卡', type: 'SAVINGS', initialBalance: 15_000,
    isDefault: 1, sortOrder: 1, createdAt: 1,
  });
  await savingsActualService.setAmount({ cardId: 'bank', month: '2026-09', amount: '100' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '50' });
});
afterEach(async () => { db.close(); await db.delete(); });

test('budget is savings expectation while actual adds only market value', async () => {
  const report = await reconciliationService.compute('2026-09');
  assert.equal(report.budgetTotal, '150.00');
  assert.equal(report.actualTotal, '150.00');
  assert.equal(report.diff, '0.00');
  assert.equal(report.interest, '0.00');
  assert.equal('fundPrepaid' in report, false);
  assert.equal('fundNetInvestment' in report, false);
});

test('moving cash into an ordinary fund card and buying funds are asset-neutral', async () => {
  await db.cards.add({
    id: 'fund-cash', name: '基金资金卡', type: 'SAVINGS', initialBalance: 0,
    isDefault: 0, sortOrder: 2, createdAt: 2, isFundCash: 1,
  });
  await savingsActualService.setAmount({ cardId: 'fund-cash', month: '2026-09', amount: '0' });

  await savingsActualService.setAmount({ cardId: 'bank', month: '2026-10', amount: '90' });
  await savingsActualService.setAmount({ cardId: 'fund-cash', month: '2026-10', amount: '10' });
  await fundSavingsService.set({ month: '2026-10', marketValue: '50' });
  assert.equal((await reconciliationService.compute('2026-10')).actualTotal, '150.00');

  await savingsActualService.setAmount({ cardId: 'fund-cash', month: '2026-10', amount: '0' });
  await fundSavingsService.set({ month: '2026-10', marketValue: '60' });
  const bought = await reconciliationService.compute('2026-10');
  assert.equal(bought.actualTotal, '150.00');
  assert.equal(bought.diff, '0.00');
  assert.equal(bought.interest, '0.00');
});

test('market movement and bank interest enter asset change/other', async () => {
  await fundSavingsService.set({ month: '2026-10', marketValue: '55' });
  const marketGain = await reconciliationService.compute('2026-10');
  assert.equal(marketGain.actualTotal, '155.00');
  assert.equal(marketGain.interest, '5.00');

  await savingsActualService.setAmount({ cardId: 'bank', month: '2026-10', amount: '102' });
  const withInterest = await reconciliationService.compute('2026-10');
  assert.equal(withInterest.interest, '7.00');
});

test('legacy prepaid and net investment fields never affect totals', async () => {
  await db.fundSavingsSnapshots.put({
    month: '2026-10', marketValue: 5_000, prepaid: 99_999, netInvestment: -88_888,
    flowBaseline: 1, updatedAt: 2,
  });
  const report = await reconciliationService.compute('2026-10');
  assert.equal(report.budgetTotal, '150.00');
  assert.equal(report.actualTotal, '150.00');
  assert.equal(report.diff, '0.00');
});

test('explicit unknown market value marks assets incomplete and uses zero placeholder', async () => {
  await fundSavingsService.set({ month: '2026-10', marketValue: '' });
  const report = await reconciliationService.compute('2026-10');
  assert.equal(report.fundMarketValueFilled, false);
  assert.equal(report.actualTotal, '100.00');
  assert.equal(report.diff, '-50.00');
});
