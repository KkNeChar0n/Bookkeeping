import { db, newId, nowTs, type SavingsActualRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export interface SavingsMonthDTO {
  id: string;
  month: string; // YYYY-MM
  amount: string;
}

export const savingsActualService = {
  async list(cardId: string): Promise<SavingsMonthDTO[]> {
    const rows = await db.savingsActuals.where('cardId').equals(cardId).toArray();
    return rows
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((r) => ({ id: r.id, month: r.month, amount: fromCents(r.amount) }));
  },

  /** 某卡某月填写真实储蓄额（每月唯一，upsert） */
  async setAmount(input: { cardId: string; month: string; amount: string }): Promise<void> {
    const amt = toCents(input.amount);
    const existing = await db.savingsActuals
      .where('[cardId+month]')
      .equals([input.cardId, input.month])
      .first();
    if (existing) {
      await db.savingsActuals.update(existing.id, { amount: amt, updatedAt: nowTs() });
    } else {
      const row: SavingsActualRow = {
        id: newId(),
        cardId: input.cardId,
        month: input.month,
        amount: amt,
        updatedAt: nowTs(),
      };
      await db.savingsActuals.add(row);
    }
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

  /** 清除某储蓄卡某月的全部数据，恢复到初始状态
   *  （真实金额 / 本月收入 / 超额支出 / 本月消费预算 / 修改流水） */
  async clearMonth(cardId: string, month: string): Promise<void> {
    await db.transaction(
      'rw',
      [db.savingsActuals, db.savingsEntries, db.savingsLogs, db.consumptionBudgets],
      async () => {
        await db.savingsActuals.where('[cardId+month]').equals([cardId, month]).delete();
        await db.savingsEntries.where('[cardId+month]').equals([cardId, month]).delete();
        await db.savingsLogs.where('[cardId+month]').equals([cardId, month]).delete();
        await db.consumptionBudgets.where('[savingsCardId+month]').equals([cardId, month]).delete();
      },
    );
  },

  /** 最新一个月的真实储蓄额 */
  async latest(cardId: string): Promise<{ month: string; amount: Cents } | null> {
    const rows = await db.savingsActuals.where('cardId').equals(cardId).toArray();
    if (!rows.length) return null;
    const r = rows.sort((a, b) => b.month.localeCompare(a.month))[0];
    return { month: r.month, amount: r.amount };
  },
};
