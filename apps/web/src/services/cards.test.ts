import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { cardsService } from './cards.service';
import { initialBalanceLogService } from './initialBalanceLog.service';
import { incomeCompareService } from './incomeCompare.service';
import { fundMonthSnapshotService } from './fundMonthSnapshot.service';

test('updating an initial balance atomically keeps an audit record', async () => {
  await db.open();
  await db.cards.add({
    id: 'savings-audit',
    name: '储蓄',
    type: 'SAVINGS',
    initialBalance: 100_000,
    isDefault: 0,
    sortOrder: 1,
    createdAt: 1,
  });

  await cardsService.update('savings-audit', { initialBalance: '1200' });

  assert.equal((await db.cards.get('savings-audit'))?.initialBalance, 120_000);
  assert.deepEqual(
    (await initialBalanceLogService.list('savings-audit')).map((row) => [
      row.previousAmount,
      row.amount,
    ]),
    [['1000.00', '1200.00']],
  );

  await cardsService.update('savings-audit', { initialBalance: '1200.00' });
  assert.equal(await db.initialBalanceLogs.where('cardId').equals('savings-audit').count(), 1);

  db.close();
  await db.delete();
});

test('deleting a card cascades records and removes their statistics', async () => {
  await db.open();
  await db.cards.bulkAdd([
    {
      id: 'remove-me',
      name: '待删除',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'peer',
      name: '对手卡',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 1,
      sortOrder: 2,
      createdAt: 2,
    },
    {
      id: 'fund',
      name: '基金',
      type: 'FUND',
      initialBalance: 0,
      fundPrincipal: 0,
      fundValue: 0,
      isDefault: 0,
      sortOrder: 3,
      createdAt: 3,
    },
  ]);
  await db.budgetSnapshots.add({ id: 'snapshot', date: '2026-08-31', note: null, createdAt: 1 });
  await db.budgetLines.add({
    id: 'line',
    snapshotId: 'snapshot',
    cardId: 'remove-me',
    inAmount: 1,
    outAmount: 0,
  });
  await db.transactions.bulkAdd([
    {
      id: 'income',
      cardId: 'remove-me',
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
      id: 'transfer-a',
      cardId: 'remove-me',
      date: '2026-08-02',
      type: 'TRANSFER',
      amount: -50,
      category: null,
      note: null,
      peerCardId: 'peer',
      transferGroupId: 'actual-group',
      createdAt: 2,
    },
    {
      id: 'transfer-b',
      cardId: 'peer',
      date: '2026-08-02',
      type: 'TRANSFER',
      amount: 50,
      category: null,
      note: null,
      peerCardId: 'remove-me',
      transferGroupId: 'actual-group',
      createdAt: 2,
    },
  ]);
  await db.budgetDetails.bulkAdd([
    {
      id: 'budget-income',
      cardId: 'remove-me',
      month: '2026-08',
      label: '收入',
      kind: 'IN',
      amount: 200,
      createdAt: 1,
    },
    {
      id: 'budget-transfer-a',
      cardId: 'remove-me',
      month: '2026-08',
      label: '调出',
      kind: 'OUT',
      peerCardId: 'peer',
      amount: 50,
      createdAt: 2,
    },
    {
      id: 'budget-transfer-b',
      cardId: 'peer',
      month: '2026-08',
      label: '调入',
      kind: 'TRANSFER_IN',
      peerCardId: 'remove-me',
      amount: 50,
      createdAt: 2,
    },
  ]);
  await db.savingsActuals.add({
    id: 'actual',
    cardId: 'remove-me',
    month: '2026-08',
    amount: 1_000,
    updatedAt: 1,
  });
  await db.savingsEntries.add({
    id: 'entry',
    cardId: 'remove-me',
    month: '2026-08',
    kind: 'INCOME',
    amount: 300,
    createdAt: 1,
  });
  await db.savingsLogs.add({
    id: 'log',
    cardId: 'remove-me',
    month: '2026-08',
    field: 'INCOME',
    amount: 300,
    createdAt: 1,
  });
  await db.initialBalanceLogs.add({
    id: 'initial-log',
    cardId: 'remove-me',
    previousAmount: 0,
    amount: 1,
    createdAt: 1,
  });
  await db.consumptionBudgets.add({
    id: 'budget',
    savingsCardId: 'remove-me',
    month: '2026-08',
    amount: 400,
    updatedAt: 1,
  });
  assert.deepEqual(await incomeCompareService.compute('2026-08'), {
    prefix: '2026-08',
    expected: '2.00',
    actual: '3.00',
    diff: '1.00',
  });
  await cardsService.remove('remove-me');

  assert.equal(await db.cards.get('remove-me'), undefined);
  assert.equal(await db.transactions.where('transferGroupId').equals('actual-group').count(), 0);
  assert.equal(
    (await db.budgetDetails.toArray()).some((row) => row.peerCardId === 'remove-me'),
    false,
  );
  assert.equal(await db.savingsEntries.where('cardId').equals('remove-me').count(), 0);
  assert.equal(await db.consumptionBudgets.where('savingsCardId').equals('remove-me').count(), 0);
  assert.deepEqual(await incomeCompareService.compute('2026-08'), {
    prefix: '2026-08',
    expected: '0.00',
    actual: '0.00',
    diff: '0.00',
  });

  db.close();
  await db.delete();
});

