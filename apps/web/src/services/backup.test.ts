import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackupData } from './backup.service';
import { normalizeBackupData } from './backup.service';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';

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
  assert.deepEqual(result.fundContributions, []);
  assert.deepEqual(result.fundSnapshots, []);
  const again = normalizeBackupData(result);
  assert.deepEqual(again.consumptionBudgets, result.consumptionBudgets);
});
