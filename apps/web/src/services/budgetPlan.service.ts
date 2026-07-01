import { db, newId, nowTs, type BudgetDetailRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export interface BudgetDetailDTO {
  id: string;
  label: string;
  kind: 'IN' | 'OUT';
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
  return { id: d.id, label: d.label, kind: d.kind, amount: fromCents(d.amount) };
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
    kind: 'IN' | 'OUT';
    amount: string;
  }): Promise<void> {
    const amt = toCents(input.amount);
    if (amt <= 0) throw new Error('金额必须为正');
    await db.budgetDetails.add({
      id: newId(),
      cardId: input.cardId,
      month: input.month,
      label: input.label.trim() || (input.kind === 'IN' ? '收入' : '调出'),
      kind: input.kind,
      amount: amt,
      createdAt: nowTs(),
    });
  },

  async deleteDetail(id: string): Promise<void> {
    await db.budgetDetails.delete(id);
  },

  /** 各储蓄卡「截至某月」的预期余额（统计用）。month 缺省=最新有细节的月 */
  async expectedBalance(cardId: string, month: string): Promise<Cents> {
    const [rows, initial] = await Promise.all([
      db.budgetDetails.where('cardId').equals(cardId).toArray(),
      initialOf(cardId),
    ]);
    let bal = initial;
    for (const r of rows) {
      if (r.month <= month) bal += r.kind === 'IN' ? r.amount : -r.amount;
    }
    return bal;
  },
};