test('fund principal calibration is audited while value stays directly editable', async () => {
  await db.open();
  await db.cards.add({
    id: 'fund-direct-edit',
    name: '基金',
    type: 'FUND',
    initialBalance: 10_000,
    fundPrincipal: 10_000,
    fundValue: 10_000,
    isDefault: 0,
    sortOrder: 1,
    createdAt: 1,
  });

  const result = await cardsService.setFund('fund-direct-edit', {
    principal: '250.00',
    value: '280.50',
  });

  assert.equal(result.fundPrincipal, '250.00');
  assert.equal(result.fundValue, '280.50');
  const stored = await db.cards.get('fund-direct-edit');
  assert.equal(stored?.fundPrincipal, 25_000);
  assert.equal(stored?.fundValue, 28_050);
  assert.deepEqual(
    (await db.fundPrincipalLogs.where('fundCardId').equals('fund-direct-edit').toArray())
      .map((row) => [row.previousAmount, row.amount])
      .sort((a, b) => a[0] - b[0]),
    [[10_000, 25_000]],
  );

  const reduced = await cardsService.setFund('fund-direct-edit', {
    principal: '50.00',
    month: '2026-10',
  });
  assert.equal(reduced.fundPrincipal, '50.00');
  assert.deepEqual(
    (await db.fundPrincipalLogs.where('fundCardId').equals('fund-direct-edit').toArray())
      .map((row) => [row.previousAmount, row.amount])
      .sort((a, b) => a[0] - b[0]),
    [
      [10_000, 25_000],
      [25_000, 5_000],
    ],
  );

  db.close();
  await db.delete();
});

test('fund month snapshots overwrite the same month and preserve the latest current value', async () => {
  await db.open();
  await db.cards.add({
    id: 'monthly-fund',
    name: '月度基金',
    type: 'FUND',
    initialBalance: 10_000,
    fundPrincipal: 10_000,
    fundValue: 10_000,
    isDefault: 0,
    sortOrder: 1,
    createdAt: 1,
  });

  await cardsService.setFund('monthly-fund', {
    principal: '100.00',
    value: '110.00',
    month: '2026-09',
  });
  await cardsService.setFund('monthly-fund', {
    principal: '150.00',
    value: '170.00',
    month: '2026-10',
  });
  await cardsService.setFund('monthly-fund', { value: '120.00', month: '2026-09' });

  const snapshots = await db.fundMonthSnapshots
    .where('fundCardId')
    .equals('monthly-fund')
    .toArray();
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots.find((row) => row.month === '2026-09')?.value, 12_000);
  assert.equal(snapshots.find((row) => row.month === '2026-10')?.value, 17_000);
  assert.equal((await db.cards.get('monthly-fund'))?.fundPrincipal, 15_000);
  assert.equal((await db.cards.get('monthly-fund'))?.fundValue, 17_000);

  const august = await fundMonthSnapshotService.listAsOf('2026-08');
  const september = await fundMonthSnapshotService.listAsOf('2026-09');
  const november = await fundMonthSnapshotService.listAsOf('2026-11');
  assert.deepEqual(
    august.map((row) => [row.month, row.principal, row.value, row.filled]),
    [['2026-08', 10_000, 10_000, false]],
  );
  assert.deepEqual(
    september.map((row) => [row.month, row.principal, row.value, row.filled]),
    [['2026-09', 10_000, 12_000, true]],
  );
  assert.deepEqual(
    november.map((row) => [row.month, row.principal, row.value, row.filled]),
    [['2026-10', 15_000, 17_000, true]],
  );

  await cardsService.remove('monthly-fund');
  assert.equal(await db.fundMonthSnapshots.where('fundCardId').equals('monthly-fund').count(), 0);

  db.close();
  await db.delete();
});
