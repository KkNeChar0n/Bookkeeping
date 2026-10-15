import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { db } from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { backupService, type BackupData } from './backup.service';
import { consumptionBudgetService } from './consumptionBudget.service';
import { consumptionHistoryRecoveryService } from './consumptionHistoryRecovery.service';
import { reconciliationService } from './reconciliation.service';
import { spendService } from './spend.service';

const bank = {
  id: 'bank', name: '邮政', type: 'SAVINGS' as const, initialBalance: 12345,
  isDefault: 1, sortOrder: 1, createdAt: 1,
};
const snapshot = () => Promise.all(db.tables.map(async (table) => ({ name: table.name, rows: await table.toArray() })));

function source(): BackupData {
  return {
    app: 'bookkeeping', version: 15, exportedAt: '2026-10-14T07:00:00.000Z',
    cards: [{ ...bank, initialBalance: 999999 }], budgetSnapshots: [], budgetLines: [], transactions: [],
    consumptionBudgets: [
      { id: 'q-sep-a', savingsCardId: bank.id, month: '2026-09', amount: 1000, updatedAt: 1 },
      { id: 'q-sep-b', savingsCardId: bank.id, month: '2026-09', amount: 2000, updatedAt: 1 },
      { id: 'q-oct', savingsCardId: bank.id, month: '2026-10', amount: 4000, updatedAt: 1 },
      { id: 'q-future', savingsCardId: bank.id, month: '2026-11', amount: 9999, updatedAt: 1 },
    ],
    savingsEntries: [
      { id: 'e-sep-a', cardId: bank.id, month: '2026-09', kind: 'EXCESS', amount: 500, createdAt: 1 },
      { id: 'e-sep-b', cardId: bank.id, month: '2026-09', kind: 'EXCESS', amount: 100, createdAt: 1 },
      { id: 'e-oct', cardId: bank.id, month: '2026-10', kind: 'EXCESS', amount: 200, createdAt: 1 },
      { id: 'e-future', cardId: bank.id, month: '2026-11', kind: 'EXCESS', amount: 999, createdAt: 1 },
      { id: 'old-income', cardId: bank.id, month: '2026-09', kind: 'INCOME', amount: 888888, createdAt: 1 },
    ],
    savingsActuals: [{ id: 'old-actual', cardId: bank.id, month: '2026-09', amount: 999999, updatedAt: 1 }],
    budgetDetails: [{ id: 'old-budget', cardId: bank.id, month: '2026-09', label: '旧账', kind: 'IN', amount: 999999, createdAt: 1 }],
    fundSavingsSnapshots: [{ month: '2026-09', marketValue: 999999, prepaid: 888888, netInvestment: 777777, updatedAt: 1 }],
    savingsLogs: [{ id: 'old-log', cardId: bank.id, month: '2026-09', field: 'AMOUNT', amount: 999999, createdAt: 1 }],
    initialBalanceLogs: [{ id: 'old-initial', cardId: bank.id, previousAmount: 0, amount: 999999, createdAt: 1 }],
  };
}

beforeEach(async () => {
  await db.open();
  await db.cards.put(bank);
  await db.bookkeepingStart.put({
    id: 'active', startDate: '2026-10-01', createdAt: 1, manualOpening: true,
    fundOpeningConfirmed: false, openingFundPrepaid: 0, openingFundMarketValue: 0, openingSavings: [],
  });
});
afterEach(async () => { db.close(); await db.delete(); });

