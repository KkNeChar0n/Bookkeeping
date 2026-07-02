import { db, newId, nowTs, type SavingsActualRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export interface SavingsMonthDTO {
  id: string;
  month: string; // YYYY-MM
  amount: string;
  income: string | null; // 本月真实收入（可选）
}

export const savingsActualService = {
  async list(cardId: string): Promise<SavingsMonthDTO[]> {
    const rows = await db.savingsActuals.where('cardId').equals(cardId).toArray();
    return rows
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((r) => ({
        id: r.id,
        month: r.month,
        amount: fromCents(r.amount),
        income: r.income != null ? fromCents(r.income) : null,
      }));
  },

  /** 某卡某月填写真实储蓄额 + 可选本月收入（每月唯一，upsert） */
  async setAmount(input: {
    cardId: string;
    month: string;
    amount: string;
    income?: string;
  }): Promise<void> {
    const amt = toCents(input.amount);
    const inc = input.income !== undefined && input.income !== '' ? toCents(input.income) : undefined;
    const existing = await db.savingsActuals
      .where('[cardId+month]')
      .equals([input.cardId, input.month])
      .first();
    if (existing) {
      await db.savingsActuals.update(existing.id, {
        amount: amt,
        ...(input.income !== undefined ? { income: inc } : {}),
        updatedAt: nowTs(),
      });
    } else {
      const row: SavingsActualRow = {
        id: newId(),
        cardId: input.cardId,
        month: input.month,
        amount: amt,
        income: inc,
        updatedAt: nowTs(),
      };
      await db.savingsActuals.add(row);
    }
  },

  /** 各储蓄卡某月的真实收入合计 */
  async actualIncome(month: string): Promise<Cents> {
    const rows = await db.savingsActuals.toArray();
    return rows.filter((r) => r.month === month).reduce((s, r) => s + (r.income ?? 0), 0);
  },

  /** 某储蓄卡「截至某月」的累计真实收入 */
  async cumIncomeUpTo(cardId: string, month: string): Promise<Cents> {
    const rows = await db.savingsActuals.where('cardId').equals(cardId).toArray();
    return rows.filter((r) => r.month <= month).reduce((s, r) => s + (r.income ?? 0), 0);
  },

  /** 某储蓄卡截至某月的真实余额（取 ≤refMonth 的最近一条），无则 null */
  async balanceAsOf(cardId: string, refMonth: string): Promise<{ month: string; amount: Cents } | null> {
    const rows = await db.savingsActuals.where('cardId').equals(cardId).toArray();
    const le = rows.filter((r) => r.month <= refMonth).sort((a, b) => b.month.localeCompare(a.month));
    return le.length ? { month: le[0].month, amount: le[0].amount } : null;
  },

  async remove(id: string): Promise<void> {
    await db.savingsActuals.delete(id);
  },

  /** 最新一个月的真实储蓄额 */
  async latest(cardId: string): Promise<{ month: string; amount: Cents } | null> {
    const rows = await db.savingsActuals.where('cardId').equals(cardId).toArray();
    if (!rows.length) return null;
    const r = rows.sort((a, b) => b.month.localeCompare(a.month))[0];
    return { month: r.month, amount: r.amount };
  },
};
