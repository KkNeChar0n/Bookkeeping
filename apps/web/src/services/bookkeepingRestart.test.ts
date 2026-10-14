import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { db } from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { addMonths, currentMonthStr, todayStr } from '../lib/format';
import { backupService } from './backup.service';
import { bookkeepingRestartService } from './bookkeepingRestart.service';
import { budgetPlanService } from './budgetPlan.service';
import { consumptionBudgetService } from './consumptionBudget.service';
import { fundSavingsService } from './fundSavings.service';
import { reconciliationService } from './reconciliation.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { savingsSummaryService } from './savingsSummary.service';
import { cardsService } from './cards.service';
import { spendStatsService } from './spendStats.service';
import { spendService } from './spend.service';
import { txService } from './transactions.service';

const cardId = 'restart-bank';
const snapshot = () => Promise.all(db.tables.map(async (t) => ({ name: t.name, rows: await t.toArray() })));

async function expense(id: string, amount: number, date = todayStr(), archived?: boolean) {
  await db.transactions.add({
    id, cardId: VIRTUAL_CONSUMPTION_CARD_ID, date, type: 'OUT', amount: -amount,
    category: '其他', note: '保留消费', peerCardId: null, transferGroupId: null, createdAt: 1,
    ...(archived ? { archivedForReconciliation: true } : {}),
  });
}

/** 用户手动填写：期初 = 银行100 + 定额20 + 超额5 + 市值50 + 基金现金10。 */
async function fillManualOpening() {
  const month = currentMonthStr();
  await cardsService.update(cardId, { initialBalance: '185' });
  await budgetPlanService.addDetail({ cardId, month, label: '本月消费预算', kind: 'EXPENSE', amount: '20' });
  await consumptionBudgetService.setBudget({ savingsCardId: cardId, month, amount: '20' });
  await savingsEntryService.setEntry({ cardId, month, kind: 'EXCESS', amount: '5' });
  await savingsActualService.setAmount({ cardId, month, amount: '100' });
  await fundSavingsService.set({ month, marketValue: '50', prepaid: '10', netInvestment: '0' });
}

beforeEach(async () => {
  await db.open();
  await db.cards.add({
    id: cardId, name: '邮政', type: 'SAVINGS', initialBalance: 12_345,
    isDefault: 0, sortOrder: 1, createdAt: 1,
  });
});
afterEach(async () => { db.close(); await db.delete(); });

test('manual restart deletes all old asset records, future plans, logs and local archives while retaining cards and consumption', async () => {
  const month = currentMonthStr();
  const future = addMonths(month, 1);
  await budgetPlanService.addDetail({ cardId, month: future, label: '旧计划', kind: 'IN', amount: '999' });
  await savingsActualService.setAmount({ cardId, month, amount: '80' });
  await savingsEntryService.setEntry({ cardId, month, kind: 'INCOME', amount: '30' });
  await savingsEntryService.setEntry({ cardId, month, kind: 'EXCESS', amount: '20' });
  await consumptionBudgetService.setBudget({ savingsCardId: cardId, month: future, amount: '10' });
  await fundSavingsService.set({ month, marketValue: '88', prepaid: '20', netInvestment: '77' });
  await db.budgetSnapshots.add({ id: 'old-snapshot', date: todayStr(), note: null, createdAt: 1 });
  await db.budgetLines.add({ id: 'old-line', snapshotId: 'old-snapshot', cardId, inAmount: 300, outAmount: 100 });
  await db.initialBalanceLogs.add({ id: 'old-initial-log', cardId, previousAmount: 1, amount: 2, createdAt: 1 });
  await db.ledgerArchives.add({ id: 'old-archive', startDate: todayStr(), createdAt: 1, backup: '{}' });
  await db.cards.update(cardId, { fundPrincipal: 123, fundValue: 456 });
  await db.cards.update(VIRTUAL_CONSUMPTION_CARD_ID, { initialBalance: 999 });
  await expense('current-consumption', 50_000);
  await db.categories.add({ id: 'kept-category', name: '其他', kind: 'expense', sortOrder: 1, createdAt: 1 });

  const start = await bookkeepingRestartService.restart();
  assert.equal(start.startDate, `${month}-01`);
  assert.equal(start.manualOpening, true);
  assert.equal(start.fundOpeningConfirmed, false);
  assert.equal(start.openingFundPrepaid, 0);
  assert.equal(start.openingFundMarketValue, 0);
  assert.deepEqual(start.openingSavings, []);
  for (const table of db.tables) {
    if (['cards', 'categories', 'transactions', 'bookkeepingStart'].includes(table.name)) continue;
    assert.equal(await table.count(), 0, `${table.name} must be cleared`);
  }
  assert.equal(await db.categories.count(), 1);
  for (const card of await db.cards.toArray()) {
    assert.equal(card.initialBalance, 0);
    assert.equal(card.fundPrincipal, undefined);
    assert.equal(card.fundValue, undefined);
  }
  const row = await db.transactions.get('current-consumption');
  assert.equal(row?.archivedForReconciliation, undefined);
  assert.equal(row?.note, '保留消费');
});

