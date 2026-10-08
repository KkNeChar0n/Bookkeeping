import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../db/db';
import { assetTransferService } from './assetTransfer.service';
import { cardsService } from './cards.service';
import { fundPrincipalLogService } from './fundPrincipalLog.service';
import { reconciliationService } from './reconciliation.service';
import { savingsActualService } from './savingsActual.service';

async function resetDb() {
  db.close();
  await db.delete();
  await db.open();
}

test('asset transfers leave savings snapshots unchanged and undo fund principal atomically', async () => {
  await resetDb();
  await db.cards.bulkAdd([
    {
      id: 'source',
      name: '来源卡',
      type: 'SAVINGS',
      initialBalance: 10_000,
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
  assert.equal(
    await db.savingsActuals.where('[cardId+month]').equals(['source', '2026-09']).count(),
    0,
  );
  assert.equal(
    await db.savingsActuals.where('[cardId+month]').equals(['peer', '2026-09']).count(),
    0,
  );
  assert.equal(savingsTransfer.principalApplied, false);
  assert.equal(applied.principalApplied, true);
  assert.equal(historical.principalApplied, false);
  assert.equal((await db.assetTransfers.get(savingsTransfer.id))?.savingsApplied, 0);
  assert.equal((await db.assetTransfers.get(historical.id))?.savingsApplied, 0);

  await assetTransferService.remove(savingsTransfer.id);
  assert.equal(await db.assetTransfers.get(savingsTransfer.id), undefined);
  assert.equal((await db.savingsActuals.get('actual'))?.amount, 8_000);
  assert.equal(await db.savingsActuals.where('cardId').equals('peer').count(), 0);

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
  assert.equal((await db.savingsActuals.get('actual'))?.amount, 8_000);
  await assetTransferService.remove(historical.id);
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 10_500);
  assert.equal((await db.savingsActuals.get('actual'))?.amount, 8_000);

  await savingsActualService.clearMonth('source', '2026-09');
  const transferCount = await db.assetTransfers.count();
  await assetTransferService.create({
    sourceCardId: 'source',
    targetCardId: 'peer',
    targetKind: 'SAVINGS',
    amount: '200',
    date: '2026-09-10',
  });
  assert.equal(await db.assetTransfers.count(), transferCount + 1);
  assert.equal((await db.savingsActuals.get('actual'))?.amount, 8_000);

  await assetTransferService.create({
    sourceCardId: 'source',
    targetCardId: 'fund',
    targetKind: 'FUND_PRINCIPAL',
    amount: '15',
    date: '2026-10-02',
  });
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 12_000);
  assert.equal((await db.savingsActuals.get('actual'))?.amount, 8_000);
  await cardsService.remove('source');
  assert.equal(await db.assetTransfers.count(), 0);
  assert.equal((await db.cards.get('fund'))?.fundPrincipal, 10_500);
  assert.equal(await db.savingsActuals.where('cardId').equals('peer').count(), 0);

  db.close();
  await db.delete();
});

test('funding movement is net-worth neutral without depending on transfer records', async () => {
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

  const withoutTransferRecord = await reconciliationService.compute('2026-10');
  assert.equal(withoutTransferRecord.budgetTotal, '150.00');
  assert.equal(withoutTransferRecord.actualTotal, '150.00');
  assert.equal(withoutTransferRecord.diff, '0.00');
  assert.equal(withoutTransferRecord.fundProfit, '0.00');
  assert.equal(withoutTransferRecord.interest, '0.00');
  assert.equal('fundInvestment' in withoutTransferRecord, false);

  await assetTransferService.create({
    sourceCardId: 'recon-source',
    targetCardId: 'recon-fund',
    targetKind: 'FUND_PRINCIPAL',
    amount: '50',
    date: '2026-10-01',
    principalAlreadyIncluded: true,
  });

  const withTransferRecord = await reconciliationService.compute('2026-10');
  assert.deepEqual(withTransferRecord, withoutTransferRecord);

  db.close();
  await db.delete();
});

test('deleting a transfer target leaves the surviving source snapshot unchanged', async () => {
  await resetDb();
  await db.cards.bulkAdd([
    {
      id: 'delete-target-source',
      name: '来源卡',
      type: 'SAVINGS',
      initialBalance: 10_000,
      isDefault: 1,
      sortOrder: 1,
      createdAt: 1,
    },
    {
      id: 'delete-savings-target',
      name: '接收卡',
      type: 'SAVINGS',
      initialBalance: 0,
      isDefault: 0,
      sortOrder: 2,
      createdAt: 2,
    },
    {
      id: 'delete-fund-target',
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
  await db.savingsActuals.add({
    id: 'delete-target-source-actual',
    cardId: 'delete-target-source',
    month: '2026-10',
    amount: 10_000,
    updatedAt: 1,
  });

  await assetTransferService.create({
    sourceCardId: 'delete-target-source',
    targetCardId: 'delete-savings-target',
    targetKind: 'SAVINGS',
    amount: '10',
    date: '2026-10-01',
  });
  await cardsService.remove('delete-savings-target');
  assert.equal((await db.savingsActuals.get('delete-target-source-actual'))?.amount, 10_000);

  await assetTransferService.create({
    sourceCardId: 'delete-target-source',
    targetCardId: 'delete-fund-target',
    targetKind: 'FUND_PRINCIPAL',
    amount: '30',
    date: '2026-10-02',
  });
  await cardsService.remove('delete-fund-target');
  assert.equal((await db.savingsActuals.get('delete-target-source-actual'))?.amount, 10_000);
  assert.equal(await db.assetTransfers.count(), 0);

  db.close();
  await db.delete();
});
