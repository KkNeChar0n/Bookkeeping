import { db } from '../db/db';
import { fromCents } from '../domain/money';

export interface IncomeCompare {
  prefix: string;
  expected: string; // 预期收入（预算 IN 合计）
  actual: string; // 实际收入（储蓄tab填写合计）
  diff: string; // 实际 − 预期
}

export const incomeCompareService = {
  /** 按周期(prefix: 'YYYY-MM' 或 'YYYY')比较收入 */
  async compute(prefix: string): Promise<IncomeCompare> {
    const [budgetDetails, savingsActuals] = await Promise.all([
      db.budgetDetails.toArray(),
      db.savingsActuals.toArray(),
    ]);
    const expected = budgetDetails
      .filter((d) => d.kind === 'IN' && d.month.startsWith(prefix))
      .reduce((s, d) => s + d.amount, 0);
    const actual = savingsActuals
      .filter((r) => r.month.startsWith(prefix))
      .reduce((s, r) => s + (r.income ?? 0), 0);
    return {
      prefix,
      expected: fromCents(expected),
      actual: fromCents(actual),
      diff: fromCents(actual - expected),
    };
  },
};
