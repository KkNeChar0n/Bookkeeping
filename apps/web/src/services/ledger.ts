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

export interface CardAgg {
  balance: Cents; // 初始 + 截至日期的全部有符号金额
  income: Cents; // IN 合计
  spent: Cents; // -OUT 合计（正数）
  transferNet: Cents; // TRANSFER 净额
  adjust: Cents; // ADJUST 合计（基金即累计盈亏）
}

/** 各卡截至某日期(含)的分项聚合；不传日期=全部 */
export async function cardAggregates(asOfDate?: string): Promise<Map<string, CardAgg>> {
  const [cards, txs] = await Promise.all([db.cards.toArray(), db.transactions.toArray()]);
  const m = new Map<string, CardAgg>();
  for (const c of cards) {
    m.set(c.id, { balance: c.initialBalance, income: 0, spent: 0, transferNet: 0, adjust: 0 });
  }
  for (const t of txs) {
    if (asOfDate && t.date > asOfDate) continue;
    const a = m.get(t.cardId);
    if (!a) continue;
    a.balance += t.amount;
    if (t.type === 'IN') a.income += t.amount;
    else if (t.type === 'OUT') a.spent += -t.amount;
    else if (t.type === 'TRANSFER') a.transferNet += t.amount;
    else if (t.type === 'ADJUST') a.adjust += t.amount;
  }
  return m;
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
