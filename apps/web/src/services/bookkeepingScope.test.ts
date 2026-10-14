import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { db, type TransactionRow } from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { budgetPlanService } from './budgetPlan.service';
import { consumptionBudgetService } from './consumptionBudget.service';
import { fundSavingsService } from './fundSavings.service';
import { incomeCompareService } from './incomeCompare.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { savingsSummaryService } from './savingsSummary.service';
import { spendService } from './spend.service';
import { spendStatsService } from './spendStats.service';
import { txService } from './transactions.service';

afterEach(async () => {
  db.close();
  await db.delete();
});

async function seedStart() {
  await db.open();
  await db.cards.put({
    id: 'bank', name: '储蓄', type: 'SAVINGS', initialBalance: 10_000,
    isDefault: 1, sortOrder: 1, createdAt: 1,
  });
  await db.bookkeepingStart.put({
    id: 'active', startDate: '2026-10-14', createdAt: 1,
    openingFundPrepaid: 1_000, openingFundMarketValue: 5_000,
    openingSavings: [{ cardId: 'bank', amount: 10_000 }],
  });
}

function expense(id: string, date: string, amount: number, archived = false): TransactionRow {
  return {
    id, date, amount: -amount, cardId: VIRTUAL_CONSUMPTION_CARD_ID, type: 'OUT',
    category: '其他', note: id, peerCardId: null, transferGroupId: null, createdAt: 1,
    ...(archived ? { archivedForReconciliation: true } : {}),
  };
}

test('restart keeps historical and same-day old consumption queryable but only new consumption uses quota and carry', async () => {
  await seedStart();
  await db.transactions.bulkPut([
    expense('september', '2026-09-30', 80_000, true),
    expense('same-day-old', '2026-10-14', 10_000, true),
    expense('same-day-new', '2026-10-14', 2_000),
    expense('backdated-after-start', '2026-10-13', 50_000),
    expense('november', '2026-11-03', 5_000),
  ]);
  await db.consumptionBudgets.bulkPut([
    { id: 'old-budget', savingsCardId: 'bank', month: '2026-09', amount: 100_000, updatedAt: 1 },
    { id: 'new-budget', savingsCardId: 'bank', month: '2026-10', amount: 10_000, updatedAt: 1 },
    { id: 'next-budget', savingsCardId: 'bank', month: '2026-11', amount: 20_000, updatedAt: 1 },
  ]);
  await db.savingsEntries.bulkPut([
    { id: 'old-excess', cardId: 'bank', month: '2026-09', kind: 'EXCESS', amount: 10_000, createdAt: 1 },
    { id: 'new-excess', cardId: 'bank', month: '2026-10', kind: 'EXCESS', amount: 2_000, createdAt: 1 },
  ]);

  const current = await spendService.monthView('2026-10');
  assert.equal(current.totalSpent, '620.00');
  assert.equal(current.spent, '20.00');
  assert.equal(current.remaining, '100.00');
  assert.equal(current.startDate, '2026-10-14');
  assert.equal(current.historicalOnly, false);
  const historical = await spendService.monthView('2026-09');
  assert.equal(historical.totalSpent, '800.00');
  assert.equal(historical.spent, '0.00');
  assert.equal(historical.quota, '0.00');
  assert.equal(historical.excess, '0.00');
  assert.equal(historical.overspend, '0.00');
  assert.equal(historical.historicalOnly, true);
  assert.equal((await spendStatsService.byCategory('2026-10')).total, '620.00');
  assert.equal((await txService.list()).length, 5);
  assert.equal(await consumptionBudgetService.bufferBefore('2026-10'), '0.00');
  assert.equal(await consumptionBudgetService.bufferBefore('2026-11'), '100.00');
  assert.deepEqual(await consumptionBudgetService.reconcileTotals('2026-11'), {
    totalBudget: 30_000, totalSpent: 7_000, carryover: 10_000, overspendPos: 0, buffer: 15_000,
  });
  const year = await spendService.periodView('2026');
  assert.equal(year.totalSpent, '1470.00');
  assert.equal(year.spent, '70.00');
  assert.equal(year.quota, '300.00');
  assert.equal(year.overspend, '0.00');
  assert.equal((await spendService.periodView('2025')).historicalOnly, true);
});

