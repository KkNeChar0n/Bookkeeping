import { db } from '../db/db';
import { savingsEntryService } from './savingsEntry.service';
import { fromCents } from '../domain/money';
import { getBookkeepingStart } from './bookkeepingScope';

export interface IncomeCompare {
  prefix: string;
  expected: string; // 预期收入（预算 IN 合计）
  actual: string; // 实际收入（储蓄tab填写合计）
  diff: string; // 实际 − 预期
}

export const incomeCompareService = {
  /** 按周期(prefix: 'YYYY-MM' 或 'YYYY')比较收入 */
  async compute(prefix: string): Promise<IncomeCompare> {
    const [budgetDetails, start] = await Promise.all([
      db.budgetDetails.toArray(),
      getBookkeepingStart(),
    ]);
    const startMonth = start?.startDate.slice(0, 7);
    const expected = budgetDetails
      .filter((d) => d.kind === 'IN' && d.month.startsWith(prefix) && (!startMonth || d.month >= startMonth))
      .reduce((s, d) => s + d.amount, 0);
    const actual = await savingsEntryService.actualIncome(prefix);
    return {
      prefix,
      expected: fromCents(expected),
      actual: fromCents(actual),
      diff: fromCents(actual - expected),
    };
  },
};
