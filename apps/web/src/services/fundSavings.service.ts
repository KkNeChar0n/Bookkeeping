import { db, nowTs, type FundSavingsSnapshotRow } from '../db/db';
import { fromCents, toCents } from '../domain/money';
import { isValidMonth } from '../domain/fundSavings';

export interface FundSavingsView {
  month: string;
  sourceMonth: string | null;
  marketValue: string;
  prepaid: string;
  total: string;
  filled: boolean;
  updatedAt: number | null;
}

export function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeMonth(value?: string): string {
  const month = value || currentMonth();
  if (!isValidMonth(month)) throw new Error('月份格式不正确');
  return month;
}

export function resolveFundSavings(
  rows: readonly FundSavingsSnapshotRow[],
  refMonth: string,
): FundSavingsSnapshotRow | undefined {
  return rows
    .filter((row) => row.month <= refMonth)
    .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)[0];
}

function toView(month: string, row?: FundSavingsSnapshotRow): FundSavingsView {
  const marketValue = row?.marketValue ?? 0;
  const prepaid = row?.prepaid ?? 0;
  return {
    month,
    sourceMonth: row?.month ?? null,
    marketValue: fromCents(marketValue),
    prepaid: fromCents(prepaid),
    total: fromCents(marketValue + prepaid),
    filled: !!row,
    updatedAt: row?.updatedAt ?? null,
  };
}

export const fundSavingsService = {
  async get(refMonth?: string): Promise<FundSavingsView> {
    const month = normalizeMonth(refMonth);
    return toView(month, resolveFundSavings(await db.fundSavingsSnapshots.toArray(), month));
  },

  async list(): Promise<FundSavingsView[]> {
    const rows = await db.fundSavingsSnapshots.toArray();
    return rows
      .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)
      .map((row) => toView(row.month, row));
  },

  async set(input: {
    month?: string;
    marketValue: string;
    prepaid: string;
  }): Promise<FundSavingsView> {
    const month = normalizeMonth(input.month);
    const marketValue = toCents(input.marketValue);
    const prepaid = toCents(input.prepaid);
    if (marketValue < 0 || prepaid < 0) throw new Error('当前市值和预充金额不能为负数');
    const row: FundSavingsSnapshotRow = { month, marketValue, prepaid, updatedAt: nowTs() };
    await db.fundSavingsSnapshots.put(row);
    return toView(month, row);
  },
};
