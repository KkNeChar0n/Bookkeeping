import { db, newId, nowTs, type BudgetDetailRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export type BudgetKind = 'IN' | 'OUT' | 'EXPENSE';

export interface BudgetDetailDTO {
  id: string;
  label: string;
  category: string | null;
  kind: BudgetKind;
  amount: string;
}

export interface BudgetMonthDTO {
  month: string; // YYYY-MM
  details: BudgetDetailDTO[];
  /** 当月净额（收入 − 调出） */
  net: string;
  /** 预期余额 = 初始 + 截至本月(含)累计净额 */
  expected: string;
}

function toDetail(d: BudgetDetailRow): BudgetDetailDTO {
  return { id: d.id, label: d.label, category: d.category ?? null, kind: d.kind, amount: fromCents(d.amount) };
}

async function initialOf(cardId: string): Promise<Cents> {
  const c = await db.cards.get(cardId);
  return c ? c.initialBalance : 0;
}

export const budgetPlanService = {
  /** 某储蓄卡按月的预算细节 + 滚动预期余额；extraMonths 用于展示尚无细节的空月份 */
  async months(cardId: string, extraMonths: string[] = []): Promise<BudgetMonthDTO[]> {
    const [rows, initial] = await Promise.all([
      db.budgetDetails.where('cardId').equals(cardId).toArray(),
      initialOf(cardId),
    ]);
    const byMonth = new Map<string, BudgetDetailRow[]>();
    for (const r of rows) {
      const arr = byMonth.get(r.month) ?? [];
      arr.push(r);
      byMonth.set(r.month, arr);
    }
    for (const m of extraMonths) if (!byMonth.has(m)) byMonth.set(m, []);

    const months = [...byMonth.keys()].sort();
    let running = initial;
    return months.map((month) => {
      const details = (byMonth.get(month) ?? []).sort((a, b) => a.createdAt - b.createdAt);
      // 收入 +，调出/支出 −（支出让预期余额直接减少）
      const net = details.reduce((s, d) => s + (d.kind === 'IN' ? d.amount : -d.amount), 0);
      running += net;
      return {
        month,
        details: details.map(toDetail),
        net: fromCents(net),
        expected: fromCents(running),
      };
    });
  },

  async addDetail(input: {
    cardId: string;
    month: string;
    label: string;
    category?: string;
    kind: BudgetKind;
    amount: string;
  }): Promise<void> {
    const amt = toCents(input.amount);
    if (amt <= 0) throw new Error('金额必须为正');
    const defLabel = input.kind === 'IN' ? '收入' : input.kind === 'OUT' ? '调出' : '支出';
    await db.budgetDetails.add({
      id: newId(),
      cardId: input.cardId,
      month: input.month,
      label: input.label.trim() || input.category || defLabel,
      category: input.category || undefined,
      kind: input.kind,
      amount: amt,
      createdAt: nowTs(),
    });
  },

  async deleteDetail(id: string): Promise<void> {
    await db.budgetDetails.delete(id);
  },

  /** 某储蓄卡当前月份视图：本月预期余额 + 本月细节 */
  async currentMonthView(
    cardId: string,
    month: string,
  ): Promise<{ month: string; expected: string; details: BudgetDetailDTO[] }> {
    const all = await this.months(cardId, [month]);
    const m = all.find((x) => x.month === month);
    return {
      month,
      expected: m ? m.expected : fromCents(await this.expectedBalance(cardId, month)),
      details: m ? m.details : [],
    };
  },

  /**
   * 各储蓄卡「截至某月」用于统计的预期余额：只含 收入 − 调出，
   * **不含支出**（支出不参与储蓄-预算的差额计算）。
   */
  async expectedBalance(cardId: string, month: string): Promise<Cents> {
    const [rows, initial] = await Promise.all([
      db.budgetDetails.where('cardId').equals(cardId).toArray(),
      initialOf(cardId),
    ]);
    let bal = initial;
    for (const r of rows) {
      if (r.month > month || r.kind === 'EXPENSE') continue; // 排除支出
      bal += r.kind === 'IN' ? r.amount : -r.amount;
    }
    return bal;
  },
};
