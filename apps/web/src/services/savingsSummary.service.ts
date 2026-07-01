import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { fromCents } from '../domain/money';

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
      const expectedC = await budgetPlanService.expectedBalance(c.id, month);
      rows.push({
        cardId: c.id,
        cardName: c.name,
        month,
        actual: latest ? fromCents(latest.amount) : null,
        expected: fromCents(expectedC),
        diff: latest ? fromCents(latest.amount - expectedC) : null,
      });
    }
    return rows;
  },
};
