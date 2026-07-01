import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveBalance,
  adjustmentForTargetBalance,
  sumIncomeExpense,
  deriveBudgetBalances,
  resolveCoverageSnapshot,
} from './balance';
import { toCents, fromCents } from './money';

test('money 往返', () => {
  assert.equal(toCents('443830.00'), 44383000);
  assert.equal(fromCents(-39700), '-397.00');
});

test('deriveBalance', () => {
  const bal = deriveBalance(toCents('1703.00'), [
    { type: 'IN', amount: toCents('500.00') },
    { type: 'OUT', amount: -toCents('200.00') },
    { type: 'TRANSFER', amount: toCents('2000.00') },
    { type: 'ADJUST', amount: toCents('0.34') },
  ]);
  assert.equal(fromCents(bal), '4003.34');
});

test('adjustmentForTargetBalance', () => {
  assert.equal(adjustmentForTargetBalance(toCents('458111'), toCents('458311')), toCents('200'));
});

test('sumIncomeExpense 排除调账/调整', () => {
  const r = sumIncomeExpense([
    { type: 'IN', amount: toCents('8800') },
    { type: 'OUT', amount: -toCents('200') },
    { type: 'TRANSFER', amount: -toCents('2000') },
    { type: 'ADJUST', amount: toCents('12.34') },
  ]);
  assert.equal(fromCents(r.income), '8800.00');
  assert.equal(fromCents(r.expense), '200.00');
});

test('deriveBudgetBalances 滚动', () => {
  const b = deriveBudgetBalances(toCents('443830'), [
    { inAmount: toCents('8800'), outAmount: 0 },
    { inAmount: toCents('5481'), outAmount: 0 },
  ]);
  assert.equal(fromCents(b[0]), '452630.00');
  assert.equal(fromCents(b[1]), '458111.00');
});

test('resolveCoverageSnapshot', () => {
  const s = [
    { date: '2026-06-05', snapshot: 'a' },
    { date: '2026-06-10', snapshot: 'b' },
  ];
  assert.deepEqual(resolveCoverageSnapshot('2026-06-03', s), { snapshot: 'a', unfilled: false });
  assert.deepEqual(resolveCoverageSnapshot('2026-06-08', s), { snapshot: 'b', unfilled: false });
  assert.deepEqual(resolveCoverageSnapshot('2026-07-02', s), { snapshot: 'b', unfilled: true });
});
