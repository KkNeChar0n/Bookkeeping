import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { cardsService } from './cards.service';
import { fundSavingsService } from './fundSavings.service';
import { reconciliationService } from './reconciliation.service';
import { savingsActualService } from './savingsActual.service';

const cardId = 'reconciliation-report-source';

async function setBalance(month: string, amount = '974.92'): Promise<void> {
  await savingsActualService.setAmount({ cardId, month, amount });
}

beforeEach(async () => {
  await db.open();
  await db.cards.add({
    id: cardId,
    name: '邮政卡',
    type: 'SAVINGS',
    initialBalance: 200_000,
    isDefault: 1,
    sortOrder: 1,
    createdAt: 1,
  });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

test('equal historical residuals stay cumulative while the monthly change is zero', async () => {
  await setBalance('2026-09');
  await setBalance('2026-10');

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.interest, '-1025.08');
  assert.deepEqual(report.interestChange, {
    previousMonth: '2026-09',
    previousInterest: '-1025.08',
    amount: '0.00',
    unavailableReason: null,
    warnings: [],
  });
  assert.deepEqual(report.savingsBalanceSources, [{ cardName: '邮政卡', month: '2026-10' }]);
  assert.equal(report.fundSourceMonth, null);

  const { interestChange: _change, ...cumulative } = report;
  assert.deepEqual(cumulative, await reconciliationService.compute('2026-10'));
});

test('integer-cent differences expose a genuine increase without erasing historical residuals', async () => {
  await setBalance('2026-09');
  await setBalance('2026-10', '976.15');

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.interest, '-1023.85');
  assert.equal(report.interestChange.previousInterest, '-1025.08');
  assert.equal(report.interestChange.amount, '1.23');
  assert.equal((await reconciliationService.compute('2026-09')).interest, '-1025.08');
});

test('the first balance month does not invent a zero previous residual', async () => {
  await setBalance('2026-09');

  const report = await reconciliationService.report('2026-09');
  assert.equal(report.interest, '-1025.08');
  assert.equal(report.interestChange.previousMonth, '2026-08');
  assert.equal(report.interestChange.previousInterest, null);
  assert.equal(report.interestChange.amount, null);
  assert.match(report.interestChange.unavailableReason ?? '', /2026-08.*储蓄/);
});

test('unfilled savings remain unavailable rather than using future or zero balances', async () => {
  await setBalance('2026-11');

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.savingsFilled, false);
  assert.deepEqual(report.savingsBalanceSources, [{ cardName: '邮政卡', month: null }]);
  assert.equal(report.interestChange.previousInterest, null);
  assert.equal(report.interestChange.amount, null);
  assert.match(report.interestChange.unavailableReason ?? '', /2026-09/);
  assert.match(report.interestChange.unavailableReason ?? '', /2026-10/);
});

test('a missing current fund investment prevents a complete monthly change', async () => {
  await setBalance('2026-09', '2000');
  await setBalance('2026-10', '2000');
  await fundSavingsService.set({
    month: '2026-09', marketValue: '50', prepaid: '0', netInvestment: '0',
  });
  await fundSavingsService.set({ month: '2026-10', marketValue: '50', prepaid: '0' });

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.fundNetInvestmentFilled, false);
  assert.equal(report.interestChange.previousInterest, '0.00');
  assert.equal(report.interestChange.amount, null);
  assert.match(report.interestChange.unavailableReason ?? '', /2026-10.*基金净投入/);
});

test('an incomplete previous fund month remains unavailable even after a new baseline', async () => {
  await setBalance('2026-09', '2000');
  await setBalance('2026-10', '2000');
  await fundSavingsService.set({ month: '2026-09', marketValue: '50', prepaid: '0' });
  await fundSavingsService.set({
    month: '2026-10', marketValue: '50', prepaid: '0', flowBaseline: true,
  });

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.fundNetInvestmentFilled, true);
  assert.equal(report.interestChange.previousInterest, null);
  assert.equal(report.interestChange.amount, null);
  assert.match(report.interestChange.unavailableReason ?? '', /2026-09.*基金净投入/);
});

test('unknown fund market values do not block residual changes', async () => {
  await setBalance('2026-09', '2000');
  await setBalance('2026-10', '2001.23');
  for (const month of ['2026-09', '2026-10']) {
    await fundSavingsService.set({ month, marketValue: '', prepaid: '0', netInvestment: '0' });
  }

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.fundMarketValueFilled, false);
  assert.equal(report.interest, '1.23');
  assert.equal(report.interestChange.previousInterest, '0.00');
  assert.equal(report.interestChange.amount, '1.23');
  assert.equal(report.interestChange.unavailableReason, null);
});

