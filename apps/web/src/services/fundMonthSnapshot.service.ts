import { db, newId, nowTs, type CardRow, type FundMonthSnapshotRow } from '../db/db';
import { fromCents, type Cents } from '../domain/money';

export interface ResolvedFundMonth {
  fundCardId: string;
  fundCardName: string;
  month: string;
  principal: Cents;
  value: Cents;
  profit: Cents;
  filled: boolean;
}

export interface FundMonthSnapshotDTO {
  id: string;
  month: string;
  principal: string;
  value: string;
  profit: string;
  updatedAt: number;
}

export interface FundMonthAsOfDTO {
  fundCardId: string;
  fundCardName: string;
  month: string;
  principal: string;
  value: string;
  profit: string;
  profitPct: number | null;
  filled: boolean;
}

export function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeMonth(value?: string): string {
  const month = value || currentMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式不正确');
  return month;
}

function latestUpTo(rows: FundMonthSnapshotRow[], refMonth: string) {
  return rows
    .filter((row) => row.month <= refMonth)
    .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)[0];
}

export function resolveFundMonth(
  card: CardRow,
  rows: FundMonthSnapshotRow[],
  refMonth: string,
): ResolvedFundMonth {
  const snapshot = latestUpTo(rows, refMonth);
  const principal = snapshot?.principal ?? card.initialBalance;
  const value = snapshot?.value ?? card.initialBalance;
  return {
    fundCardId: card.id,
    fundCardName: card.name,
    month: snapshot?.month ?? refMonth,
    principal,
    value,
    profit: value - principal,
    filled: !!snapshot,
  };
}

export async function upsertFundMonthSnapshot(input: {
  fundCardId: string;
  month: string;
  principal: Cents;
  value: Cents;
}): Promise<FundMonthSnapshotRow> {
  const month = normalizeMonth(input.month);
  if (input.principal < 0 || input.value < 0) throw new Error('基金本金和市值不能为负数');
  const existing = await db.fundMonthSnapshots
    .where('[fundCardId+month]')
    .equals([input.fundCardId, month])
    .first();
  const row: FundMonthSnapshotRow = {
    id: existing?.id ?? newId(),
    fundCardId: input.fundCardId,
    month,
    principal: input.principal,
    value: input.value,
    updatedAt: nowTs(),
  };
  await db.fundMonthSnapshots.put(row);
  return row;
}

export const fundMonthSnapshotService = {
  async list(fundCardId: string): Promise<FundMonthSnapshotDTO[]> {
    const rows = await db.fundMonthSnapshots.where('fundCardId').equals(fundCardId).toArray();
    return rows
      .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: row.id,
        month: row.month,
        principal: fromCents(row.principal),
        value: fromCents(row.value),
        profit: fromCents(row.value - row.principal),
        updatedAt: row.updatedAt,
      }));
  },

  async listAsOf(refMonth: string): Promise<ResolvedFundMonth[]> {
    const month = normalizeMonth(refMonth);
    const [cards, snapshots] = await Promise.all([
      db.cards.toArray(),
      db.fundMonthSnapshots.toArray(),
    ]);
    return cards
      .filter((card) => card.type === 'FUND')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map((card) =>
        resolveFundMonth(
          card,
          snapshots.filter((row) => row.fundCardId === card.id),
          month,
        ),
      );
  },

  async listAsOfView(refMonth: string): Promise<FundMonthAsOfDTO[]> {
    return (await this.listAsOf(refMonth)).map((row) => ({
      fundCardId: row.fundCardId,
      fundCardName: row.fundCardName,
      month: row.month,
      principal: fromCents(row.principal),
      value: fromCents(row.value),
      profit: fromCents(row.profit),
      profitPct:
        row.principal === 0 ? null : Math.round((row.profit / row.principal) * 10_000) / 100,
      filled: row.filled,
    }));
  },
};
