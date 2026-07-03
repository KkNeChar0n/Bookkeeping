import { db, newId, nowTs } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export type SavingsEntryKind = 'INCOME' | 'EXCESS';

export interface SavingsEntryDTO {
  id: string;
  kind: SavingsEntryKind;
  amount: string;
  note: string | null;
}

export const savingsEntryService = {
  /** 某卡某月的多笔条目（收入 + 超额支出） */
  async list(cardId: string, month: string): Promise<SavingsEntryDTO[]> {
    const rows = await db.savingsEntries.where('[cardId+month]').equals([cardId, month]).toArray();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ id: r.id, kind: r.kind, amount: fromCents(r.amount), note: r.note ?? null }));
  },

  async add(input: {
    cardId: string;
    month: string;
    kind: SavingsEntryKind;
    amount: string;
    note?: string;
  }): Promise<void> {
    const amt = toCents(input.amount);
    if (amt <= 0) throw new Error('金额必须为正');
    await db.savingsEntries.add({
      id: newId(),
      cardId: input.cardId,
      month: input.month,
      kind: input.kind,
      amount: amt,
      note: input.note?.trim() || undefined,
      createdAt: nowTs(),
    });
  },

  async remove(id: string): Promise<void> {
    await db.savingsEntries.delete(id);
  },

  /** 某周期(prefix)的实际收入合计（所有储蓄卡） */
  async actualIncome(prefix: string): Promise<Cents> {
    const rows = await db.savingsEntries.where('kind').equals('INCOME').toArray();
    return rows.filter((r) => r.month.startsWith(prefix)).reduce((s, r) => s + r.amount, 0);
  },

  /** 某卡截至某月的累计收入 */
  async cumIncomeUpTo(cardId: string, refMonth: string): Promise<Cents> {
    const all = await db.savingsEntries.where('cardId').equals(cardId).toArray();
    return all
      .filter((r) => r.kind === 'INCOME' && r.month <= refMonth)
      .reduce((s, r) => s + r.amount, 0);
  },

  /** 截至某月的累计超额支出（所有储蓄卡）——对账里真正从储蓄流出的消费钱 */
  async cumExcessUpTo(refMonth: string): Promise<Cents> {
    const rows = await db.savingsEntries.where('kind').equals('EXCESS').toArray();
    return rows.filter((r) => r.month <= refMonth).reduce((s, r) => s + r.amount, 0);
  },
};
