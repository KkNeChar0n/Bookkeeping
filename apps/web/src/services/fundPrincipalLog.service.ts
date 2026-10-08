import { db } from '../db/db';
import { fromCents } from '../domain/money';

export const fundPrincipalLogService = {
  async list(fundCardId: string) {
    const rows = await db.fundPrincipalLogs.where('fundCardId').equals(fundCardId).toArray();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        id: row.id,
        fundCardId: row.fundCardId,
        previousAmount: fromCents(row.previousAmount),
        amount: fromCents(row.amount),
        createdAt: row.createdAt,
      }));
  },
};
