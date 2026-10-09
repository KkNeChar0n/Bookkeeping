import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import Dexie from 'dexie';
import { BookkeepingDB } from './db';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';

test('v9 migration merges legacy spend cards transactionally', async () => {
  const name = `bookkeeping-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(8).stores({
    cards: 'id, sortOrder, isDefault, type',
    transactions: 'id, cardId, date, type, transferGroupId, [cardId+date]',
    spendQuotas: 'id, &[cardId+month], cardId',
    consumptionBudgets:
      'id, &[savingsCardId+consumptionCardId+month], [savingsCardId+month], [consumptionCardId+month], month',
  });
  await legacy.open();
  await legacy.table('cards').bulkAdd([
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
  ]);
  await legacy.table('transactions').add({
    id: 't',
    cardId: 'c1',
    date: '2026-08-01',
    type: 'OUT',
    amount: -100,
    category: null,
    note: null,
    peerCardId: null,
    transferGroupId: null,
    createdAt: 1,
  });
  await legacy.table('spendQuotas').bulkAdd([
    { id: 'q1', cardId: 'c1', month: '2026-07', amount: 100_000, updatedAt: 1 },
    { id: 'q2', cardId: 'c2', month: '2026-07', amount: 118_095, updatedAt: 2 },
    { id: 'q3', cardId: 'c1', month: '2026-08', amount: 999_999, updatedAt: 3 },
  ]);
  await legacy.table('consumptionBudgets').bulkAdd([
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
  ]);
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  assert.deepEqual(
    (await upgraded.cards.where('type').equals('SPEND').toArray()).map((row) => row.id),
    [VIRTUAL_CONSUMPTION_CARD_ID],
  );
  assert.equal((await upgraded.transactions.get('t'))?.cardId, VIRTUAL_CONSUMPTION_CARD_ID);
  const budgets = await upgraded.consumptionBudgets.toArray();
  assert.deepEqual(budgets.map((row) => [row.month, row.amount]).sort(), [
    ['2026-07', 218_095],
    ['2026-08', 200_000],
  ]);
  assert.equal(
    upgraded.tables.some((table) => table.name === 'spendQuotas'),
    false,
  );
  upgraded.close();
  const reopened = new BookkeepingDB(name);
  await reopened.open();
  assert.deepEqual(
    (await reopened.consumptionBudgets.toArray()).map((row) => [row.month, row.amount]).sort(),
    [
      ['2026-07', 218_095],
      ['2026-08', 200_000],
    ],
  );
  reopened.close();
  await Dexie.delete(name);
});

test('a failed v9 upgrade rolls the whole migration back', async () => {
  const name = `bookkeeping-rollback-${crypto.randomUUID()}`;
  const schema = {
    cards: 'id, sortOrder, isDefault, type',
    transactions: 'id, cardId, date, type, transferGroupId, [cardId+date]',
    spendQuotas: 'id, &[cardId+month], cardId',
    consumptionBudgets:
      'id, &[savingsCardId+consumptionCardId+month], [savingsCardId+month], [consumptionCardId+month], month',
  };
  const legacy = new Dexie(name);
  legacy.version(8).stores(schema);
  await legacy.open();
  await legacy.table('cards').bulkAdd([
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
      id: 'c',
      name: '旧消费',
      type: 'SPEND',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 1,
      createdAt: 2,
    },
  ]);
  await legacy.table('transactions').add({
    id: 't',
    cardId: 'c',
    date: '2026-07-01',
    type: 'OUT',
    amount: -100,
    category: null,
    note: null,
    peerCardId: null,
    transferGroupId: null,
    createdAt: 1,
  });
  await legacy
    .table('spendQuotas')
    .add({ id: 'q', cardId: 'c', month: '2026-07', amount: 100, updatedAt: 1 });
  legacy.close();

  const originalRandomUUID = crypto.randomUUID.bind(crypto);
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: () => {
      throw new Error('forced migration failure');
    },
  });
  try {
    const failed = new BookkeepingDB(name);
    await assert.rejects(failed.open(), /forced migration failure/);
    failed.close();
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: originalRandomUUID });
  }

  const check = new Dexie(name);
  check.version(8).stores(schema);
  await check.open();
  assert.equal((await check.table('transactions').get('t')).cardId, 'c');
  assert.equal((await check.table('cards').get('c')).name, '旧消费');
  assert.equal(await check.table('spendQuotas').count(), 1);
  check.close();
  await Dexie.delete(name);
});

test('legacy fund values become one fund savings pool and old fund tables are removed', async () => {
  const name = `bookkeeping-fund-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(11).stores({
    cards: 'id, sortOrder, isDefault, type',
    fundContributions: null,
    fundSnapshots: null,
  });
  await legacy.open();
  await legacy.table('cards').add({
    id: 'legacy-fund',
    name: '旧基金',
    type: 'FUND',
    initialBalance: 10_000,
    fundPrincipal: 12_000,
    fundValue: 13_000,
    isDefault: 0,
    sortOrder: 1,
    createdAt: 1,
  });
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  assert.equal(await upgraded.cards.get('legacy-fund'), undefined);
  assert.deepEqual(
    (await upgraded.fundSavingsSnapshots.toArray()).map((row) => [
      row.marketValue,
      row.prepaid,
    ]),
    [[13_000, 0]],
  );
  assert.equal(
    upgraded.tables.some((table) => table.name === 'fundContributions'),
    false,
  );
  assert.equal(
    upgraded.tables.some((table) => table.name === 'fundSnapshots'),
    false,
  );
  upgraded.close();
  await Dexie.delete(name);
});

