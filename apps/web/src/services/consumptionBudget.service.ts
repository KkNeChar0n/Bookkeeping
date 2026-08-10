import { db, newId, nowTs, type ConsumptionBudgetRow } from '../db/db';
import {
  allocateCarry,
  consumptionMonthTotals,
  VIRTUAL_CONSUMPTION_CARD_ID,
} from '../domain/consumption';
import { fromCents, toCents, type Cents } from '../domain/money';

function prevMonth(month: string): string {
  const [year, value] = month.split('-').map(Number);
  const index = year * 12 + value - 2;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

async function monthlyTotals(upTo: string) {
  const [budgets, excessRows, transactions] = await Promise.all([
    db.consumptionBudgets.toArray(),
    db.savingsEntries.where('kind').equals('EXCESS').toArray(),
    db.transactions.where('cardId').equals(VIRTUAL_CONSUMPTION_CARD_ID).toArray(),
  ]);
  const budgetByMonth = new Map<string, Cents>();
  for (const row of budgets) {
    if (row.month <= upTo) {
      budgetByMonth.set(row.month, (budgetByMonth.get(row.month) ?? 0) + row.amount);
    }
  }
  const excessByMonth = new Map<string, Cents>();
  for (const row of excessRows) {
    if (row.month <= upTo) {
      excessByMonth.set(row.month, (excessByMonth.get(row.month) ?? 0) + row.amount);
    }
  }
  const spentByMonth = new Map<string, Cents>();
  for (const row of transactions) {
    if (row.type !== 'OUT') continue;
    const month = row.date.slice(0, 7);
    if (month <= upTo) {
      spentByMonth.set(month, (spentByMonth.get(month) ?? 0) + -row.amount);
    }
  }
  const months = [...new Set([
    ...budgetByMonth.keys(),
    ...excessByMonth.keys(),
    ...spentByMonth.keys(),
  ])].sort();
  return { months, budgetByMonth, excessByMonth, spentByMonth };
}

async function series(upTo: string) {
  const values = await monthlyTotals(upTo);
  let prepaid = 0;
  let carryoverTotal = 0;
  let totalBudget = 0;
  let totalSpent = 0;
  let overspendPos = 0;
  for (const month of values.months) {
    const totals = consumptionMonthTotals({
      budget: values.budgetByMonth.get(month) ?? 0,
      excess: values.excessByMonth.get(month) ?? 0,
      spent: values.spentByMonth.get(month) ?? 0,
      prepaidStart: prepaid,
    });
    carryoverTotal += totals.carry;
    totalBudget += totals.budget;
    totalSpent += totals.spent;
    overspendPos += totals.overspend;
    prepaid = totals.prepaidEnd;
  }
  return { bufferEnd: prepaid, carryoverTotal, totalBudget, totalSpent, overspendPos };
}

export interface ConsumptionFundingRow {
  savingsCardId: string;
  savingsCardName: string;
  amount: string;
  carry: string;
  newTransfer: string;
}

export interface ConsumptionFundingView {
  month: string;
  budget: string;
  prepaidStart: string;
  rows: ConsumptionFundingRow[];
}

export const consumptionBudgetService = {
  /** A savings card's exact-month contribution; missing values stay empty in the editor. */
  async contribution(savingsCardId: string, month: string): Promise<string> {
    const row = await db.consumptionBudgets
      .where('[savingsCardId+month]')
      .equals([savingsCardId, month])
      .first();
    return row ? fromCents(row.amount) : '';
  },

  /** Replace a savings card's exact-month contribution; zero removes it. */
  async setBudget(input: { savingsCardId: string; month: string; amount: string }): Promise<void> {
    const amount = toCents(input.amount || '0');
    const existing = await db.consumptionBudgets
      .where('[savingsCardId+month]')
      .equals([input.savingsCardId, input.month])
      .first();
    if (amount <= 0) {
      if (existing) await db.consumptionBudgets.delete(existing.id);
      return;
    }
    if (existing) {
      await db.consumptionBudgets.update(existing.id, { amount, updatedAt: nowTs() });
      return;
    }
    const row: ConsumptionBudgetRow = {
      id: newId(),
      savingsCardId: input.savingsCardId,
      month: input.month,
      amount,
      updatedAt: nowTs(),
    };
    await db.consumptionBudgets.add(row);
  },

  /** Global monthly quota = sum of every savings card's contribution for this exact month. */
  async quotaFor(month: string): Promise<Cents> {
    const rows = await db.consumptionBudgets.where('month').equals(month).toArray();
    return rows.reduce((sum, row) => sum + row.amount, 0);
  },

  /** Global monthly excess recharge, without card weighting or cross-month fallback. */
  async excessFor(month: string): Promise<Cents> {
    const rows = await db.savingsEntries.where('kind').equals('EXCESS').toArray();
    return rows.filter((row) => row.month === month).reduce((sum, row) => sum + row.amount, 0);
  },

  /** Saved funding and the single globally allocated carry pool for a month. */
  async fundingForMonth(month: string): Promise<ConsumptionFundingView> {
    const [cards, budgets, prepaidText] = await Promise.all([
      db.cards.toArray(),
      db.consumptionBudgets.where('month').equals(month).toArray(),
      this.bufferBefore(month),
    ]);
    const savings = cards
      .filter((card) => card.type === 'SAVINGS')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    const bySavings = new Map(budgets.map((row) => [row.savingsCardId, row.amount]));
    const allocations = allocateCarry(
      savings.map((card) => ({ savingsCardId: card.id, budget: bySavings.get(card.id) ?? 0 })),
      toCents(prepaidText),
    );
    const allocationByCard = new Map(allocations.map((row) => [row.savingsCardId, row]));
    return {
      month,
      budget: fromCents(allocations.reduce((sum, row) => sum + row.budget, 0)),
      prepaidStart: prepaidText,
      rows: savings.map((card) => {
        const row = allocationByCard.get(card.id)!;
        return {
          savingsCardId: card.id,
          savingsCardName: card.name,
          amount: fromCents(row.budget),
          carry: fromCents(row.carry),
          newTransfer: fromCents(row.newTransfer),
        };
      }),
    };
  },

  async bufferBefore(month: string): Promise<string> {
    const values = await series(prevMonth(month));
    return fromCents(Math.max(0, values.bufferEnd));
  },

  async reconcileTotals(refMonth: string): Promise<{
    totalBudget: Cents;
    totalSpent: Cents;
    carryover: Cents;
    overspendPos: Cents;
    buffer: Cents;
  }> {
    const values = await series(refMonth);
    return {
      totalBudget: values.totalBudget,
      totalSpent: values.totalSpent,
      carryover: values.carryoverTotal,
      overspendPos: values.overspendPos,
      buffer: values.bufferEnd,
    };
  },
};
