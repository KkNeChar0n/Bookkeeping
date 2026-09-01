import { db } from '../db/db';
import { fromCents } from '../domain/money';

export interface InitialBalanceLogDTO {
  id: string;
  previousAmount: string;
  amount: string;
  createdAt: number;
}

export const initialBalanceLogService = {
  /** 某卡的全部期初修改记录，最新在前。 */
  async list(cardId: string): Promise<InitialBalanceLogDTO[]> {
    const rows = await db.initialBalanceLogs.where('cardId').equals(cardId).toArray();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        id: row.id,
        previousAmount: fromCents(row.previousAmount),
        amount: fromCents(row.amount),
        createdAt: row.createdAt,
      }));
  },
};