test('recovery preview is read-only and restore imports only missing historical quota and excess groups', async () => {
  const data = source();
  data.transactions.push({
    id: 'old-not-restored', cardId: bank.id, date: '2026-09-01', type: 'OUT', amount: -999999,
    category: null, note: null, peerCardId: null, transferGroupId: null, createdAt: 1,
  });
  const before = await snapshot();
  const preview = await consumptionHistoryRecoveryService.preview(data);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(preview, {
    exportedAt: data.exportedAt, throughMonth: '2026-10',
    months: [
      { month: '2026-09', budget: '30.00', excess: '6.00' },
      { month: '2026-10', budget: '40.00', excess: '2.00' },
    ],
    totalBudget: '70.00', totalExcess: '8.00', budgetRows: 2, excessRows: 2,
    skippedExisting: 0, skippedFuture: 2,
  });
  assert.deepEqual(await consumptionHistoryRecoveryService.restore(data), preview);
  assert.equal((await db.bookkeepingStart.get('active'))?.consumptionHistory, true);
  assert.deepEqual((await db.consumptionBudgets.orderBy('month').toArray()).map((row) => [row.savingsCardId, row.month, row.amount]), [
    [bank.id, '2026-09', 3000], [bank.id, '2026-10', 4000],
  ]);
  assert.deepEqual((await db.savingsEntries.toArray()).map((row) => [row.cardId, row.month, row.kind, row.amount]).sort(), [
    [bank.id, '2026-09', 'EXCESS', 600], [bank.id, '2026-10', 'EXCESS', 200],
  ].sort());
  for (const entry of before) {
    if (['bookkeepingStart', 'consumptionBudgets', 'savingsEntries'].includes(entry.name)) continue;
    assert.deepEqual(await db.table(entry.name).toArray(), entry.rows, `${entry.name} must not be restored`);
  }
  const after = await snapshot();
  const repeated = await consumptionHistoryRecoveryService.restore(data);
  assert.equal(repeated.budgetRows, 0);
  assert.equal(repeated.excessRows, 0);
  assert.equal(repeated.skippedExisting, 4);
  assert.deepEqual(await snapshot(), after);
});

test('restore recomputes the plan and preserves whole funding groups entered after preview', async () => {
  const data = source();
  assert.equal((await consumptionHistoryRecoveryService.preview(data)).budgetRows, 2);
  await db.consumptionBudgets.bulkAdd([
    { id: 'new-q-sep', savingsCardId: bank.id, month: '2026-09', amount: 8800, updatedAt: 2 },
    { id: 'new-q-oct', savingsCardId: bank.id, month: '2026-10', amount: 9900, updatedAt: 2 },
  ]);
  await db.savingsEntries.bulkAdd([
    { id: 'new-e-sep', cardId: bank.id, month: '2026-09', kind: 'EXCESS', amount: 700, createdAt: 2 },
    { id: 'new-e-oct-a', cardId: bank.id, month: '2026-10', kind: 'EXCESS', amount: 100, createdAt: 2 },
    { id: 'new-e-oct-b', cardId: bank.id, month: '2026-10', kind: 'EXCESS', amount: 200, createdAt: 3 },
  ]);
  const budgets = await db.consumptionBudgets.toArray();
  const excess = await db.savingsEntries.toArray();
  const restored = await consumptionHistoryRecoveryService.restore(data);
  assert.equal(restored.budgetRows, 0);
  assert.equal(restored.excessRows, 0);
  assert.equal(restored.skippedExisting, 4);
  assert.deepEqual(await db.consumptionBudgets.toArray(), budgets);
  assert.deepEqual(await db.savingsEntries.toArray(), excess);
});

test('card matching prefers an exact ID and otherwise accepts only one current same-name savings card', async () => {
  const data = source();
  data.cards[0].name = '备份旧名称';
  await consumptionHistoryRecoveryService.restore(data);
  assert.equal(await consumptionBudgetService.quotaFor('2026-09'), 3000);
  await db.consumptionBudgets.clear();
  await db.savingsEntries.clear();
  data.cards[0] = { ...data.cards[0], id: 'old-bank', name: bank.name };
  data.consumptionBudgets = data.consumptionBudgets?.map((row) => ({ ...row, savingsCardId: 'old-bank' }));
  data.savingsEntries = data.savingsEntries?.map((row) => ({ ...row, cardId: 'old-bank' }));
  await consumptionHistoryRecoveryService.restore(data);
  assert.equal((await db.consumptionBudgets.toArray()).every((row) => row.savingsCardId === bank.id), true);
  assert.equal((await db.savingsEntries.toArray()).every((row) => row.cardId === bank.id), true);
});

