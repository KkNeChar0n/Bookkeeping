import { db } from '../db/db';
import { budgetsService } from './budgets.service';
import { cardAggregates } from './ledger';
import { resolveCoverageSnapshot } from '../domain/balance';
import { fromCents, toCents } from '../domain/money';
import type { CardView } from '../api/types';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';

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
    const cards = cardsRaw
      .filter((card) => card.type === 'SAVINGS' && card.id !== VIRTUAL_CONSUMPTION_CARD_ID)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
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
      const overspent = a.balance < budgetBal;
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
      };
    });
  },

  async one(cardId: string, date?: string): Promise<CardView | undefined> {
    return (await this.list(date)).find((c) => c.cardId === cardId);
  },
};
