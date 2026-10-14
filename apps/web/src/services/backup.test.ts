import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackupData } from './backup.service';
import { backupService, normalizeBackupData } from './backup.service';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { db } from '../db/db';
import type { BookkeepingStartRow, LedgerArchiveRow } from '../db/db';

const bookkeepingStart: BookkeepingStartRow = {
  id: 'active', startDate: '2026-10-14', createdAt: 10,
  openingFundPrepaid: 1_000, openingFundMarketValue: 5_000,
  openingSavings: [{ cardId: 's', amount: 10_000 }],
};
const ledgerArchive: LedgerArchiveRow = {
  id: 'archive-one', startDate: '2026-10-14', createdAt: 10,
  backup: JSON.stringify({
    app: 'bookkeeping', version: 14, exportedAt: '2026-10-14T00:00:00.000Z',
    cards: [], budgetSnapshots: [], budgetLines: [], transactions: [],
  }),
};

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
  assert.equal('fundPrincipalLogs' in result, false);
  assert.equal(result.version, 15);
  assert.equal(result.bookkeepingStart, null);
  assert.deepEqual(result.ledgerArchives, []);
  assert.deepEqual(result.fundSavingsSnapshots, []);
  assert.equal('fundMonthSnapshots' in result, false);
  assert.equal('fundContributions' in result, false);
  assert.equal('fundSnapshots' in result, false);
  const again = normalizeBackupData(result);
  assert.deepEqual(again.consumptionBudgets, result.consumptionBudgets);
});

test('v8 backup drops transfer and principal details while preserving aggregate market value', () => {
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
  assert.equal('fundPrincipalLogs' in result, false);
  assert.equal(
    result.cards.some((card) => card.type === 'FUND'),
    false,
  );
  assert.deepEqual(
    result.fundSavingsSnapshots.map((row) => [row.month, row.marketValue, row.prepaid]),
    [['2026-10', 11_000, 0]],
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

  assert.equal(result.version, 15);
  assert.equal(result.savingsActuals?.find((row) => row.cardId === 'postal')?.amount, 10_212_585);
  assert.equal(result.savingsActuals?.find((row) => row.cardId === 'fund-card')?.amount, 324_500);
  assert.equal('assetTransfers' in result, false);
});

test('legacy backup creates an exported-month fund savings total from current market value', () => {
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
    result.fundSavingsSnapshots.map((row) => ({
      month: row.month,
      marketValue: row.marketValue,
      prepaid: row.prepaid,
    })),
    [{ month: '2026-09', marketValue: 28_000, prepaid: 0 }],
  );
  assert.equal(
    result.cards.some((card) => card.type === 'FUND'),
    false,
  );
});

test('v11 backup aggregates monthly market values, keeps latest duplicates, and drops orphans', () => {
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
    result.fundSavingsSnapshots
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => [row.month, row.marketValue, row.prepaid]),
    [
      ['2026-09', 17_000, 0],
      ['2026-10', 23_000, 0],
    ],
  );
});

test('v15 export/import round-trips signed net investment and reconciliation markers', async () => {
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
  await db.fundSavingsSnapshots.bulkPut([
    {
      month: '2026-09',
      marketValue: 0,
      prepaid: 5_670,
      flowBaseline: 1,
      marketValueKnown: false,
      updatedAt: 1,
    },
    {
      month: '2026-10',
      marketValue: 50_000,
      prepaid: 2_000,
      netInvestment: -3_000,
      updatedAt: 2,
    },
  ]);

  const result = await backupService.exportAll();
  assert.equal(result.version, 15);
  assert.equal('assetTransfers' in result, false);
  assert.equal('fundPrincipalLogs' in result, false);
  assert.equal('fundMonthSnapshots' in result, false);
  assert.deepEqual(result.fundSavingsSnapshots, [
    {
      month: '2026-09',
      marketValue: 0,
      prepaid: 5_670,
      flowBaseline: 1,
      marketValueKnown: false,
      updatedAt: 1,
    },
    {
      month: '2026-10',
      marketValue: 50_000,
      prepaid: 2_000,
      netInvestment: -3_000,
      updatedAt: 2,
    },
  ]);
  await backupService.importAll(result);
  assert.deepEqual(await db.fundSavingsSnapshots.toArray(), result.fundSavingsSnapshots);

  db.close();
  await db.delete();
});

test('v13 backup keeps the latest valid balances and leaves net investment unknown', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 13,
    exportedAt: '2026-10-09T00:00:00.000Z',
    cards: [],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
    fundSavingsSnapshots: [
      { month: '2026-09', marketValue: 10_000, prepaid: 500, updatedAt: 1 },
      { month: '2026-09', marketValue: 12_000, prepaid: 800, updatedAt: 2 },
      { month: 'bad', marketValue: 99_000, prepaid: 0, updatedAt: 3 },
    ],
  });

  assert.deepEqual(result.fundSavingsSnapshots, [
    { month: '2026-09', marketValue: 12_000, prepaid: 800, updatedAt: 2 },
  ]);
  assert.equal('netInvestment' in result.fundSavingsSnapshots[0], false);
});