test('recovery combines legacy consumption-card quotas per month and never doubles a modern monthly quota', async () => {
  const data = source();
  data.consumptionBudgets = [{ id: 'modern-oct', savingsCardId: bank.id, month: '2026-10', amount: 2000, updatedAt: 1 }];
  data.savingsEntries = [];
  data.spendQuotas = [
    { id: 'old-one', cardId: 'spend-one', month: '2026-09', amount: 1200, updatedAt: 1 },
    { id: 'old-two', cardId: 'spend-two', month: '2026-09', amount: 800, updatedAt: 1 },
    { id: 'modern-fallback', cardId: 'spend-one', month: '2026-10', amount: 999999, updatedAt: 1 },
  ];
  await consumptionHistoryRecoveryService.restore(data);
  assert.deepEqual((await db.consumptionBudgets.orderBy('month').toArray()).map((row) => [row.month, row.amount]), [
    ['2026-09', 2000], ['2026-10', 2000],
  ]);
  await db.consumptionBudgets.clear();
  delete data.consumptionBudgets;
  delete data.savingsEntries;
  data.spendQuotas = data.spendQuotas.slice(0, 2);
  await consumptionHistoryRecoveryService.restore(data);
  assert.equal(await consumptionBudgetService.quotaFor('2026-09'), 2000);
});

test('an explicit zero modern quota suppresses stale same-month legacy quotas during recovery', async () => {
  const data = source();
  data.consumptionBudgets = [
    { id: 'modern-zero', savingsCardId: bank.id, month: '2026-09', amount: 0, updatedAt: 1 },
    { id: 'valid-october', savingsCardId: bank.id, month: '2026-10', amount: 2000, updatedAt: 1 },
  ];
  data.savingsEntries = [];
  data.spendQuotas = [
    { id: 'stale-september', cardId: 'old-consumption-card', month: '2026-09', amount: 999999, updatedAt: 1 },
  ];
  const preview = await consumptionHistoryRecoveryService.preview(data);
  assert.equal(preview.totalBudget, '20.00');
  assert.equal(preview.budgetRows, 1);
  assert.deepEqual(preview.months, [{ month: '2026-10', budget: '20.00', excess: '0.00' }]);
  await consumptionHistoryRecoveryService.restore(data);
  assert.equal(await consumptionBudgetService.quotaFor('2026-09'), 0);
  assert.equal(await consumptionBudgetService.quotaFor('2026-10'), 2000);
  assert.equal(await db.consumptionBudgets.count(), 1);
});

test('malformed, empty, future-only and unmatched recovery files are rejected without writing any table', async () => {
  const before = await snapshot();
  const invalid: unknown[] = [
    null, [], {}, { ...source(), app: 'other' }, { ...source(), exportedAt: 'not-a-date' },
    { ...source(), consumptionBudgets: {} }, { ...source(), savingsEntries: {} }, { ...source(), spendQuotas: {} },
    { ...source(), consumptionBudgets: [], savingsEntries: [] },
    { ...source(), consumptionBudgets: source().consumptionBudgets?.slice(-1), savingsEntries: [] },
    { ...source(), cards: [...source().cards, ...source().cards] },
    { ...source(), cards: [{ ...bank, name: '找不到', id: 'unmatched' }] },
  ];
  for (const amount of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    invalid.push({ ...source(), consumptionBudgets: [{ ...source().consumptionBudgets![0], amount }] });
    invalid.push({ ...source(), savingsEntries: [{ ...source().savingsEntries![0], amount }] });
  }
  for (const month of ['2026-13', '2026-9', '2026-00', 'bad']) {
    invalid.push({ ...source(), consumptionBudgets: [{ ...source().consumptionBudgets![0], month }] });
    invalid.push({ ...source(), savingsEntries: [{ ...source().savingsEntries![0], month }] });
  }
  invalid.push({ ...source(), consumptionBudgets: Array(2).fill(source().consumptionBudgets![0]) });
  invalid.push({ ...source(), savingsEntries: Array(2).fill(source().savingsEntries![0]) });
  invalid.push({ ...source(), consumptionBudgets: [
    { ...source().consumptionBudgets![0], id: 'overflow-a', amount: Number.MAX_SAFE_INTEGER },
    { ...source().consumptionBudgets![0], id: 'overflow-b', amount: 1 },
  ] });
  for (const data of invalid) {
    await assert.rejects(consumptionHistoryRecoveryService.preview(data));
    await assert.rejects(consumptionHistoryRecoveryService.restore(data));
    assert.deepEqual(await snapshot(), before);
  }
  const ambiguous = source();
  ambiguous.cards[0] = { ...bank, id: 'different-id' };
  ambiguous.consumptionBudgets = [{ ...source().consumptionBudgets![0], savingsCardId: 'different-id' }];
  ambiguous.savingsEntries = [];
  await db.cards.add({ ...bank, id: 'same-name-bank' });
  const ambiguousBefore = await snapshot();
  await assert.rejects(consumptionHistoryRecoveryService.restore(ambiguous), /唯一匹配/);
  assert.deepEqual(await snapshot(), ambiguousBefore);
});