test('manual opening includes the fund total once and leaves only excess recharge in the asset difference', async () => {
  const month = currentMonthStr();
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  const report = await reconciliationService.report(month);
  assert.equal(report.budgetTotal, '165.00');
  assert.equal(report.actualTotal, '160.00');
  assert.equal(report.diff, '-5.00');
  assert.equal(report.overspend, '0.00');
  assert.equal(report.prepaid, '5.00');
  assert.equal(report.interest, '0.00');
  assert.equal(report.fundCumulativeNetInvestment, '0.00');
  assert.equal(report.interestChange.previousInterest, '0.00');
  assert.equal(report.interestChange.amount, '0.00');
});

test('all current-month consumption survives and participates, but previous months and backfilled history do not', async () => {
  const month = currentMonthStr();
  const oldMonth = addMonths(month, -1);
  await expense('old-month', 10_000_000, `${oldMonth}-28`);
  await expense('current-before-restart', 2_000, `${month}-01`, true);
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  await expense('current-after-restart', 400);
  await expense('backfilled-old-month', 70_000, `${oldMonth}-01`);

  assert.equal((await db.transactions.get('old-month'))?.archivedForReconciliation, true);
  assert.equal((await db.transactions.get('current-before-restart'))?.archivedForReconciliation, undefined);
  assert.equal((await spendService.monthView(month)).spent, '24.00');
  assert.equal((await spendStatsService.byCategory(oldMonth)).total, '100700.00');
  const totals = await consumptionBudgetService.reconcileTotals(month);
  assert.equal(totals.totalSpent, 2400);
  assert.equal(totals.overspendPos, 400);
  const report = await reconciliationService.compute(month);
  assert.equal(report.diff, '-5.00');
  assert.equal(report.overspend, '4.00');
  assert.equal(report.prepaid, '1.00');
  assert.equal(report.interest, '0.00');
  assert.equal(await consumptionBudgetService.bufferBefore(addMonths(month, 1)), '1.00');
});

test('unused excess carries into next month without reviving old consumption or creating other difference', async () => {
  const month = currentMonthStr();
  const next = addMonths(month, 1);
  await expense('old-month', 10_000_000, `${addMonths(month, -1)}-01`);
  await expense('opening-month-spending', 2400, `${month}-01`);
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  await budgetPlanService.addDetail({ cardId, month: next, label: '次月消费预算', kind: 'EXPENSE', amount: '20' });
  await consumptionBudgetService.setBudget({ savingsCardId: cardId, month: next, amount: '20' });
  await savingsActualService.setAmount({ cardId, month: next, amount: '81' });
  await fundSavingsService.set({ month: next, marketValue: '50', prepaid: '10', netInvestment: '0' });
  const funding = await consumptionBudgetService.fundingForMonth(next);
  assert.equal(funding.prepaidStart, '1.00');
  assert.equal(funding.rows[0].newTransfer, '19.00');
  const report = await reconciliationService.report(next);
  assert.equal(report.diff, '-4.00');
  assert.equal(report.overspend, '4.00');
  assert.equal(report.prepaid, '0.00');
  assert.equal(report.carryover, '1.00');
  assert.equal(report.interest, '0.00');
  assert.equal(report.interestChange.amount, '0.00');
});

test('unconfirmed manual fund opening prevents a false complete reconciliation', async () => {
  await bookkeepingRestartService.restart();
  await cardsService.update(cardId, { initialBalance: '100' });
  await savingsActualService.setAmount({ cardId, month: currentMonthStr(), amount: '100' });
  const report = await reconciliationService.report(currentMonthStr());
  assert.equal(report.fundNetInvestmentFilled, false);
  assert.equal(report.interestChange.amount, null);
  assert.ok(report.interestChange.unavailableReason);
});

test('a missing confirmed fund snapshot cannot produce a complete residual report', async () => {
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  await db.fundSavingsSnapshots.clear();
  const report = await reconciliationService.report(currentMonthStr());
  assert.equal(report.fundNetInvestmentFilled, false);
  assert.equal(report.interestChange.amount, null);
  assert.deepEqual(report.fundMissingNetInvestmentMonths, [currentMonthStr()]);
});