test('v20 migration restores v17 source deductions, preserves balances, and removes the ledger', async () => {
  const name = `bookkeeping-asset-transfer-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(17).stores({
    cards: 'id, sortOrder, isDefault, type',
    savingsActuals: 'id, &[cardId+month], cardId',
    assetTransfers:
      'id, date, sourceCardId, targetCardId, targetKind, [sourceCardId+date], [targetCardId+date]',
  });
  await legacy.open();
  await legacy.table('cards').bulkAdd([
    {
      id: 'source',
      name: '来源卡',
      type: 'SAVINGS',
      initialBalance: 10_000,
      isDefault: 1,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'target',
      name: '接收卡',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
    },
  ]);
  await legacy.table('savingsActuals').bulkAdd([
    {
      id: 'source-actual',
      cardId: 'source',
      month: '2026-10',
      amount: 9_000,
      updatedAt: 1,
    },
    {
      id: 'target-actual',
      cardId: 'target',
      month: '2026-10',
      amount: 1_000,
      updatedAt: 1,
    },
  ]);
  await legacy.table('assetTransfers').add({
    id: 'old-transfer',
    date: '2026-10-01',
    sourceCardId: 'source',
    targetKind: 'SAVINGS',
    targetCardId: 'target',
    amount: 1_000,
    savingsApplied: 1,
    principalApplied: 0,
    note: null,
    createdAt: 1,
  });
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  assert.equal(
    upgraded.tables.some((table) => table.name === 'assetTransfers'),
    false,
  );
  assert.equal(
    (await upgraded.savingsActuals.where('[cardId+month]').equals(['source', '2026-10']).first())
      ?.amount,
    10_000,
  );
  assert.equal(
    (await upgraded.savingsActuals.where('[cardId+month]').equals(['target', '2026-10']).first())
      ?.amount,
    1_000,
  );
  upgraded.close();
  await Dexie.delete(name);
});

test('direct v16 to v20 migration leaves savings snapshots unchanged and removes the ledger', async () => {
  const name = `bookkeeping-asset-transfer-direct-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(16).stores({
    cards: 'id, sortOrder, isDefault, type',
    savingsActuals: 'id, &[cardId+month], cardId',
    assetTransfers:
      'id, date, sourceCardId, targetCardId, targetKind, [sourceCardId+date], [targetCardId+date]',
  });
  await legacy.open();
  await legacy.table('cards').bulkAdd([
    {
      id: 'direct-source',
      name: '来源卡',
      type: 'SAVINGS',
      initialBalance: 10_000,
      isDefault: 1,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'direct-target',
      name: '接收卡',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
    },
  ]);
  await legacy.table('savingsActuals').bulkAdd([
    {
      id: 'direct-source-actual',
      cardId: 'direct-source',
      month: '2026-10',
      amount: 10_000,
      updatedAt: 1,
    },
    {
      id: 'direct-target-actual',
      cardId: 'direct-target',
      month: '2026-10',
      amount: 0,
      updatedAt: 1,
    },
  ]);
  await legacy.table('assetTransfers').add({
    id: 'direct-transfer',
    date: '2026-10-01',
    sourceCardId: 'direct-source',
    targetKind: 'SAVINGS',
    targetCardId: 'direct-target',
    amount: 1_000,
    principalApplied: 0,
    note: null,
    createdAt: 1,
  });
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  assert.equal(
    upgraded.tables.some((table) => table.name === 'assetTransfers'),
    false,
  );
  assert.equal((await upgraded.savingsActuals.get('direct-source-actual'))?.amount, 10_000);
  assert.equal((await upgraded.savingsActuals.get('direct-target-actual'))?.amount, 0);
  upgraded.close();
  await Dexie.delete(name);
});

