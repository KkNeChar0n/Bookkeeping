import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { db } from '../db/db';
import { fundSavingsService } from './fundSavings.service';

beforeEach(async () => { await db.open(); });
afterEach(async () => { db.close(); await db.delete(); });

test('monthly investment never carries forward or includes future flows', async () => {
  await fundSavingsService.set({ month: '2026-09', marketValue: '100', prepaid: '50', netInvestment: '100' });
  await fundSavingsService.set({ month: '2026-11', marketValue: '300', prepaid: '20', netInvestment: '200' });
  const october = await fundSavingsService.get('2026-10');
  assert.equal(october.marketValue, '100.00');
  assert.equal(october.prepaid, '50.00');
  assert.equal(october.sourceMonth, '2026-09');
  assert.equal(october.netInvestment, null);
  assert.equal(october.netInvestmentFilled, false);
  assert.equal(october.cumulativeNetInvestment, '100.00');
  assert.deepEqual(october.missingNetInvestmentMonths, ['2026-10']);
  assert.deepEqual((await fundSavingsService.get('2026-08')).missingNetInvestmentMonths, []);

  await fundSavingsService.set({ month: '2026-10', marketValue: '105', prepaid: '50' });
  assert.equal((await fundSavingsService.get('2026-10')).netInvestment, null);
  await fundSavingsService.set({ month: '2026-10', marketValue: '105', prepaid: '50', netInvestment: '50' });
  await fundSavingsService.set({ month: '2026-10', marketValue: '80', prepaid: '70', netInvestment: '-20' });
  const redeemed = await fundSavingsService.get('2026-10');
  assert.equal(redeemed.netInvestment, '-20.00');
  assert.equal(redeemed.cumulativeNetInvestment, '80.00');
  assert.deepEqual(redeemed.missingNetInvestmentMonths, []);
  assert.equal(await db.fundSavingsSnapshots.count(), 3);
  const history = await fundSavingsService.list();
  assert.equal(history.find((row) => row.month === '2026-11')?.cumulativeNetInvestment, '280.00');
});

test('legacy and empty net investments are unknown, explicit zero is confirmed', async () => {
  await db.fundSavingsSnapshots.put({ month: '2026-12', marketValue: 0, prepaid: 0, updatedAt: 1 });
  const carried = await fundSavingsService.get('2027-02');
  assert.equal(carried.netInvestment, null);
  assert.deepEqual(carried.missingNetInvestmentMonths, ['2026-12', '2027-01', '2027-02']);
  await fundSavingsService.set({ month: '2027-01', marketValue: '0', prepaid: '0', netInvestment: ' ' });
  assert.equal((await fundSavingsService.get('2027-01')).netInvestment, null);
  assert.equal('netInvestment' in (await db.fundSavingsSnapshots.get('2027-01'))!, false);
  await fundSavingsService.set({ month: '2027-01', marketValue: '0', prepaid: '0', netInvestment: '0' });
  const confirmed = await fundSavingsService.get('2027-01');
  assert.equal(confirmed.netInvestment, '0.00');
  assert.equal(confirmed.netInvestmentFilled, true);
  assert.deepEqual(confirmed.missingNetInvestmentMonths, ['2026-12']);
});

test('explicit historical baseline excludes earlier flows without pretending the month was zero', async () => {
  await fundSavingsService.set({ month: '2026-07', marketValue: '70', prepaid: '0', netInvestment: '70' });
  await fundSavingsService.set({ month: '2026-09', marketValue: '', prepaid: '5670', flowBaseline: true, netInvestment: '999' });
  const baseline = await fundSavingsService.get('2026-09');
  assert.equal(baseline.isFlowBaseline, true);
  assert.equal(baseline.flowBaselineMonth, '2026-09');
  assert.equal(baseline.marketValueFilled, false);
  assert.equal(baseline.netInvestment, null);
  assert.equal(baseline.cumulativeNetInvestment, '0.00');
  assert.deepEqual(baseline.missingNetInvestmentMonths, []);
  assert.equal('netInvestment' in (await db.fundSavingsSnapshots.get('2026-09'))!, false);
  assert.equal((await fundSavingsService.get('2026-07')).cumulativeNetInvestment, '70.00');
  assert.deepEqual((await fundSavingsService.get('2026-10')).missingNetInvestmentMonths, ['2026-10']);
  await fundSavingsService.set({ month: '2026-10', marketValue: '100', prepaid: '2610', netInvestment: '30' });
  assert.equal((await fundSavingsService.get('2026-10')).cumulativeNetInvestment, '30.00');
  await fundSavingsService.set({ month: '2026-12', marketValue: '100', prepaid: '0', flowBaseline: true });
  assert.equal((await fundSavingsService.get('2026-10')).cumulativeNetInvestment, '30.00');
  assert.equal((await fundSavingsService.get('2027-01')).flowBaselineMonth, '2026-12');
  assert.deepEqual((await fundSavingsService.get('2027-01')).missingNetInvestmentMonths, ['2027-01']);
});

test('fund input rejects invalid, negative balance and out-of-range values', async () => {
  for (const input of [
    { marketValue: '-1', prepaid: '0' },
    { marketValue: '0', prepaid: '-1' },
    { marketValue: '0', prepaid: '' },
    { marketValue: '0', prepaid: 'Infinity' },
    { marketValue: '0', prepaid: '0', netInvestment: 'Infinity' },
    { marketValue: '0', prepaid: '0', netInvestment: 'NaN' },
    { marketValue: '0', prepaid: '0', netInvestment: '999999999999999' },
  ]) {
    await assert.rejects(fundSavingsService.set({ month: '2026-10', ...input }));
  }
  assert.equal(await db.fundSavingsSnapshots.count(), 0);
});

test('unknown market values remain placeholders and valid final-year months terminate', async () => {
  await db.fundSavingsSnapshots.put({
    month: '9999-12', marketValue: 100, prepaid: 0, marketValueKnown: false, updatedAt: 1,
  });
  const value = await fundSavingsService.get('9999-12');
  assert.equal(value.marketValue, '0.00');
  assert.equal(value.marketValueFilled, false);
  assert.deepEqual(value.missingNetInvestmentMonths, ['9999-12']);
});
