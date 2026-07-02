import { db } from '../db/db';
import { fromCents, type Cents } from '../domain/money';

export interface SpendStatRow {
  category: string;
  amount: string;
  pct: number; // 占比 %
}
export interface SpendStats {
  total: string;
  rows: SpendStatRow[];
}

export const spendStatsService = {
  /** 按消费类型汇总金额与占比。prefix: 'YYYY-MM'(按月) 或 'YYYY'(按年) */
  async byCategory(prefix: string): Promise<SpendStats> {
    const txs = await db.transactions.toArray();
    const byCat = new Map<string, Cents>();
    let total = 0;
    for (const t of txs) {
      if (t.type !== 'OUT') continue;
      if (!t.date.startsWith(prefix)) continue;
      const amt = -t.amount; // OUT 存负数，取正
      const cat = t.category ?? '未分类';
      byCat.set(cat, (byCat.get(cat) ?? 0) + amt);
      total += amt;
    }
    const rows: SpendStatRow[] = [...byCat.entries()]
      .map(([category, amt]) => ({
        category,
        amount: fromCents(amt),
        pct: total > 0 ? Math.round((amt / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
    return { total: fromCents(total), rows };
  },
};
