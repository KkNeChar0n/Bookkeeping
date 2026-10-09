import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackupData } from './backup.service';
import { backupService, normalizeBackupData } from './backup.service';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { db } from '../db/db';

const source: BackupData = {
  app: 'bookkeeping',
  version: 3,
  exportedAt: '2026-08-01T00:00:00.000Z',
  cards: [
    {
      id: 's',
      name: '储蓄',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 1,
      sortOrder: 0,
      createdAt: 1,
    },
    {
      id: 'c1',
      name: '消费一',
      type: 'SPEND',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 1,
      createdAt: 2,
    },
    {
      id: 'c2',
      name: '消费二',
      type: 'SPEND',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 3,
    },
  ],
  budgetSnapshots: [],
  budgetLines: [],
  transactions: [
    {
      id: 't',
      cardId: 'c2',
      date: '2026-08-02',
      type: 'OUT',
      amount: -100,
      category: null,
      note: null,
      peerCardId: null,
      transferGroupId: null,
      createdAt: 1,
    },
  ],
  spendQuotas: [
    { id: 'q1', cardId: 'c1', month: '2026-07', amount: 100_000, updatedAt: 1 },
    { id: 'q2', cardId: 'c2', month: '2026-07', amount: 118_095, updatedAt: 2 },
    { id: 'q3', cardId: 'c1', month: '2026-08', amount: 999_999, updatedAt: 3 },
  ],
  consumptionBudgets: [
    {
      id: 'b1',
      savingsCardId: 's',
      consumptionCardId: 'c1',
      month: '2026-08',
      amount: 120_000,
      updatedAt: 4,
    },
    {
      id: 'b2',
      savingsCardId: 's',
      consumptionCardId: 'c2',
      month: '2026-08',
      amount: 80_000,
      updatedAt: 5,
    },
  ],
};

test('legacy backup becomes one virtual account and avoids v8 quota double counting', () => {
  const result = normalizeBackupData(source);
  assert.deepEqual(
    result.cards.filter((card) => card.type === 'SPEND').map((card) => card.id),
    [VIRTUAL_CONSUMPTION_CARD_ID],
  );
  assert.equal(result.transactions[0].cardId, VIRTUAL_CONSUMPTION_CARD_ID);
  assert.deepEqual(result.consumptionBudgets.map((row) => [row.month, row.amount]).sort(), [
    ['2026-07', 218_095],
    ['2026-08', 200_000],
  ]);
  assert.deepEqual(result.initialBalanceLogs, []);
  assert.equal('assetTransfers' in result, false);
  assert.deepEqual(result.fundPrincipalLogs, []);
  assert.equal(result.version, 12);
  assert.deepEqual(result.fundMonthSnapshots, []);
  assert.equal('fundContributions' in result, false);
  assert.equal('fundSnapshots' in result, false);
  const again = normalizeBackupData(result);
  assert.deepEqual(again.consumptionBudgets, result.consumptionBudgets);
});

test('v8 backup normalization drops asset transfers and preserves principal audit rows', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 8,
    exportedAt: '2026-10-08T00:00:00.000Z',
    cards: [
      {
        id: 'source-card',
        name: '储蓄',
        type: 'SAVINGS',
        initialBalance: 0,
        isDefault: 1,
        sortOrder: 0,
        createdAt: 1,
      },
      {
        id: 'fund-card',
        name: '基金',
        type: 'FUND',
        initialBalance: 0,
        fundPrincipal: 10_000,
        fundValue: 11_000,
        isDefault: 0,
        sortOrder: 1,
        createdAt: 2,
      },
    ],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
    assetTransfers: [
      {
        id: 'valid-transfer',
        date: '2026-10-01',
        sourceCardId: 'source-card',
        targetKind: 'FUND_PRINCIPAL',
        targetCardId: 'fund-card',
        amount: 5_000,
        principalApplied: 0,
        note: '历史补录',
        createdAt: 3,
      },
      {
        id: 'orphan-transfer',
        date: '2026-10-01',
        sourceCardId: 'deleted-card',
        targetKind: 'FUND_PRINCIPAL',
        targetCardId: 'fund-card',
        amount: 9_000,
        principalApplied: 1,
        note: null,
        createdAt: 4,
      },
    ],
    fundPrincipalLogs: [
      {
        id: 'valid-principal-log',
        fundCardId: 'fund-card',
        previousAmount: 9_000,
        amount: 10_000,
        createdAt: 5,
      },
      {
        id: 'orphan-principal-log',
        fundCardId: 'deleted-fund',
        previousAmount: 0,
        amount: 1,
        createdAt: 6,
      },
    ],
  });

  assert.equal('assetTransfers' in result, false);
  assert.deepEqual(
    result.fundPrincipalLogs.map((row) => row.id),
    ['valid-principal-log'],
  );
});