test('January compares with the previous calendar year December', async () => {
  await setBalance('2026-12');
  await setBalance('2027-01', '976.15');

  const report = await reconciliationService.report('2027-01');
  assert.equal(report.interestChange.previousMonth, '2026-12');
  assert.equal(report.interestChange.previousInterest, '-1025.08');
  assert.equal(report.interestChange.amount, '1.23');
});

test('a December report remains a December versus November change, not a full year total', async () => {
  await setBalance('2025-12', '900');
  await setBalance('2026-11');
  await setBalance('2026-12', '976.15');

  const report = await reconciliationService.report('2026-12');
  assert.equal(report.interestChange.previousMonth, '2026-11');
  assert.equal(report.interestChange.previousInterest, '-1025.08');
  assert.equal(report.interestChange.amount, '1.23');
});

test('carried savings balances produce a saved-data comparison with explicit sources', async () => {
  await setBalance('2026-09');

  const report = await reconciliationService.report('2026-11');
  assert.equal(report.interestChange.previousMonth, '2026-10');
  assert.equal(report.interestChange.amount, '0.00');
  assert.deepEqual(report.savingsBalanceSources, [{ cardName: '邮政卡', month: '2026-09' }]);
  const warnings = report.interestChange.warnings.join('\n');
  assert.match(warnings, /2026-10.*邮政卡.*2026-09/);
  assert.match(warnings, /2026-11.*邮政卡.*2026-09/);
});

test('carried fund cash is identified even when missing investment makes change unavailable', async () => {
  await setBalance('2026-09', '2000');
  await setBalance('2026-10', '2000');
  await fundSavingsService.set({
    month: '2026-09', marketValue: '50', prepaid: '0', netInvestment: '0',
  });

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.fundSourceMonth, '2026-09');
  assert.equal(report.interestChange.amount, null);
  assert.match(report.interestChange.warnings.join('\n'), /2026-10.*基金.*2026-09/);
});

test('a global opening adjustment shifts both cumulative residuals equally', async () => {
  await setBalance('2026-09');
  await setBalance('2026-10', '976.15');
  const before = await reconciliationService.report('2026-10');

  await cardsService.update(cardId, { initialBalance: '974.92' });
  const after = await reconciliationService.report('2026-10');
  assert.equal(before.interest, '-1023.85');
  assert.equal(before.interestChange.previousInterest, '-1025.08');
  assert.equal(after.interest, '1.23');
  assert.equal(after.interestChange.previousInterest, '0.00');
  assert.equal(before.interestChange.amount, '1.23');
  assert.equal(after.interestChange.amount, before.interestChange.amount);
  assert.equal((await savingsActualService.balanceAsOf(cardId, '2026-09'))?.amount, 97_492);
  assert.equal((await savingsActualService.balanceAsOf(cardId, '2026-10'))?.amount, 97_615);
});

test('fund flow baseline changes warn about comparison scope without hiding the residual', async () => {
  await setBalance('2026-09', '2000');
  await setBalance('2026-10', '2000');
  await fundSavingsService.set({
    month: '2026-09', marketValue: '50', prepaid: '0', netInvestment: '10',
  });
  await fundSavingsService.set({
    month: '2026-10', marketValue: '50', prepaid: '0', flowBaseline: true,
  });

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.interest, '0.00');
  assert.equal(report.interestChange.previousInterest, '10.00');
  assert.equal(report.interestChange.amount, '-10.00');
  assert.match(report.interestChange.warnings.join('\n'), /起点.*变化.*不代表当月利息/);
});

test('a free-text calibration note remains an ordinary saved budget expense', async () => {
  await setBalance('2026-09');
  await setBalance('2026-10');
  await budgetPlanService.addDetail({
    cardId,
    month: '2026-10',
    label: '历史账目校准（非实际消费）',
    kind: 'EXPENSE',
    amount: '1025.08',
  });

  const report = await reconciliationService.report('2026-10');
  assert.equal(report.interest, '0.00');
  assert.equal(report.interestChange.previousInterest, '-1025.08');
  assert.equal(report.interestChange.amount, '1025.08');
  assert.equal((await savingsActualService.balanceAsOf(cardId, '2026-10'))?.amount, 97_492);
});

test('report queries do not create, delete, or alter any ledger data', async () => {
  await setBalance('2026-09');
  await setBalance('2026-10', '976.15');
  await fundSavingsService.set({
    month: '2026-09', marketValue: '', prepaid: '0', netInvestment: '0',
  });
  await fundSavingsService.set({
    month: '2026-10', marketValue: '50', prepaid: '0', netInvestment: '0',
  });
  const snapshot = () => Promise.all(
    db.tables.map(async (table) => ({ table: table.name, rows: await table.toArray() })),
  );
  const before = await snapshot();

  await reconciliationService.report('2026-10');
  await reconciliationService.report('2026-09');
  await reconciliationService.report('2026-11');

  assert.deepEqual(await snapshot(), before);
});
