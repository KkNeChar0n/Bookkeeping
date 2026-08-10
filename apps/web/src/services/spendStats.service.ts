import { db } from '../db/db';
import { fromCents, type Cents } from '../domain/money';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';

export interface SpendStatItem {
  id: string;
  amount: string; // 正数
  note: string | null;
  date: string; // YYYY-MM-DD
}
export interface SpendStatRow {
  category: string;
  amount: string;
  pct: number; // 占比 %
  items: SpendStatItem[]; // 该分类下的每笔明细（时间倒序）
}
export interface SpendStats {
  total: string;
  rows: SpendStatRow[];
}

export const spendStatsService = {
  /** 按消费类型汇总金额与占比，并附每笔明细。prefix: 'YYYY-MM'(按月) 或 'YYYY'(按年) */
  async byCategory(prefix: string): Promise<SpendStats> {
    const txs = await db.transactions.toArray();
    const byCat = new Map<string, { amount: Cents; items: (SpendStatItem & { createdAt: number })[] }>();
    let total = 0;
    for (const t of txs) {
      if (t.type !== 'OUT' || t.cardId !== VIRTUAL_CONSUMPTION_CARD_ID) continue;
      if (!t.date.startsWith(prefix)) continue;
      const amt = -t.amount; // OUT 存负数，取正
      const cat = t.category ?? '未分类';
      const entry = byCat.get(cat) ?? { amount: 0, items: [] };
      entry.amount += amt;
      entry.items.push({
        id: t.id,
        amount: fromCents(amt),
        note: t.note ?? null,
        date: t.date,
        createdAt: t.createdAt,
      });
      byCat.set(cat, entry);
      total += amt;
    }
    const rows: SpendStatRow[] = [...byCat.entries()]
      .map(([category, e]) => ({
        category,
        amount: fromCents(e.amount),
        pct: total > 0 ? Math.round((e.amount / total) * 1000) / 10 : 0,
        items: e.items
          .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.createdAt - a.createdAt))
          .map(({ createdAt: _createdAt, ...it }) => it),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
    return { total: fromCents(total), rows };
  },
};
