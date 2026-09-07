import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { cardsService } from './cards.service';
import { fundService } from './fund.service';
import { savingsActualService } from './savingsActual.service';

test('fund pool contributions are bounded, monthly, derived and undoable', async () => {
  await db.open();
  await db.cards.bulkAdd([
    {
      id: 'pool',
      name: '基金资金池',
      type: 'SAVINGS',
      savingsPurpose: 'FUND_POOL',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'fund-a',
      name: '基金A',
      type: 'FUND',
      initialBalance: 10_000,
      fundPrincipal: 10_000,
      fundValue: 10_000,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
    },
    {
      id: 'fund-b',
      name: '基金B',
      type: 'FUND',
      initialBalance: 0,
      fundPrincipal: 0,
      fundValue: 0,
      isDefault: 0,
      sortOrder: 3,
      createdAt: 3,
    },
  ]);
  await savingsActualService.setAmount({ cardId: 'pool', month: '2026-08', amount: '1000' });

  const batch = await fundService.createContributionBatch({
    sourceCardId: 'pool',
    month: '2026-08',
    allocations: [
      { fundCardId: 'fund-a', amount: '300' },
      { fundCardId: 'fund-b', amount: '200' },
    ],
  });
  assert.deepEqual(await fundService.poolMonth('pool', '2026-08'), {
    sourceCardId: 'pool',
    month: '2026-08',
    startingAmount: '1000.00',
    allocated: '500.00',
    available: '500.00',
    batches: [
      {
        batchId: batch.batchId,
        month: '2026-08',
        total: '500.00',
        createdAt: (await db.fundContributions.get((await db.fundContributions.toArray())[0].id))!
          .createdAt,
        items: [
          { fundCardId: 'fund-a', fundName: '基金A', amount: '300.00' },
          { fundCardId: 'fund-b', fundName: '基金B', amount: '200.00' },
        ],
      },
    ],
  });
  assert.equal(await fundService.principalAsOf('fund-a', '2026-08'), 40_000);
  await assert.rejects(
    fundService.createContributionBatch({
      sourceCardId: 'pool',
      month: '2026-08',
      allocations: [{ fundCardId: 'fund-a', amount: '501' }],
    }),
    /超过当月可用金额/,
  );
  await assert.rejects(
    savingsActualService.setAmount({ cardId: 'pool', month: '2026-08', amount: '499' }),
    /不能小于当月已注资金额/,
  );

  await fundService.setMonthEndValue({ fundCardId: 'fund-a', month: '2026-08', value: '450' });
  await fundService.setMonthEndValue({ fundCardId: 'fund-a', month: '2026-09', value: '480' });
  assert.deepEqual(await fundService.positionAsOf('fund-a', '2026-08'), {
    fundCardId: 'fund-a',
    fundName: '基金A',
    month: '2026-08',
    valueMonth: '2026-08',
    value: '450.00',
    principal: '400.00',
    profit: '50.00',
    profitPct: 12.5,
  });
  assert.equal((await fundService.positionAsOf('fund-a', '2026-07')).value, null);
  assert.deepEqual(
    (await fundService.snapshotHistory('fund-a')).map((row) => row.month),
    ['2026-09', '2026-08'],
  );

  await fundService.undoContributionBatch(batch.batchId);
  assert.equal((await fundService.poolMonth('pool', '2026-08')).available, '1000.00');
  assert.equal(await fundService.principalAsOf('fund-a', '2026-08'), 10_000);

  await assert.rejects(
    cardsService.create({ name: '第二张资金卡', type: 'SAVINGS', savingsPurpose: 'FUND_POOL' }),
    /只能创建一张/,
  );
  db.close();
  await db.delete();
});
