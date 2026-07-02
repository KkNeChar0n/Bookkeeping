import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { fromCents } from '../domain/money';

export interface IncomeCompare {
  month: string;
  expected: string; // 预期收入（预算 IN 合计）
  actual: string; // 实际收入（储蓄tab填写合计）
  diff: string; // 实际 − 预期
}

export const incomeCompareService = {
  async compute(month: string): Promise<IncomeCompare> {
    const savings = (await db.cards.toArray()).filter((c) => c.type === 'SAVINGS');
    let expected = 0;
    for (const c of savings) expected += await budgetPlanService.expectedIncome(c.id, month);
    const actual = await savingsActualService.actualIncome(month);
    return {
      month,
      expected: fromCents(expected),
      actual: fromCents(actual),
      diff: fromCents(actual - expected),
    };
  },
};
