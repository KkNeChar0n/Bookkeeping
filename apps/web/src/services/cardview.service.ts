import { db } from '../db/db';
import { budgetsService } from './budgets.service';
import { cardAggregates } from './ledger';
import { resolveCoverageSnapshot } from '../domain/balance';
import { fromCents, toCents } from '../domain/money';
import type { CardView } from '../api/types';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const cardViewService = {
  /** 某日期下各卡的类型化摘要（主页/详情页用） */
  async list(date?: string): Promise<CardView[]> {
    const target = (date ?? todayISO()).slice(0, 10);
    const cardsRaw = await db.cards.toArray();
    const cards = cardsRaw.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    const [snapshots, agg] = await Promise.all([budgetsService.list(), cardAggregates(target)]);

    const coverage = resolveCoverageSnapshot(
      target,
      snapshots.map((s) => ({ date: s.date, snapshot: s })),
    );
    const budgetByCard = new Map(
      (coverage.snapshot?.lines ?? []).map((l) => [l.cardId, toCents(l.balance)]),
    );

    return cards.map((c) => {
      const a = agg.get(c.id)!;
      const budgetBal = budgetByCard.get(c.id) ?? 0;
      // 基金：本金 = 初始 + 调账净额；盈亏 = 累计市值调整
      const principal = c.initialBalance + a.transferNet;
      const profit = a.adjust;
      const profitPct = principal !== 0 ? Math.round((profit / principal) * 10000) / 100 : null;
      // 超支：消费卡看余额<0；其它看实际<预算
      const overspent = c.type === 'SPEND' ? a.balance < 0 : a.balance < budgetBal;
      return {
        cardId: c.id,
        cardName: c.name,
        type: c.type ?? 'SAVINGS',
        balance: fromCents(a.balance),
        budgetBalance: fromCents(budgetBal),
        diff: fromCents(a.balance - budgetBal),
        overspent,
        income: fromCents(a.income),
        spent: fromCents(a.spent),
        principal: fromCents(principal),
        profit: fromCents(profit),
        profitPct,
      };
    });
  },

  async one(cardId: string, date?: string): Promise<CardView | undefined> {
    return (await this.list(date)).find((c) => c.cardId === cardId);
  },
};
