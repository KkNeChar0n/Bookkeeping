import { db } from '../db/db';
import type { Cents } from '../domain/money';

/** 各卡实际派生余额（分）：初始 + 该卡全部流水有符号金额之和 */
export async function actualBalancesByCard(): Promise<Map<string, Cents>> {
  const [cards, txs] = await Promise.all([db.cards.toArray(), db.transactions.toArray()]);
  const sum = new Map<string, Cents>();
  for (const t of txs) sum.set(t.cardId, (sum.get(t.cardId) ?? 0) + t.amount);
  const out = new Map<string, Cents>();
  for (const c of cards) out.set(c.id, c.initialBalance + (sum.get(c.id) ?? 0));
  return out;
}

/** 单卡当前派生余额（分） */
export async function actualBalanceForCard(cardId: string): Promise<Cents> {
  const card = await db.cards.get(cardId);
  const txs = await db.transactions.where('cardId').equals(cardId).toArray();
  const initial = card ? card.initialBalance : 0;
  return initial + txs.reduce((a, t) => a + t.amount, 0);
}

export interface IncomeExpenseCents {
  income: Cents;
  expense: Cents;
}

/** 收支统计（排除 TRANSFER 与 ADJUST），可选日期区间（含端点，字符串比较） */
export async function incomeExpense(range?: {
  from?: string;
  to?: string;
}): Promise<IncomeExpenseCents> {
  const txs = await db.transactions.toArray();
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (range?.from && t.date < range.from) continue;
    if (range?.to && t.date > range.to) continue;
    if (t.type === 'IN') income += t.amount;
    else if (t.type === 'OUT') expense += -t.amount;
  }
  return { income, expense };
}
