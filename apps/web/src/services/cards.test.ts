import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { cardsService } from './cards.service';
import { initialBalanceLogService } from './initialBalanceLog.service';

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