test('legacy transfer retirement preserves savings and aggregates confirmed fund value', async () => {
  const name = `bookkeeping-transfer-retirement-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(19).stores({
    cards: 'id, sortOrder, isDefault, type',
    savingsActuals: 'id, &[cardId+month], cardId',
    assetTransfers:
      'id, date, sourceCardId, targetCardId, targetKind, [sourceCardId+date], [targetCardId+date]',
    fundMonthSnapshots: 'id, &[fundCardId+month], fundCardId, month',
  });
  await legacy.open();
  await legacy.table('cards').bulkAdd([
    {
      id: 'retired-source',
      name: '来源卡',
      type: 'SAVINGS',
      initialBalance: 10_000,
      isDefault: 1,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'retired-fund',
      name: '基金',
      type: 'FUND',
      initialBalance: 5_000,
      fundPrincipal: 8_000,
      fundValue: 8_500,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
    },
  ]);
  await legacy.table('savingsActuals').add({
    id: 'retired-actual',
    cardId: 'retired-source',
    month: '2026-10',
    amount: 7_000,
    updatedAt: 1,
  });
  await legacy.table('fundMonthSnapshots').add({
    id: 'retired-snapshot',
    fundCardId: 'retired-fund',
    month: '2026-10',
    principal: 8_000,
    value: 8_500,
    updatedAt: 1,
  });
  await legacy.table('assetTransfers').add({
    id: 'retired-transfer',
    date: '2026-10-01',
    sourceCardId: 'retired-source',
    targetKind: 'FUND_PRINCIPAL',
    targetCardId: 'retired-fund',
    amount: 3_000,
    savingsApplied: 0,
    principalApplied: 1,
    note: null,
    createdAt: 1,
  });
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  assert.equal(
    upgraded.tables.some((table) => table.name === 'assetTransfers'),
    false,
  );
  assert.equal((await upgraded.savingsActuals.get('retired-actual'))?.amount, 7_000);
  assert.equal(await upgraded.cards.get('retired-fund'), undefined);
  const fundSavings = await upgraded.fundSavingsSnapshots.get('2026-10');
  assert.deepEqual(
    fundSavings && [fundSavings.month, fundSavings.marketValue, fundSavings.prepaid],
    ['2026-10', 8_500, 0],
  );
  assert.equal(upgraded.tables.some((table) => table.name === 'fundMonthSnapshots'), false);
  upgraded.close();
  await Dexie.delete(name);
});

test('legacy funds aggregate into one current-month savings pool', async () => {
  const name = `bookkeeping-fund-month-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(18).stores({
    cards: 'id, sortOrder, isDefault, type',
  });
  await legacy.open();
  await legacy.table('cards').bulkAdd([
    {
      id: 'fund-with-current-values',
      name: '基金一',
      type: 'FUND',
      initialBalance: 10_000,
      fundPrincipal: 25_000,
      fundValue: 28_000,
      isDefault: 0,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'fund-with-legacy-values',
      name: '基金二',
      type: 'FUND',
      initialBalance: 5_000,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
    },
    {
      id: 'savings',
      name: '储蓄',
      type: 'SAVINGS',
      initialBalance: 99_000,
      isDefault: 1,
      sortOrder: 3,
      createdAt: 3,
    },
  ]);
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  assert.deepEqual(await upgraded.fundSavingsSnapshots.get(month), {
    month,
    marketValue: 33_000,
    prepaid: 0,
    updatedAt: (await upgraded.fundSavingsSnapshots.get(month))?.updatedAt,
  });
  assert.equal((await upgraded.cards.where('type').equals('FUND').count()), 0);
  upgraded.close();
  await Dexie.delete(name);
});

