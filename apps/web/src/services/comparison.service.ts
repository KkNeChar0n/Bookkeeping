import { db } from '../db/db';
import { budgetsService } from './budgets.service';
import { actualBalancesByCard } from './ledger';
import { resolveCoverageSnapshot } from '../domain/balance';
import { fromCents, toCents } from '../domain/money';
import type { Comparison, ComparisonCard } from '../api/types';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const comparisonService = {
  async compare(targetDate?: string): Promise<Comparison> {
    const target = (targetDate ?? todayISO()).slice(0, 10);
    const cardsRaw = await db.cards.toArray();
    const cards = cardsRaw.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    const [snapshots, actualMap] = await Promise.all([
      budgetsService.list(),
      actualBalancesByCard(),
    ]);

    const coverage = resolveCoverageSnapshot(
      target,
      snapshots.map((s) => ({ date: s.date, snapshot: s })),
    );
    const basis = coverage.snapshot;
    const budgetByCard = new Map((basis?.lines ?? []).map((l) => [l.cardId, toCents(l.balance)]));

    const cardDTOs: ComparisonCard[] = cards.map((c) => {
      const budgetBal = budgetByCard.get(c.id) ?? 0;
      const actualBal = actualMap.get(c.id) ?? 0;
      return {
        cardId: c.id,
        cardName: c.name,
        budgetBalance: fromCents(budgetBal),
        actualBalance: fromCents(actualBal),
        diff: fromCents(actualBal - budgetBal),
        overspent: actualBal < budgetBal,
      };
    });

    return {
      targetDate: target,
      basisDate: basis?.date ?? null,
      unfilled: coverage.unfilled,
      cards: cardDTOs,
    };
  },
};
