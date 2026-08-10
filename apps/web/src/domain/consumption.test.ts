import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateCarry, consumptionMonthTotals, sumExactMonth } from './consumption';

test('July quota cannot leak into August', () => {
  const july = consumptionMonthTotals({ budget: 218_095, excess: 0, spent: 0 });
  const august = consumptionMonthTotals({ budget: 200_000, excess: 0, spent: 0 });
  assert.equal(july.budget, 218_095);
  assert.equal(august.budget, 200_000);
  assert.equal(august.remaining, 200_000);
});

test('multiple savings contributions and excess recharges are global sums', () => {
  const budget = sumExactMonth([
    { month: '2026-07', amount: 218_095 },
    { month: '2026-08', amount: 120_000 },
    { month: '2026-08', amount: 80_000 },
  ], '2026-08');
  const excess = sumExactMonth([
    { month: '2026-08', amount: 10_000 },
    { month: '2026-08', amount: 5_500 },
    { month: '2026-09', amount: 90_000 },
  ], '2026-08');
  const totals = consumptionMonthTotals({ budget, excess, spent: 90_000 });
  assert.equal(totals.budget, 200_000);
  assert.equal(totals.excess, 15_500);
  assert.equal(totals.remaining, 125_500);
});

test('excess recharge keeps remaining positive without hiding over-budget spending', () => {
  const totals = consumptionMonthTotals({ budget: 200_000, excess: 50_000, spent: 220_000 });
  assert.equal(totals.remaining, 30_000);
  assert.equal(totals.overspend, 20_000);
});

test('carry is capped globally and allocated once with deterministic cents', () => {
  const month = consumptionMonthTotals({ budget: 300, excess: 50, spent: 120, prepaidStart: 100 });
  assert.equal(month.carry, 100);
  assert.equal(month.newTransfer, 200);
  assert.equal(month.prepaidEnd, 230);
  const rows = allocateCarry(
    [
      { savingsCardId: 'a', budget: 100 },
      { savingsCardId: 'b', budget: 200 },
    ],
    101,
  );
  assert.deepEqual(rows, [
    { savingsCardId: 'a', budget: 100, carry: 33, newTransfer: 67 },
    { savingsCardId: 'b', budget: 200, carry: 68, newTransfer: 132 },
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.carry, 0), 101);
  assert.equal(allocateCarry([{ savingsCardId: 'a', budget: 50 }], 100)[0].carry, 50);
});