test('v9 backup normalization restores source snapshot deducted by asset transfer', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 9,
    exportedAt: '2026-10-08T00:00:00.000Z',
    cards: [
      {
        id: 'postal',
        name: '邮政银行',
        type: 'SAVINGS',
        initialBalance: 0,
        isDefault: 1,
        sortOrder: 0,
        createdAt: 1,
      },
      {
        id: 'fund-card',
        name: '基金卡',
        type: 'SAVINGS',
        initialBalance: 0,
        isDefault: 0,
        sortOrder: 1,
        createdAt: 2,
      },
    ],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
    savingsActuals: [
      {
        id: 'postal-october',
        cardId: 'postal',
        month: '2026-10',
        amount: 9_888_085,
        updatedAt: 1,
      },
      {
        id: 'fund-card-october',
        cardId: 'fund-card',
        month: '2026-10',
        amount: 324_500,
        updatedAt: 1,
      },
    ],
    assetTransfers: [
      {
        id: 'v17-transfer',
        date: '2026-10-01',
        sourceCardId: 'postal',
        targetKind: 'SAVINGS',
        targetCardId: 'fund-card',
        amount: 324_500,
        savingsApplied: 1,
        principalApplied: 0,
        note: null,
        createdAt: 3,
      },
    ],
  });

  assert.equal(result.version, 12);
  assert.equal(result.savingsActuals?.find((row) => row.cardId === 'postal')?.amount, 10_212_585);
  assert.equal(result.savingsActuals?.find((row) => row.cardId === 'fund-card')?.amount, 324_500);
  assert.equal('assetTransfers' in result, false);
});

test('legacy backup creates an exported-month fund snapshot from its current values', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 10,
    exportedAt: '2026-09-30T16:00:00.000Z',
    cards: [
      {
        id: 'legacy-fund',
        name: '旧基金',
        type: 'FUND',
        initialBalance: 10_000,
        fundPrincipal: 25_000,
        fundValue: 28_000,
        isDefault: 0,
        sortOrder: 1,
        createdAt: 1,
      },
    ],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
  });

  assert.deepEqual(
    result.fundMonthSnapshots.map((row) => ({
      fundCardId: row.fundCardId,
      month: row.month,
      principal: row.principal,
      value: row.value,
    })),
    [{ fundCardId: 'legacy-fund', month: '2026-09', principal: 25_000, value: 28_000 }],
  );
});

test('v11 backup preserves monthly snapshots, keeps the latest duplicate, and drops orphans', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 11,
    exportedAt: '2026-10-08T00:00:00.000Z',
    cards: [
      {
        id: 'fund',
        name: '基金',
        type: 'FUND',
        initialBalance: 10_000,
        fundPrincipal: 20_000,
        fundValue: 23_000,
        isDefault: 0,
        sortOrder: 1,
        createdAt: 1,
      },
    ],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
    fundMonthSnapshots: [
      {
        id: 'september-old',
        fundCardId: 'fund',
        month: '2026-09',
        principal: 15_000,
        value: 16_000,
        updatedAt: 1,
      },
      {
        id: 'september-latest',
        fundCardId: 'fund',
        month: '2026-09',
        principal: 15_000,
        value: 17_000,
        updatedAt: 2,
      },
      {
        id: 'october',
        fundCardId: 'fund',
        month: '2026-10',
        principal: 20_000,
        value: 23_000,
        updatedAt: 3,
      },
      {
        id: 'orphan',
        fundCardId: 'missing-fund',
        month: '2026-10',
        principal: 99_000,
        value: 99_000,
        updatedAt: 4,
      },
      {
        id: 'invalid-month',
        fundCardId: 'fund',
        month: '2026-13',
        principal: 1,
        value: 1,
        updatedAt: 5,
      },
    ],
  });

  assert.deepEqual(
    result.fundMonthSnapshots
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => [row.id, row.month, row.principal, row.value]),
    [
      ['september-latest', '2026-09', 15_000, 17_000],
      ['october', '2026-10', 20_000, 23_000],
    ],
  );
});

