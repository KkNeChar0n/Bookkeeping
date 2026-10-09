import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { fundSavingsService } from './fundSavings.service';
import { reconciliationService } from './reconciliation.service';

test('fund market value and prepaid amount enter both sides without changing the difference', async () => {
  await db.open();
  await db.cards.bulkAdd([
    {
      id: 'recon-source',
      name: '储蓄卡',
      type: 'SAVINGS',
      initialBalance: 10_000,
      isDefault: 1,
      sortOrder: 1,
      createdAt: 1,
    },
  ]);
  await db.savingsActuals.add({
    id: 'recon-actual',
    cardId: 'recon-source',
    month: '2026-10',
    amount: 10_000,
    updatedAt: 1,
  });

  const beforeFunding = await reconciliationService.compute('2026-10');
  assert.equal(beforeFunding.budgetTotal, '100.00');
  assert.equal(beforeFunding.actualTotal, '100.00');
  assert.equal(beforeFunding.interest, '0.00');

  await fundSavingsService.set({
    month: '2026-10',
    marketValue: '50.00',
    prepaid: '10.00',
  });

  const afterFunding = await reconciliationService.compute('2026-10');
  assert.equal(afterFunding.budgetTotal, '160.00');
  assert.equal(afterFunding.actualTotal, '160.00');
  assert.equal(afterFunding.diff, '0.00');
  assert.equal(afterFunding.fundMarketValue, '50.00');
  assert.equal(afterFunding.fundPrepaid, '10.00');
  assert.equal(afterFunding.fundTotal, '60.00');
  assert.equal(afterFunding.interest, '0.00');
  assert.equal('fundProfit' in afterFunding, false);

  db.close();
  await db.delete();
});
