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
    id: 'recon-source', name: '储蓄卡', type: 'SAVINGS', initialBalance: 10_000,
    isDefault: 1, sortOrder: 1, createdAt: 1,
  });
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-09', amount: '100' });
});
afterEach(async () => { db.close(); await db.delete(); });

test('independent prepaid counts only in actual and internal cash moves are neutral', async () => {
  const before = await reconciliationService.compute('2026-09');
  assert.equal(before.interest, '0.00');
  assert.equal(before.fundNetInvestmentFilled, true);
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-09', amount: '90' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '50', prepaid: '10', netInvestment: '0' });
  const moved = await reconciliationService.compute('2026-09');
  assert.equal(moved.budgetTotal, '150.00');
  assert.equal(moved.actualTotal, '150.00');
  assert.equal(moved.interest, '0.00');
  assert.equal(moved.fundTotal, '60.00');
  assert.equal('fundProfit' in moved, false);
});

test('buying, redeeming, market movement and genuine savings interest remain distinct', async () => {
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-09', amount: '90' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '50', prepaid: '10', netInvestment: '0' });
  // Buy with prepaid cash, with a simultaneous market gain.
  await fundSavingsService.set({ month: '2026-10', marketValue: '65', prepaid: '0', netInvestment: '10' });
  const bought = await reconciliationService.compute('2026-10');
  assert.equal(bought.budgetTotal, '155.00');
  assert.equal(bought.actualTotal, '155.00');
  assert.equal(bought.interest, '0.00');
  // Bank interest is still visible despite the fund.
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-10', amount: '95' });
  assert.equal((await reconciliationService.compute('2026-10')).interest, '5.00');
  // A redemption returns cash, and a market drop remains neutral.
  await fundSavingsService.set({ month: '2026-11', marketValue: '40', prepaid: '20', netInvestment: '-20' });
  const redeemed = await reconciliationService.compute('2026-11');
  assert.equal(redeemed.fundCumulativeNetInvestment, '-10.00');
  assert.equal(redeemed.budgetTotal, '150.00');
  assert.equal(redeemed.actualTotal, '155.00');
  assert.equal(redeemed.interest, '5.00');
  assert.equal((await reconciliationService.compute('2026-09')).interest, '0.00');
  assert.equal((await reconciliationService.compute('2026-10')).interest, '5.00');
});

test('direct savings purchases use the same cash correction and monthly changes overwrite', async () => {
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-09', amount: '70' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '25', prepaid: '0', netInvestment: '20' });
  assert.equal((await reconciliationService.compute('2026-09')).interest, '-10.00');
  await fundSavingsService.set({ month: '2026-09', marketValue: '25', prepaid: '0', netInvestment: '30' });
  const corrected = await reconciliationService.compute('2026-09');
  assert.equal(corrected.budgetTotal, '95.00');
  assert.equal(corrected.actualTotal, '95.00');
  assert.equal(corrected.interest, '0.00');
});

test('unknown investment remains an exposed residual with explicit missing-month warning', async () => {
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-09', amount: '80' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '50', prepaid: '10' });
  const unknown = await reconciliationService.compute('2026-10');
  assert.equal(unknown.interest, '-10.00');
  assert.equal(unknown.fundNetInvestment, null);
  assert.equal(unknown.fundNetInvestmentFilled, false);
  assert.deepEqual(unknown.fundMissingNetInvestmentMonths, ['2026-09', '2026-10']);
  await fundSavingsService.set({ month: '2026-09', marketValue: '50', prepaid: '10', netInvestment: '0' });
  assert.equal((await reconciliationService.compute('2026-09')).interest, '-10.00');
  assert.equal((await reconciliationService.compute('2026-09')).fundNetInvestmentFilled, true);
  // A pre-fund month keeps the previous behavior, even with a future record.
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-08', amount: '105' });
  const beforeFunds = await reconciliationService.compute('2026-08');
  assert.equal(beforeFunds.interest, '5.00');
  assert.equal(beforeFunds.fundNetInvestmentFilled, true);
});

test('baseline preserves genuine residual and unknown market value warns only about asset total', async () => {
  await fundSavingsService.set({ month: '2026-08', marketValue: '50', prepaid: '0', netInvestment: '40' });
  await savingsActualService.setAmount({ cardId: 'recon-source', month: '2026-09', amount: '95' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '', prepaid: '10', flowBaseline: true });
  const baseline = await reconciliationService.compute('2026-09');
  assert.equal(baseline.interest, '5.00');
  assert.equal(baseline.fundNetInvestmentFilled, true);
  assert.equal(baseline.fundNetInvestment, null);
  assert.equal(baseline.fundMarketValueFilled, false);
  assert.equal(baseline.fundFlowBaselineMonth, '2026-09');
  assert.equal((await reconciliationService.compute('2026-10')).fundNetInvestmentFilled, false);
  await fundSavingsService.set({ month: '2026-10', marketValue: '55', prepaid: '0', netInvestment: '10' });
  const next = await reconciliationService.compute('2026-10');
  assert.equal(next.interest, '5.00');
  assert.equal(next.fundNetInvestmentFilled, true);
  assert.equal(next.fundMarketValueFilled, true);
});