test('v12 export omits the retired asset transfer ledger', async () => {
  db.close();
  await db.delete();
  await db.open();
  await db.cards.add({
    id: 'export-savings',
    name: '储蓄',
    type: 'SAVINGS',
    initialBalance: 10_000,
    isDefault: 1,
    sortOrder: 1,
    createdAt: 1,
  });

  const result = await backupService.exportAll();
  assert.equal(result.version, 12);
  assert.equal('assetTransfers' in result, false);

  db.close();
  await db.delete();
});

test('backup normalization drops orphan history and broken transfer groups', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 6,
    exportedAt: '2026-08-31T00:00:00.000Z',
    cards: [
      {
        id: 'valid-savings',
        name: '有效储蓄卡',
        type: 'SAVINGS',
        initialBalance: 0,
        isDefault: 0,
        sortOrder: 0,
        createdAt: 1,
        savingsPurpose: 'FUND_POOL',
      },
      {
        id: 'valid-fund',
        name: '有效基金',
        type: 'FUND',
        initialBalance: 0,
        isDefault: 0,
        sortOrder: 1,
        createdAt: 2,
      },
      {
        id: 'legacy-spend',
        name: '旧消费卡',
        type: 'SPEND',
        initialBalance: 0,
        isDefault: 0,
        sortOrder: 2,
        createdAt: 3,
      },
    ],
    budgetSnapshots: [{ id: 'snapshot', date: '2026-08-31', note: null, createdAt: 1 }],
    budgetLines: [
      {
        id: 'valid-line',
        snapshotId: 'snapshot',
        cardId: 'valid-savings',
        inAmount: 100,
        outAmount: 0,
      },
      {
        id: 'orphan-line',
        snapshotId: 'snapshot',
        cardId: 'deleted-card',
        inAmount: 900,
        outAmount: 0,
      },
    ],
    transactions: [
      {
        id: 'valid-consumption',
        cardId: 'legacy-spend',
        date: '2026-08-01',
        type: 'OUT',
        amount: -50,
        category: '餐饮',
        note: null,
        peerCardId: null,
        transferGroupId: null,
        createdAt: 1,
      },
      {
        id: 'valid-income',
        cardId: 'valid-savings',
        date: '2026-08-01',
        type: 'IN',
        amount: 100,
        category: null,
        note: null,
        peerCardId: null,
        transferGroupId: null,
        createdAt: 2,
      },
      {
        id: 'orphan-income',
        cardId: 'deleted-card',
        date: '2026-08-01',
        type: 'IN',
        amount: 900,
        category: null,
        note: null,
        peerCardId: null,
        transferGroupId: null,
        createdAt: 3,
      },
      {
        id: 'broken-transfer-valid-side',
        cardId: 'valid-savings',
        date: '2026-08-02',
        type: 'TRANSFER',
        amount: 200,
        category: null,
        note: null,
        peerCardId: 'deleted-card',
        transferGroupId: 'broken-transfer',
        createdAt: 4,
      },
      {
        id: 'broken-transfer-orphan-side',
        cardId: 'deleted-card',
        date: '2026-08-02',
        type: 'TRANSFER',
        amount: -200,
        category: null,
        note: null,
        peerCardId: 'valid-savings',
        transferGroupId: 'broken-transfer',
        createdAt: 4,
      },
    ],
    budgetDetails: [
      {
        id: 'valid-budget',
        cardId: 'valid-savings',
        month: '2026-08',
        label: '有效预算',
        kind: 'IN',
        amount: 100,
        createdAt: 1,
      },
      {
        id: 'orphan-budget-side',
        cardId: 'valid-savings',
        peerCardId: 'deleted-card',
        month: '2026-08',
        label: '孤立调入',
        kind: 'TRANSFER_IN',
        amount: 200,
        createdAt: 2,
      },
    ],
    savingsActuals: [
      {
        id: 'valid-actual',
        cardId: 'valid-savings',
        month: '2026-08',
        amount: 100,
        updatedAt: 1,
      },
      {
        id: 'orphan-actual',
        cardId: 'deleted-card',
        month: '2026-08',
        amount: 900,
        updatedAt: 1,
      },
    ],
    savingsEntries: [
      {
        id: 'valid-entry',
        cardId: 'valid-savings',
        month: '2026-08',
        kind: 'INCOME',
        amount: 100,
        createdAt: 1,
      },
      {
        id: 'orphan-entry',
        cardId: 'deleted-card',
        month: '2026-08',
        kind: 'INCOME',
        amount: 900,
        createdAt: 1,
      },
    ],
    savingsLogs: [
      {
        id: 'orphan-log',
        cardId: 'deleted-card',
        month: '2026-08',
        field: 'INCOME',
        amount: 900,
        createdAt: 1,
      },
    ],
    initialBalanceLogs: [
      {
        id: 'orphan-initial-log',
        cardId: 'deleted-card',
        previousAmount: 0,
        amount: 900,
        createdAt: 1,
      },
    ],
    consumptionBudgets: [
      {
        id: 'valid-consumption-budget',
        savingsCardId: 'valid-savings',
        month: '2026-08',
        amount: 100,
        updatedAt: 1,
      },
      {
        id: 'orphan-consumption-budget',
        savingsCardId: 'deleted-card',
        month: '2026-08',
        amount: 900,
        updatedAt: 1,
      },
    ],
    fundContributions: [
      {
        id: 'valid-funding',
        batchId: 'valid-batch',
        sourceCardId: 'valid-savings',
        fundCardId: 'valid-fund',
        month: '2026-08',
        amount: 100,
        createdAt: 1,
      },
      {
        id: 'orphan-funding',
        batchId: 'orphan-batch',
        sourceCardId: 'deleted-card',
        fundCardId: 'valid-fund',
        month: '2026-08',
        amount: 900,
        createdAt: 1,
      },
      {
        id: 'valid-funding-later',
        batchId: 'valid-batch-later',
        sourceCardId: 'valid-savings',
        fundCardId: 'valid-fund',
        month: '2026-09',
        amount: 50,
        createdAt: 2,
      },
    ],
    fundSnapshots: [
      {
        id: 'valid-fund-snapshot',
        fundCardId: 'valid-fund',
        month: '2026-08',
        value: 100,
        updatedAt: 1,
      },
      {
        id: 'orphan-fund-snapshot',
        fundCardId: 'deleted-card',
        month: '2026-08',
        value: 900,
        updatedAt: 1,
      },
      {
        id: 'valid-fund-snapshot-later',
        fundCardId: 'valid-fund',
        month: '2026-09',
        value: 250,
        updatedAt: 2,
      },
    ],
  });

  assert.deepEqual(
    result.transactions.map((row) => [row.id, row.cardId]),
    [
      ['valid-consumption', VIRTUAL_CONSUMPTION_CARD_ID],
      ['valid-income', 'valid-savings'],
    ],
  );
  assert.deepEqual(
    result.budgetLines.map((row) => row.id),
    ['valid-line'],
  );
  assert.deepEqual(
    result.budgetDetails?.map((row) => row.id),
    ['valid-budget'],
  );
  assert.deepEqual(
    result.savingsActuals?.map((row) => row.id),
    ['valid-actual'],
  );
  assert.deepEqual(
    result.savingsEntries?.map((row) => row.id),
    ['valid-entry'],
  );
  assert.deepEqual(result.savingsLogs, []);
  assert.deepEqual(result.initialBalanceLogs, []);
  assert.deepEqual(
    result.consumptionBudgets.map((row) => row.id),
    ['valid-consumption-budget'],
  );
  const fund = result.cards.find((card) => card.id === 'valid-fund');
  const savings = result.cards.find((card) => card.id === 'valid-savings');
  assert.equal('savingsPurpose' in (savings ?? {}), false);
  assert.equal(fund?.fundPrincipal, 150);
  assert.equal(fund?.fundValue, 250);
  assert.equal('fundContributions' in result, false);
  assert.equal('fundSnapshots' in result, false);
});
