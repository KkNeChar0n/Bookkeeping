import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { cardsService } from './cards.service';
import { initialBalanceLogService } from './initialBalanceLog.service';
import { incomeCompareService } from './incomeCompare.service';
import { fundSavingsService } from './fundSavings.service';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { consumptionBudgetService } from './consumptionBudget.service';

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

test('fund savings overwrites a month and carries the latest values forward', async () => {
  await db.open();

  await fundSavingsService.set({
    month: '2026-09',
    marketValue: '110.00',
  });
  await fundSavingsService.set({
    month: '2026-10',
    marketValue: '170.00',
  });
  await fundSavingsService.set({
    month: '2026-09',
    marketValue: '120.00',
  });

  assert.deepEqual(await fundSavingsService.get('2026-08'), {
    month: '2026-08',
    sourceMonth: null,
    marketValue: '0.00',
    legacyPrepaidSnapshots: [],
    marketValueFilled: false,
    filled: false,
    updatedAt: null,
  });
  assert.equal((await fundSavingsService.get('2026-09')).marketValue, '120.00');
  assert.equal((await fundSavingsService.get('2026-11')).marketValue, '170.00');
  assert.equal(await db.fundSavingsSnapshots.count(), 2);

  db.close();
  await db.delete();
});

test('card creation rejects retired fund cards', async () => {
  await db.open();
  await assert.rejects(
    cardsService.create({ name: '旧基金', type: 'FUND', initialBalance: '100' }),
    /只能创建储蓄卡/,
  );
  db.close();
  await db.delete();
});

test('fund cash cards keep real balances but reject every budget funding write', async () => {
  await db.open();
  const card = await cardsService.create({
    name: '基金资金卡',
    initialBalance: '999',
    isFundCash: true,
  });
  assert.equal(card.isFundCash, true);
  assert.equal(card.initialBalance, '0.00');

  await savingsActualService.setAmount({ cardId: card.id, month: '2026-11', amount: '50' });
  assert.equal((await savingsActualService.balanceAsOf(card.id, '2026-11'))?.amount, 5_000);
  assert.equal(await budgetPlanService.expectedBalance(card.id, '2026-11'), 0);
  assert.equal(await budgetPlanService.totalIncomeUpTo(card.id, '2026-11'), 0);
  await assert.rejects(
    budgetPlanService.addDetail({
      cardId: card.id, month: '2026-11', label: '收入', kind: 'IN', amount: '1',
    }),
    /不参与预算/,
  );
  await assert.rejects(
    savingsEntryService.add({ cardId: card.id, month: '2026-11', kind: 'INCOME', amount: '1' }),
    /只记录真实余额/,
  );
  await assert.rejects(
    consumptionBudgetService.setBudget({ savingsCardId: card.id, month: '2026-11', amount: '1' }),
    /不参与消费预算/,
  );

  db.close();
  await db.delete();
});

test('an empty zero-opening card can be marked without losing actuals, while budget data blocks marking', async () => {
  await db.open();
  await db.cards.bulkAdd([
    {
      id: 'empty-card', name: '已建资金卡', type: 'SAVINGS', initialBalance: 0,
      isDefault: 0, sortOrder: 1, createdAt: 1,
    },
    {
      id: 'used-card', name: '已用预算卡', type: 'SAVINGS', initialBalance: 0,
      isDefault: 0, sortOrder: 2, createdAt: 2,
    },
  ]);
  await savingsActualService.setAmount({ cardId: 'empty-card', month: '2026-11', amount: '26.10' });
  await db.budgetDetails.add({
    id: 'used-budget', cardId: 'used-card', month: '2026-11', label: '收入', kind: 'IN',
    amount: 100, createdAt: 1,
  });

  const marked = await cardsService.update('empty-card', { isFundCash: true });
  assert.equal(marked.isFundCash, true);
  assert.equal((await savingsActualService.balanceAsOf('empty-card', '2026-11'))?.amount, 2_610);
  await assert.rejects(cardsService.update('empty-card', { initialBalance: '1' }), /期初固定为0/);
  await assert.rejects(cardsService.update('used-card', { isFundCash: true }), /只能将零期初/);

  const unmarked = await cardsService.update('empty-card', { isFundCash: false });
  assert.equal(unmarked.isFundCash, false);
  assert.equal((await savingsActualService.balanceAsOf('empty-card', '2026-11'))?.amount, 2_610);

  db.close();
  await db.delete();
});
