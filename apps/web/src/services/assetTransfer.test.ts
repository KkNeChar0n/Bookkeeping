import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { assetTransferService } from './assetTransfer.service';
import { cardsService } from './cards.service';
import { fundPrincipalLogService } from './fundPrincipalLog.service';
import { reconciliationService } from './reconciliation.service';

async function resetDb() {
  db.close();
  await db.delete();
  await db.open();
}

test('asset transfers apply, audit and undo fund principal atomically', async () => {
  await resetDb();
  await db.cards.bulkAdd([
    {
      id: 'source',
      name: '来源卡',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'peer',
      name: '目标储蓄卡',
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
      initialBalance: 10_000,
      fundPrincipal: 10_000,
      fundValue: 10_000,
      isDefault: 0,
      sortOrder: 3,
      createdAt: 3,
    },
  ]);
  await db.savingsActuals.add({
    id: 'actual',
    cardId: 'source',
    month: '2026-10',
    amount: 8_000,
    updatedAt: 1,
  });

  const savingsTransfer = await assetTransferService.create({
    sourceCardId: 'source',
    targetCardId: 'peer',
    targetKind: 'SAVINGS',
    amount: '10',
    date: '2026-09-01',
  });
  const applied = await assetTransferService.create({
    sourceCardId: 'source',
    targetCardId: 'fund',
    targetKind: 'FUND_PRINCIPAL',
    amount: '20',
    date: '2026-09-30',
  });
  const historical = await assetTransferService.create({
    sourceCardId: 'source',
    targetCardId: 'fund',
    targetKind: 'FUND_PRINCIPAL',
    amount: '30',
    date: '2026-10-01',
    principalAlreadyIncluded: true,
  });

  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 12_000);
  assert.equal((await db.savingsActuals.get('actual'))?.amount, 8_000);
  assert.equal(await assetTransferService.fundInvestmentUpTo('2026-09'), 2_000);
  assert.equal(await assetTransferService.fundInvestmentUpTo('2026-10'), 5_000);
  assert.equal(savingsTransfer.principalApplied, false);
  assert.equal(applied.principalApplied, true);
  assert.equal(historical.principalApplied, false);

  await assert.rejects(
    cardsService.setFund('fund', { principal: '10' }),
    /不能低于仍有效的划转合计/,
  );
  await cardsService.setFund('fund', { principal: '125' });
  assert.deepEqual(
    (await fundPrincipalLogService.list('fund')).map((row) => [row.previousAmount, row.amount]),
    [['120.00', '125.00']],
  );

  await assetTransferService.remove(applied.id);
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 10_500);
  await assetTransferService.remove(historical.id);
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 10_500);

  await assetTransferService.create({
    sourceCardId: 'source',
    targetCardId: 'fund',
    targetKind: 'FUND_PRINCIPAL',
    amount: '15',
    date: '2026-10-02',
  });
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 12_000);
  await cardsService.remove('source');
  assert.equal(await db.assetTransfers.count(), 0);
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 10_500);

  db.close();
  await db.delete();
});

test('reconciliation separates historical fund investment from interest', async () => {
  await resetDb();
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
    amount: 5_000,
    updatedAt: 1,
  });
  await assetTransferService.create({
    sourceCardId: 'recon-source',
    targetCardId: 'recon-fund',
    targetKind: 'FUND_PRINCIPAL',
    amount: '50',
    date: '2026-10-01',
    principalAlreadyIncluded: true,
  });

  const result = await reconciliationService.compute('2026-10');
  assert.equal(result.diff, '-50.00');
  assert.equal(result.fundInvestment, '50.00');
  assert.equal(result.interest, '0.00');

  db.close();
  await db.delete();
});
