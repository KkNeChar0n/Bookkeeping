import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { fromCents } from '../domain/money';
import { fundService } from './fund.service';

export interface SavingsSummaryRow {
  cardId: string;
  cardName: string;
  month: string;
  actual: string | null; // 真实储蓄额（该月未填则 null）
  expected: string; // 预期余额（截至该月）
  diff: string | null; // 实际 − 预期
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const savingsSummaryService = {
  async list(): Promise<SavingsSummaryRow[]> {
    const savings = (await db.cards.toArray())
      .filter((c) => c.type === 'SAVINGS')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

    const rows: SavingsSummaryRow[] = [];
    for (const c of savings) {
      const latest = await savingsActualService.latest(c.id);
      const month = latest?.month ?? thisMonth();
      let expectedC = await budgetPlanService.expectedBalance(c.id, month);
      let actual = latest?.amount ?? null;
      if (c.savingsPurpose === 'FUND_POOL') {
        expectedC -= await fundService.contributedFromPool(c.id, month);
        if (latest)
          actual =
            latest.amount - (await fundService.contributedFromPool(c.id, month, latest.month));
      }
      rows.push({
        cardId: c.id,
        cardName: c.name,
        month,
        actual: actual === null ? null : fromCents(actual),
        expected: fromCents(expectedC),
        diff: actual === null ? null : fromCents(actual - expectedC),
      });
    }
    return rows;
  },

  /** 截至 refMonth 的储蓄实际 vs 预期（受统计日期控制） */
  async listAsOf(refMonth: string): Promise<SavingsSummaryRow[]> {
    const savings = (await db.cards.toArray())
      .filter((c) => c.type === 'SAVINGS')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

    const rows: SavingsSummaryRow[] = [];
    for (const c of savings) {
      const bal = await savingsActualService.balanceAsOf(c.id, refMonth);
      let expectedC = await budgetPlanService.expectedBalance(c.id, refMonth);
      let actual = bal?.amount ?? null;
      if (c.savingsPurpose === 'FUND_POOL') {
        expectedC -= await fundService.contributedFromPool(c.id, refMonth);
        if (bal)
          actual = bal.amount - (await fundService.contributedFromPool(c.id, refMonth, bal.month));
      }
      rows.push({
        cardId: c.id,
        cardName: c.name,
        month: bal?.month ?? refMonth,
        actual: actual === null ? null : fromCents(actual),
        expected: fromCents(expectedC),
        diff: actual === null ? null : fromCents(actual - expectedC),
      });
    }
    return rows;
  },
};
