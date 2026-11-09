import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { db } from '../db/db';
import { fundSavingsService } from './fundSavings.service';

beforeEach(async () => { await db.open(); });
afterEach(async () => { db.close(); await db.delete(); });

test('market value carries forward without creating a new month', async () => {
  await fundSavingsService.set({ month: '2026-09', marketValue: '100' });
  await fundSavingsService.set({ month: '2026-11', marketValue: '300' });
  const october = await fundSavingsService.get('2026-10');
  assert.equal(october.marketValue, '100.00');
  assert.equal(october.sourceMonth, '2026-09');
  assert.equal(october.filled, true);
  assert.equal(await db.fundSavingsSnapshots.count(), 2);
});

test('legacy cash fields are exposed only as migration hints and saving cleans the month', async () => {
  await db.fundSavingsSnapshots.bulkPut([
    { month: '2026-09', marketValue: 10_000, prepaid: 5_670, netInvestment: 3_000, flowBaseline: 1, updatedAt: 1 },
    { month: '2026-10', marketValue: 12_000, prepaid: 2_610, netInvestment: 980, updatedAt: 2 },
  ]);
  assert.deepEqual((await fundSavingsService.get('2026-10')).legacyPrepaidSnapshots, [
    { month: '2026-09', amount: '56.70' },
    { month: '2026-10', amount: '26.10' },
  ]);

  await fundSavingsService.set({ month: '2026-10', marketValue: '120' });
  assert.deepEqual(await db.fundSavingsSnapshots.get('2026-10'), {
    month: '2026-10', marketValue: 12_000,
    updatedAt: (await db.fundSavingsSnapshots.get('2026-10'))?.updatedAt,
  });
  assert.deepEqual((await fundSavingsService.get('2026-10')).legacyPrepaidSnapshots, [
    { month: '2026-09', amount: '56.70' },
  ]);
});

test('blank market value stays explicitly unknown', async () => {
  await fundSavingsService.set({ month: '2026-10', marketValue: '' });
  const value = await fundSavingsService.get('2026-10');
  assert.equal(value.marketValue, '0.00');
  assert.equal(value.marketValueFilled, false);
  assert.equal(value.filled, true);
  assert.equal((await db.fundSavingsSnapshots.get('2026-10'))?.marketValueKnown, false);
});

test('market value rejects negative and out-of-range values', async () => {
  for (const marketValue of ['-1', 'Infinity', 'NaN', '999999999999999']) {
    await assert.rejects(fundSavingsService.set({ month: '2026-10', marketValue }));
  }
  assert.equal(await db.fundSavingsSnapshots.count(), 0);
});