test('manual consumption scope follows the edited month rather than a stale historical marker', async () => {
  await expense('correct-date', 1234, `${addMonths(currentMonthStr(), -1)}-01`);
  await bookkeepingRestartService.restart();
  assert.equal((await spendService.monthView(currentMonthStr())).spent, '0.00');
  await txService.update('correct-date', { date: `${currentMonthStr()}-01` });
  assert.equal((await spendService.monthView(currentMonthStr())).spent, '12.34');
  await txService.update('correct-date', { date: `${addMonths(currentMonthStr(), -1)}-01` });
  assert.equal((await spendService.monthView(currentMonthStr())).spent, '0.00');
});

test('legacy bank OUT is preserved, detached from both card and transfer peers, and counted for the current month', async () => {
  await db.transactions.add({
    id: 'legacy-bank-out', cardId, date: todayStr(), type: 'OUT', amount: -1234,
    category: '其他', note: '旧版银行消费', peerCardId: cardId, transferGroupId: 'legacy-group', createdAt: 1,
  });
  await bookkeepingRestartService.restart();
  const row = await db.transactions.get('legacy-bank-out');
  assert.equal(row?.cardId, VIRTUAL_CONSUMPTION_CARD_ID);
  assert.equal(row?.peerCardId, null);
  assert.equal(row?.transferGroupId, null);
  assert.equal(row?.amount, -1234);
  assert.equal(row?.archivedForReconciliation, undefined);
  assert.equal((await spendStatsService.byCategory(currentMonthStr())).total, '12.34');
  assert.equal((await spendService.monthView(currentMonthStr())).spent, '12.34');
  await cardsService.remove(cardId);
  assert.ok(await db.transactions.get('legacy-bank-out'));
});

test('recharge and adjustment transactions are deleted, not retained in an old ledger archive', async () => {
  await db.transactions.bulkAdd([
    { id: 'old-recharge', cardId: VIRTUAL_CONSUMPTION_CARD_ID, date: todayStr(), type: 'IN', amount: 2000,
      category: null, note: '旧充值', peerCardId: null, transferGroupId: null, createdAt: 1 },
    { id: 'old-adjustment', cardId: VIRTUAL_CONSUMPTION_CARD_ID, date: todayStr(), type: 'ADJUST', amount: 2000,
      category: null, note: '旧调整', peerCardId: null, transferGroupId: null, createdAt: 1 },
  ]);
  await bookkeepingRestartService.restart();
  assert.equal(await db.transactions.count(), 0);
  assert.equal(await db.ledgerArchives.count(), 0);
});

test('first manual fund entry requires an explicit current-month snapshot with known market value and exact zero net investment', async () => {
  const month = currentMonthStr();
  await bookkeepingRestartService.restart();
  const before = await snapshot();
  for (const invalid of [
    { month: addMonths(month, 1), marketValue: '50', prepaid: '10', netInvestment: '0' },
    { month, marketValue: '', prepaid: '10', netInvestment: '0' },
    { month, marketValue: '50', prepaid: '10' },
    { month, marketValue: '50', prepaid: '10', netInvestment: '1' },
    { month, marketValue: '50', prepaid: '10', netInvestment: '0.001' },
    { month, marketValue: '50', prepaid: '10', netInvestment: '0', flowBaseline: true },
  ]) {
    await assert.rejects(fundSavingsService.set(invalid));
    assert.deepEqual(await snapshot(), before);
  }
  await fundSavingsService.set({ month, marketValue: '0', prepaid: '0', netInvestment: '0' });
  assert.equal((await bookkeepingRestartService.current())?.fundOpeningConfirmed, true);
});

test('first fund baseline and snapshot commit atomically, and later edits never rewrite the confirmed opening', async () => {
  const month = currentMonthStr();
  await bookkeepingRestartService.restart();
  const before = await snapshot();
  const fail = () => { throw new Error('simulated fund snapshot failure'); };
  db.fundSavingsSnapshots.hook('creating', fail);
  try {
    await assert.rejects(fundSavingsService.set({ month, marketValue: '50', prepaid: '10', netInvestment: '0' }), /simulated fund snapshot failure/);
  } finally {
    db.fundSavingsSnapshots.hook('creating').unsubscribe(fail);
  }
  assert.deepEqual(await snapshot(), before);
  await fundSavingsService.set({ month, marketValue: '50', prepaid: '10', netInvestment: '0' });
  await fundSavingsService.set({ month, marketValue: '85', prepaid: '0', netInvestment: '20' });
  await fundSavingsService.set({ month: addMonths(month, 1), marketValue: '120', prepaid: '2', netInvestment: '30' });
  const start = await bookkeepingRestartService.current();
  assert.equal(start?.openingFundMarketValue, 5000);
  assert.equal(start?.openingFundPrepaid, 1000);
  assert.equal(start?.fundOpeningConfirmed, true);
  assert.equal((await fundSavingsService.get(month)).cumulativeNetInvestment, '20.00');
  assert.equal((await fundSavingsService.get(addMonths(month, 1))).cumulativeNetInvestment, '50.00');
});