test('recovery is limited to manual restarts and a late transaction failure rolls back all groups and the flag', async () => {
  const data = source();
  const before = await snapshot();
  const fail = () => { throw new Error('simulated final marker failure'); };
  db.bookkeepingStart.hook('updating', fail);
  try {
    await assert.rejects(consumptionHistoryRecoveryService.restore(data), /simulated final marker failure/);
  } finally { db.bookkeepingStart.hook('updating').unsubscribe(fail); }
  assert.deepEqual(await snapshot(), before);
  await db.bookkeepingStart.toCollection().modify((start) => { delete start.manualOpening; delete start.fundOpeningConfirmed; });
  const legacy = await snapshot();
  await assert.rejects(consumptionHistoryRecoveryService.restore(data), /仅手工/);
  assert.deepEqual(await snapshot(), legacy);
  await db.bookkeepingStart.clear();
  await assert.rejects(consumptionHistoryRecoveryService.preview(data), /仅手工/);
});

test('restored history contributes to multi-month consumption but not duplicate asset movements or artificial interest', async () => {
  const data = source();
  data.consumptionBudgets = ['2026-08', '2026-09', '2026-10'].map((month) => ({
    id: `quota-${month}`, savingsCardId: bank.id, month, amount: 2000, updatedAt: 1,
  }));
  data.savingsEntries = ['2026-08', '2026-09', '2026-10'].map((month, index) => ({
    id: `excess-${month}`, cardId: bank.id, month, kind: 'EXCESS', amount: [800, 700, 500][index], createdAt: 1,
  }));
  await db.transactions.bulkAdd(['2026-08', '2026-09', '2026-10'].map((month, index) => ({
    id: `consumption-${month}`, cardId: VIRTUAL_CONSUMPTION_CARD_ID, date: `${month}-02`, type: 'OUT' as const,
    amount: -[2400, 2200, 2300][index], category: null, note: null, peerCardId: null, transferGroupId: null,
    createdAt: 1, archivedForReconciliation: true,
  })));
  await consumptionHistoryRecoveryService.restore(data);
  await db.cards.update(bank.id, { initialBalance: 24000 });
  await db.budgetDetails.add({ id: 'current-expense', cardId: bank.id, month: '2026-10', label: '累计定额', kind: 'EXPENSE', amount: 6000, createdAt: 1 });
  await db.savingsActuals.add({ id: 'current-actual', cardId: bank.id, month: '2026-10', amount: 10000, updatedAt: 1 });
  await db.fundSavingsSnapshots.add({ month: '2026-10', marketValue: 5000, prepaid: 1000, netInvestment: 0, updatedAt: 1 });
  await db.bookkeepingStart.update('active', { fundOpeningConfirmed: true, openingFundMarketValue: 5000, openingFundPrepaid: 1000 });
  assert.equal((await spendService.periodView('2026')).spent, '69.00');
  assert.equal((await spendService.periodView('2026')).quota, '60.00');
  assert.equal((await spendService.periodView('2026')).overspend, '9.00');
  const report = await reconciliationService.report('2026-10');
  assert.equal(report.diff, '-20.00');
  assert.equal(report.overspend, '9.00');
  assert.equal(report.carryover, '0.00');
  assert.equal(report.prepaid, '11.00');
  assert.equal(report.interest, '0.00');
  assert.equal(report.interestChange.amount, '0.00');
  const exported = await backupService.exportAll();
  await backupService.importAll(exported);
  assert.equal((await db.bookkeepingStart.get('active'))?.consumptionHistory, true);
  assert.equal((await reconciliationService.report('2026-10')).interest, '0.00');
});