test('asset writers reject archived months before deleting or overwriting any rows', async () => {
  await seedStart();
  const month = '2026-09';
  const writes = [
    () => budgetPlanService.addDetail({ cardId: 'bank', month, label: '', kind: 'IN', amount: '10' }),
    () => budgetPlanService.transfer({ cardId: 'bank', peerCardId: 'peer', month, amount: '10' }),
    () => savingsActualService.setAmount({ cardId: 'bank', month, amount: '10' }),
    () => savingsEntryService.add({ cardId: 'bank', month, kind: 'INCOME', amount: '10' }),
    () => savingsEntryService.setEntry({ cardId: 'bank', month, kind: 'EXCESS', amount: '0' }),
    () => consumptionBudgetService.setBudget({ savingsCardId: 'bank', month, amount: '0' }),
    () => fundSavingsService.set({ month, marketValue: '10', prepaid: '0', netInvestment: '0' }),
  ];
  for (const write of writes) await assert.rejects(write(), /新账从/);
  assert.equal(await db.budgetDetails.count(), 0);
  assert.equal(await db.savingsActuals.count(), 0);
  assert.equal(await db.savingsEntries.count(), 0);
  assert.equal(await db.consumptionBudgets.count(), 0);
  assert.equal(await db.fundSavingsSnapshots.count(), 0);
  await assert.rejects(fundSavingsService.set({
    month: '2026-10', marketValue: '50', prepaid: '10', flowBaseline: true,
  }), /不能再设置历史对账起点/);
  await budgetPlanService.addDetail({ cardId: 'bank', month: '2026-10', label: '', kind: 'IN', amount: '10' });
  await savingsActualService.setAmount({ cardId: 'bank', month: '2026-10', amount: '110' });
  assert.equal(await budgetPlanService.expectedBalance('bank', '2026-10'), 11_000);
});

test('asset reads and fund net investments ignore historical rows even if an imported ledger contains them', async () => {
  await seedStart();
  await db.budgetDetails.bulkPut([
    { id: 'old-income', cardId: 'bank', month: '2026-09', label: '', kind: 'IN', amount: 1_000_000, createdAt: 1 },
    { id: 'new-income', cardId: 'bank', month: '2026-10', label: '', kind: 'IN', amount: 1_000, createdAt: 1 },
  ]);
  await db.savingsActuals.bulkPut([
    { id: 'old-actual', cardId: 'bank', month: '2026-09', amount: 2_000_000, updatedAt: 1 },
    { id: 'new-actual', cardId: 'bank', month: '2026-10', amount: 11_000, updatedAt: 1 },
  ]);
  await db.savingsEntries.bulkPut([
    { id: 'old-income', cardId: 'bank', month: '2026-09', kind: 'INCOME', amount: 1_000_000, createdAt: 1 },
    { id: 'new-income', cardId: 'bank', month: '2026-10', kind: 'INCOME', amount: 1_200, createdAt: 1 },
    { id: 'old-excess', cardId: 'bank', month: '2026-09', kind: 'EXCESS', amount: 1_000_000, createdAt: 1 },
    { id: 'new-excess', cardId: 'bank', month: '2026-10', kind: 'EXCESS', amount: 500, createdAt: 1 },
  ]);
  await db.fundSavingsSnapshots.bulkPut([
    { month: '2026-09', marketValue: 5_000, prepaid: 9_000, netInvestment: 100_000, updatedAt: 1 },
    { month: '2026-10', marketValue: 6_000, prepaid: 0, netInvestment: 1_000, flowBaseline: 1, updatedAt: 1 },
    { month: '2026-11', marketValue: 7_000, prepaid: 0, netInvestment: 1_000, updatedAt: 1 },
  ]);

  assert.equal(await budgetPlanService.expectedBalance('bank', '2026-09'), 0);
  assert.equal(await budgetPlanService.expectedBalance('bank', '2026-10'), 11_000);
  assert.deepEqual((await budgetPlanService.months('bank', ['2026-09'])).map((row) => row.month), ['2026-10']);
  assert.equal(await budgetPlanService.expectedIncome('bank', '2026-09'), 0);
  assert.equal(await budgetPlanService.totalIncomeUpTo('bank', '2026-10'), 1_000);
  assert.equal(await savingsEntryService.actualIncome('2026'), 1_200);
  assert.equal(await savingsEntryService.cumIncomeUpTo('bank', '2026-10'), 1_200);
  assert.equal(await savingsEntryService.cumExcessUpTo('2026-10'), 500);
  assert.deepEqual(await savingsEntryService.list('bank', '2026-09'), []);
  assert.deepEqual(await incomeCompareService.compute('2026'), {
    prefix: '2026', expected: '10.00', actual: '12.00', diff: '2.00',
  });
  assert.deepEqual(await savingsActualService.balanceAsOf('bank', '2026-09'), null);
  assert.deepEqual(await savingsSummaryService.listAsOf('2026-09'), []);
  assert.deepEqual((await savingsActualService.list('bank')).map((row) => row.month), ['2026-10']);
  const historicalFund = await fundSavingsService.get('2026-09');
  assert.equal(historicalFund.filled, false);
  assert.equal(historicalFund.cumulativeNetInvestment, '0.00');
  const activeFund = await fundSavingsService.get('2026-11');
  assert.equal(activeFund.cumulativeNetInvestment, '20.00');
  assert.equal(activeFund.flowBaselineMonth, null);
  assert.equal(activeFund.netInvestment, '10.00');
  assert.equal((await fundSavingsService.list()).length, 2);
});