test('backup strips invalid net investment without dropping valid fund balances', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 14,
    exportedAt: '2026-10-09T00:00:00.000Z',
    cards: [],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
    fundSavingsSnapshots: [
      {
        month: '2026-10',
        marketValue: 2_523_784,
        prepaid: 261_000,
        netInvestment: Number.MAX_SAFE_INTEGER + 1,
        updatedAt: 1,
      },
      {
        month: '2026-11',
        marketValue: 2_600_000,
        prepaid: 100_000,
        netInvestment: 0.5,
        updatedAt: 2,
      },
    ],
  });

  assert.deepEqual(result.fundSavingsSnapshots, [
    { month: '2026-10', marketValue: 2_523_784, prepaid: 261_000, updatedAt: 1 },
    { month: '2026-11', marketValue: 2_600_000, prepaid: 100_000, updatedAt: 2 },
  ]);
  assert.equal(
    result.fundSavingsSnapshots.every((row) => !('netInvestment' in row)),
    true,
  );
});

test('backup strictly sanitizes reconciliation markers and baseline net investment', () => {
  const result = normalizeBackupData({
    app: 'bookkeeping',
    version: 14,
    exportedAt: '2026-10-09T00:00:00.000Z',
    cards: [],
    budgetSnapshots: [],
    budgetLines: [],
    transactions: [],
    fundSavingsSnapshots: [
      {
        month: '2026-09',
        marketValue: 0,
        prepaid: 567_000,
        netInvestment: 123_000,
        flowBaseline: 1,
        marketValueKnown: false,
        updatedAt: 1,
      },
      {
        month: '2026-10',
        marketValue: 2_523_784,
        prepaid: 261_000,
        netInvestment: 50_000,
        flowBaseline: true,
        marketValueKnown: 0,
        updatedAt: 2,
      },
    ],
  } as unknown as BackupData);

  assert.deepEqual(result.fundSavingsSnapshots, [
    {
      month: '2026-09',
      marketValue: 0,
      prepaid: 567_000,
      flowBaseline: 1,
      marketValueKnown: false,
      updatedAt: 1,
    },
    {
      month: '2026-10',
      marketValue: 2_523_784,
      prepaid: 261_000,
      netInvestment: 50_000,
      updatedAt: 2,
    },
  ]);
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
  const savings = result.cards.find((card) => card.id === 'valid-savings');
  assert.equal('savingsPurpose' in (savings ?? {}), false);
  assert.equal(
    result.cards.some((card) => card.type === 'FUND'),
    false,
  );
  assert.deepEqual(
    result.fundSavingsSnapshots.map((row) => [row.month, row.marketValue, row.prepaid]),
    [['2026-08', 250, 0]],
  );
  assert.equal('fundContributions' in result, false);
  assert.equal('fundSnapshots' in result, false);
});

test('backup API no longer exposes the retired non-fund clearing operation', () => {
  assert.equal('clearAllExceptFund' in backupService, false);
  assert.equal(typeof backupService.downloadBackup, 'function');
  assert.equal(typeof backupService.importFromFile, 'function');
});

test('v15 backup preserves the start, archive and strict consumption archive flag', async () => {
  db.close();
  await db.delete();
  await db.open();
  try {
    const input: BackupData = {
      ...source,
      version: 15,
      bookkeepingStart,
      ledgerArchives: [ledgerArchive],
      transactions: source.transactions.map((row) => ({ ...row, archivedForReconciliation: true })),
    };
    await backupService.importAll(input);
    const exported = await backupService.exportAll();
    assert.equal(exported.version, 15);
    assert.deepEqual(exported.bookkeepingStart, bookkeepingStart);
    assert.deepEqual(exported.ledgerArchives, [ledgerArchive]);
    assert.equal(exported.transactions[0].archivedForReconciliation, true);
    await backupService.importAll(exported);
    assert.deepEqual(await db.bookkeepingStart.get('active'), bookkeepingStart);
    assert.deepEqual(await db.ledgerArchives.toArray(), [ledgerArchive]);
    assert.equal((await db.transactions.get('t'))?.archivedForReconciliation, true);

    const sanitized = normalizeBackupData({
      ...input,
      transactions: input.transactions.map((row) => ({ ...row, archivedForReconciliation: 'true' })),
    } as unknown as BackupData);
    assert.equal('archivedForReconciliation' in sanitized.transactions[0], false);
  } finally { db.close(); await db.delete(); }
});

test('importing an old backup clears the previous start and archives', async () => {
  db.close();
  await db.delete();
  await db.open();
  try {
    await db.bookkeepingStart.put(bookkeepingStart);
    await db.ledgerArchives.put(ledgerArchive);
    await backupService.importAll(source);
    assert.equal(await db.bookkeepingStart.count(), 0);
    assert.equal(await db.ledgerArchives.count(), 0);
    assert.equal((await backupService.exportAll()).bookkeepingStart, null);
  } finally { db.close(); await db.delete(); }
});

