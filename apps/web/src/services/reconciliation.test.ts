import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { cardsService } from './cards.service';
import { reconciliationService } from './reconciliation.service';

test('funding movement is net-worth neutral without a transfer ledger', async () => {
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
    {
      id: 'recon-fund',
      name: '基金',
      type: 'FUND',
      initialBalance: 5_000,
      fundPrincipal: 5_000,
      fundValue: 5_000,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
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
  assert.equal(beforeFunding.budgetTotal, '150.00');
  assert.equal(beforeFunding.actualTotal, '150.00');
  assert.equal(beforeFunding.fundProfit, '0.00');
  assert.equal(beforeFunding.interest, '0.00');

  await db.savingsActuals.update('recon-actual', { amount: 5_000 });
  await cardsService.setFund('recon-fund', {
    principal: '100.00',
    value: '100.00',
    month: '2026-10',
  });

  const afterFunding = await reconciliationService.compute('2026-10');
  assert.equal(afterFunding.budgetTotal, '150.00');
  assert.equal(afterFunding.actualTotal, '150.00');
  assert.equal(afterFunding.diff, '0.00');
  assert.equal(afterFunding.fundProfit, '0.00');
  assert.equal(afterFunding.interest, '0.00');
  assert.equal('fundInvestment' in afterFunding, false);

  db.close();
  await db.delete();
});
