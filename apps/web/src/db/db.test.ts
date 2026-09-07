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
  await legacy
    .table('transactions')
    .add({
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
  await legacy
    .table('transactions')
    .add({
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

test('v12 migration anchors legacy fund value to the upgrade month', async () => {
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
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  assert.deepEqual(
    (await upgraded.fundSnapshots.toArray()).map((row) => [row.fundCardId, row.month, row.value]),
    [['legacy-fund', month, 13_000]],
  );
  upgraded.close();
  await Dexie.delete(name);
});