test('damaged restart metadata is rejected before any existing ledger data is replaced', async () => {
  db.close();
  await db.delete();
  await db.open();
  try {
    await db.bookkeepingStart.put(bookkeepingStart);
    const before = await backupService.exportAll();
    for (const patch of [
      { startDate: '2026-02-30' },
      { id: 'other' },
      { openingFundPrepaid: -1 },
      { openingFundMarketValue: Number.MAX_SAFE_INTEGER + 1 },
      { openingSavings: [{ cardId: 's', amount: 1 }, { cardId: 's', amount: 2 }] },
      { openingSavings: [{ cardId: '', amount: 1 }] },
      { openingSavings: [{ cardId: 's', amount: 0.5 }] },
      { createdAt: NaN },
      { manualOpening: false },
      { manualOpening: 'true' },
      { fundOpeningConfirmed: true },
      { manualOpening: true, fundOpeningConfirmed: 'true' },
      { manualOpening: true, fundOpeningConfirmed: false },
      { manualOpening: true, startDate: '2026-10-01' },
    ]) {
      await assert.rejects(
        backupService.importAll({ ...source, bookkeepingStart: { ...bookkeepingStart, ...patch } } as BackupData),
        /起账/,
      );
    }
    const after = await backupService.exportAll();
    assert.deepEqual({ ...after, exportedAt: '' }, { ...before, exportedAt: '' });
  } finally { db.close(); await db.delete(); }
});

test('manual opening mode and the confirmed fixed fund baseline survive normalization', () => {
  const manualStart: BookkeepingStartRow = {
    ...bookkeepingStart,
    startDate: '2026-10-01',
    manualOpening: true,
    fundOpeningConfirmed: true,
    openingSavings: [],
  };
  assert.deepEqual(normalizeBackupData({
    ...source, bookkeepingStart: manualStart,
    fundSavingsSnapshots: [{ month: '2026-10', marketValue: 5_000, prepaid: 1_000, netInvestment: 0, updatedAt: 1 }],
  }).bookkeepingStart, manualStart);
  const unconfirmed = { ...manualStart, fundOpeningConfirmed: false, openingFundMarketValue: 0, openingFundPrepaid: 0 };
  assert.deepEqual(normalizeBackupData({ ...source, bookkeepingStart: unconfirmed }).bookkeepingStart, unconfirmed);
});

test('a damaged confirmed manual fund opening is rejected before replacing the active ledger', async () => {
  db.close();
  await db.delete();
  await db.open();
  try {
    await db.bookkeepingStart.put(bookkeepingStart);
    const before = await backupService.exportAll();
    const confirmed: BookkeepingStartRow = {
      ...bookkeepingStart, startDate: '2026-10-01', manualOpening: true, fundOpeningConfirmed: true,
      openingSavings: [],
    };
    for (const fundSavingsSnapshots of [
      undefined,
      [],
      [{ month: '2026-11', marketValue: 5_000, prepaid: 1_000, netInvestment: 0, updatedAt: 1 }],
      [{ month: '2026-10', marketValue: -1, prepaid: 1_000, netInvestment: 0, updatedAt: 1 }],
    ]) {
      await assert.rejects(backupService.importAll({
        ...source, bookkeepingStart: confirmed, fundSavingsSnapshots,
      }), /基金开账/);
      const after = await backupService.exportAll();
      assert.deepEqual({ ...after, exportedAt: '' }, { ...before, exportedAt: '' });
    }
  } finally { db.close(); await db.delete(); }
});

test('archive validation rejects duplicate, damaged and recursively nested archives', () => {
  for (const archives of [
    [ledgerArchive, ledgerArchive],
    [{ ...ledgerArchive, backup: 'broken json' }],
    [{ ...ledgerArchive, startDate: '2026-13-01' }],
    [{ ...ledgerArchive, backup: JSON.stringify({ app: 'other', cards: [], transactions: [] }) }],
    [{ ...ledgerArchive, backup: JSON.stringify({
      app: 'bookkeeping', cards: [], transactions: [], ledgerArchives: [ledgerArchive],
    }) }],
  ]) {
    assert.throws(() => normalizeBackupData({ ...source, ledgerArchives: archives }), /归档/);
  }
  const previousStart = { ...bookkeepingStart, startDate: '2026-09-01' };
  const archived = {
    ...ledgerArchive,
    backup: JSON.stringify({ ...source, bookkeepingStart: previousStart, ledgerArchives: [] }),
  };
  const normalized = normalizeBackupData({ ...source, bookkeepingStart, ledgerArchives: [archived] });
  assert.deepEqual(normalized.ledgerArchives, [archived]);
  assert.deepEqual(normalized.bookkeepingStart, bookkeepingStart);
  // A deleted card's opening snapshot remains useful audit history and must survive normalization.
  assert.deepEqual(normalizeBackupData({
    ...source,
    bookkeepingStart: { ...bookkeepingStart, openingSavings: [{ cardId: 'deleted', amount: 5 }] },
  }).bookkeepingStart?.openingSavings, [{ cardId: 'deleted', amount: 5 }]);
});