test('v13 migration removes legacy orphan rows and preserves valid historical statistics', async () => {
  const name = `bookkeeping-orphan-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(12).stores({
    cards: 'id, sortOrder, isDefault, type, savingsPurpose',
    budgetSnapshots: 'id, &date',
    budgetLines: 'id, &[snapshotId+cardId], snapshotId, cardId',
    transactions: 'id, cardId, date, type, transferGroupId, [cardId+date]',
    budgetDetails: 'id, cardId, [cardId+month]',
    savingsActuals: 'id, &[cardId+month], cardId',
    categories: 'id, kind',
    savingsEntries: 'id, cardId, [cardId+month], kind',
    savingsLogs: 'id, cardId, [cardId+month], createdAt',
    initialBalanceLogs: 'id, cardId, [cardId+createdAt], createdAt',
    fundContributions:
      'id, batchId, sourceCardId, fundCardId, month, [sourceCardId+month], [fundCardId+month]',
    fundSnapshots: 'id, &[fundCardId+month], fundCardId, month',
    consumptionBudgets: 'id, &[savingsCardId+month], month',
  });
  await legacy.open();
  await legacy.table('cards').bulkAdd([
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
      id: VIRTUAL_CONSUMPTION_CARD_ID,
      name: '消费',
      type: 'SPEND',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: -1,
      createdAt: 0,
    },
  ]);
  await legacy
    .table('budgetSnapshots')
    .add({ id: 'snapshot', date: '2026-08-31', note: null, createdAt: 1 });
  await legacy.table('budgetLines').bulkAdd([
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
  ]);
  await legacy.table('transactions').bulkAdd([
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
      createdAt: 1,
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
      createdAt: 2,
    },
    {
      id: 'broken-transfer-valid-side',
      cardId: 'valid-savings',
      date: '2026-08-02',
      type: 'TRANSFER',
      amount: 300,
      category: null,
      note: null,
      peerCardId: 'deleted-card',
      transferGroupId: 'broken-transfer',
      createdAt: 3,
    },
    {
      id: 'broken-transfer-deleted-side',
      cardId: 'deleted-card',
      date: '2026-08-02',
      type: 'TRANSFER',
      amount: -300,
      category: null,
      note: null,
      peerCardId: 'valid-savings',
      transferGroupId: 'broken-transfer',
      createdAt: 3,
    },
    {
      id: 'valid-consumption',
      cardId: VIRTUAL_CONSUMPTION_CARD_ID,
      date: '2026-08-03',
      type: 'OUT',
      amount: -50,
      category: '餐饮',
      note: null,
      peerCardId: null,
      transferGroupId: null,
      createdAt: 4,
    },
  ]);
  await legacy.table('budgetDetails').bulkAdd([
    {
      id: 'valid-budget',
      cardId: 'valid-savings',
      month: '2026-08',
      label: '有效收入',
      kind: 'IN',
      amount: 100,
      createdAt: 1,
    },
    {
      id: 'orphan-budget',
      cardId: 'deleted-card',
      peerCardId: 'valid-savings',
      month: '2026-08',
      label: '孤立调出',
      kind: 'OUT',
      amount: 200,
      createdAt: 2,
    },
    {
      id: 'orphan-budget-mate',
      cardId: 'valid-savings',
      peerCardId: 'deleted-card',
      month: '2026-08',
      label: '孤立调入',
      kind: 'TRANSFER_IN',
      amount: 200,
      createdAt: 2,
    },
  ]);
  await legacy.table('savingsActuals').bulkAdd([
    { id: 'valid-actual', cardId: 'valid-savings', month: '2026-08', amount: 100, updatedAt: 1 },
    { id: 'orphan-actual', cardId: 'deleted-card', month: '2026-08', amount: 900, updatedAt: 1 },
  ]);
  await legacy.table('savingsEntries').bulkAdd([
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
  ]);
  await legacy.table('savingsLogs').add({
    id: 'orphan-log',
    cardId: 'deleted-card',
    month: '2026-08',
    field: 'INCOME',
    amount: 900,
    createdAt: 1,
  });
  await legacy.table('initialBalanceLogs').add({
    id: 'orphan-initial-log',
    cardId: 'deleted-card',
    previousAmount: 0,
    amount: 900,
    createdAt: 1,
  });
  await legacy.table('consumptionBudgets').bulkAdd([
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
  ]);
  await legacy.table('fundContributions').bulkAdd([
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
      id: 'valid-funding-later',
      batchId: 'valid-batch-later',
      sourceCardId: 'valid-savings',
      fundCardId: 'valid-fund',
      month: '2026-09',
      amount: 50,
      createdAt: 2,
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
  ]);
  await legacy.table('fundSnapshots').bulkAdd([
    {
      id: 'valid-fund-snapshot',
      fundCardId: 'valid-fund',
      month: '2026-08',
      value: 100,
      updatedAt: 1,
    },
    {
      id: 'valid-fund-snapshot-later',
      fundCardId: 'valid-fund',
      month: '2026-09',
      value: 250,
      updatedAt: 2,
    },
    {
      id: 'orphan-fund-snapshot',
      fundCardId: 'deleted-card',
      month: '2026-08',
      value: 900,
      updatedAt: 1,
    },
  ]);
  legacy.close();

  const upgraded = new BookkeepingDB(name);
  await upgraded.open();
  assert.deepEqual((await upgraded.transactions.toArray()).map((row) => row.id).sort(), [
    'valid-consumption',
    'valid-income',
  ]);
  assert.deepEqual(
    (await upgraded.budgetLines.toArray()).map((row) => row.id),
    ['valid-line'],
  );
  assert.deepEqual(
    (await upgraded.budgetDetails.toArray()).map((row) => row.id),
    ['valid-budget'],
  );
  assert.deepEqual(
    (await upgraded.savingsEntries.toArray()).map((row) => row.id),
    ['valid-entry'],
  );
  assert.deepEqual(
    (await upgraded.savingsActuals.toArray()).map((row) => row.id),
    ['valid-actual'],
  );
  assert.equal(await upgraded.savingsLogs.count(), 0);
  assert.equal(await upgraded.initialBalanceLogs.count(), 0);
  assert.deepEqual(
    (await upgraded.consumptionBudgets.toArray()).map((row) => row.id),
    ['valid-consumption-budget'],
  );
  const migratedSavings = await upgraded.cards.get('valid-savings');
  assert.equal('savingsPurpose' in (migratedSavings ?? {}), false);
  assert.equal((await upgraded.savingsActuals.get('valid-actual'))?.amount, 100);
  assert.equal(await upgraded.cards.get('valid-fund'), undefined);
  assert.equal((await upgraded.fundSavingsSnapshots.toArray()).at(-1)?.marketValue, 250);
  assert.equal(
    upgraded.tables.some((table) => table.name === 'fundContributions'),
    false,
  );
  assert.equal(
    upgraded.tables.some((table) => table.name === 'fundSnapshots'),
    false,
  );
  assert.equal(
    (await upgraded.transactions.toArray())
      .filter((row) => row.type === 'IN')
      .reduce((sum, row) => sum + row.amount, 0),
    100,
  );
  assert.equal(
    (await upgraded.savingsActuals.toArray()).reduce((sum, row) => sum + row.amount, 0),
    100,
  );
  upgraded.close();

  const reopened = new BookkeepingDB(name);
  await reopened.open();
  assert.equal(await reopened.transactions.count(), 2);
  assert.equal(await reopened.budgetDetails.count(), 1);
  assert.equal(await reopened.cards.get('valid-fund'), undefined);
  assert.equal((await reopened.fundSavingsSnapshots.toArray()).at(-1)?.marketValue, 250);
  assert.equal(
    reopened.tables.some((table) => table.name === 'fundSnapshots'),
    false,
  );
  reopened.close();
  await Dexie.delete(name);
});