test('cash transfers, fund buys and market changes are neutral after manual opening while bank interest remains visible', async () => {
  const month = currentMonthStr();
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  await savingsActualService.setAmount({ cardId, month, amount: '90' });
  await fundSavingsService.set({ month, marketValue: '50', prepaid: '20', netInvestment: '0' });
  assert.equal((await reconciliationService.compute(month)).interest, '0.00');
  await fundSavingsService.set({ month, marketValue: '85', prepaid: '0', netInvestment: '20' });
  assert.equal((await reconciliationService.compute(month)).interest, '0.00');
  await savingsActualService.setAmount({ cardId, month, amount: '91' });
  const report = await reconciliationService.report(month);
  assert.equal(report.interest, '1.00');
  assert.equal(report.interestChange.amount, '1.00');
});

test('historical asset comparisons are unavailable instead of using the newly hand-entered initial balance', async () => {
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  const oldMonth = addMonths(currentMonthStr(), -1);
  const report = await reconciliationService.report(oldMonth);
  assert.equal(report.reconciliationAvailable, false);
  assert.equal(report.interestChange.amount, null);
  assert.ok(report.interestChange.unavailableReason);
  assert.deepEqual(await savingsSummaryService.listAsOf(oldMonth), []);
  await assert.rejects(budgetPlanService.addDetail({ cardId, month: oldMonth, label: '旧账', kind: 'IN', amount: '1' }));
  await assert.rejects(savingsActualService.setAmount({ cardId, month: oldMonth, amount: '1' }));
});

test('manual restart remains available even without any savings card', async () => {
  await db.cards.delete(cardId);
  await expense('only-history', 100, `${addMonths(currentMonthStr(), -1)}-01`);
  const start = await bookkeepingRestartService.restart();
  assert.equal(start.manualOpening, true);
  assert.equal(await db.transactions.count(), 1);
  assert.deepEqual(start.openingSavings, []);
});

test('late write failure rolls back deleted asset records, card initials and cleared archives together', async () => {
  await expense('keep-me', 100);
  await savingsActualService.setAmount({ cardId, month: currentMonthStr(), amount: '70' });
  await db.ledgerArchives.add({ id: 'keep-archive', startDate: todayStr(), createdAt: 1, backup: '{}' });
  const before = await snapshot();
  const fail = () => { throw new Error('simulated storage failure'); };
  db.bookkeepingStart.hook('creating', fail);
  try {
    await assert.rejects(bookkeepingRestartService.restart(), /simulated storage failure/);
  } finally {
    db.bookkeepingStart.hook('creating').unsubscribe(fail);
  }
  assert.deepEqual(await snapshot(), before);
});

test('external backups restore both the cleared old ledger and the manual opening; repeat restart retains only consumption again', async () => {
  const month = currentMonthStr();
  await expense('old-month', 100, `${addMonths(month, -1)}-01`);
  await expense('current-month', 200);
  await savingsActualService.setAmount({ cardId, month, amount: '70' });
  const previousLedger = await backupService.exportAll();
  await bookkeepingRestartService.restart();
  await fillManualOpening();
  const firstStart = await bookkeepingRestartService.current();
  const saved = await backupService.exportAll();
  await bookkeepingRestartService.restart();
  assert.equal((await bookkeepingRestartService.current())?.fundOpeningConfirmed, false);
  assert.equal((await db.cards.get(cardId))?.initialBalance, 0);
  assert.equal(await db.ledgerArchives.count(), 0);
  assert.equal(await db.transactions.count(), 2);
  assert.equal((await spendService.monthView(month)).spent, '2.00');
  await backupService.importAll(saved);
  assert.deepEqual(await bookkeepingRestartService.current(), firstStart);
  assert.equal((await reconciliationService.compute(month)).interest, '0.00');
  assert.equal((await spendService.monthView(month)).spent, '2.00');
  await backupService.importAll(previousLedger);
  assert.equal(await bookkeepingRestartService.current(), null);
  assert.equal((await db.cards.get(cardId))?.initialBalance, 12_345);
  assert.equal((await savingsActualService.balanceAsOf(cardId, month))?.amount, 7000);
  assert.equal((await db.transactions.get('old-month'))?.archivedForReconciliation, undefined);
});
