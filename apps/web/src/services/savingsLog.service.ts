import { db, newId, nowTs, type SavingsLogRow } from '../db/db';
import { fromCents, toCents } from '../domain/money';

export type SavingsLogField = SavingsLogRow['field'];

export interface SavingsLogDTO {
  id: string;
  field: SavingsLogField;
  amount: string;
  createdAt: number;
}

export const savingsLogService = {
  /** 某卡某月的修改流水，最新在前 */
  async list(cardId: string, month: string): Promise<SavingsLogDTO[]> {
    const rows = await db.savingsLogs.where('[cardId+month]').equals([cardId, month]).toArray();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, field: r.field, amount: fromCents(r.amount), createdAt: r.createdAt }));
  },

  /** 记一条修改流水（改成的新值 + 时间戳） */
  async add(input: {
    cardId: string;
    month: string;
    field: SavingsLogField;
    amount: string;
  }): Promise<void> {
    await db.savingsLogs.add({
      id: newId(),
      cardId: input.cardId,
      month: input.month,
      field: input.field,
      amount: toCents(input.amount || '0'),
      createdAt: nowTs(),
    });
  },
};
