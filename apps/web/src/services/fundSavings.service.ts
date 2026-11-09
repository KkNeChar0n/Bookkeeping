import { db, nowTs, type FundSavingsSnapshotRow } from '../db/db';
import { fromCents, toCents } from '../domain/money';
import { isValidMonth } from '../domain/fundSavings';
import { assertActiveMonth, getBookkeepingStart } from './bookkeepingScope';

export interface FundSavingsView {
  month: string;
  sourceMonth: string | null;
  marketValue: string;
  /** 旧版预充余额，仅用于提示用户迁移到普通储蓄卡，不参与任何计算。 */
  legacyPrepaidSnapshots: { month: string; amount: string }[];
  marketValueFilled: boolean;
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

function toView(month: string, rows: readonly FundSavingsSnapshotRow[]): FundSavingsView {
  const row = resolveFundSavings(rows, month);
  const marketValue = row?.marketValueKnown === false ? 0 : row?.marketValue ?? 0;
  return {
    month,
    sourceMonth: row?.month ?? null,
    marketValue: fromCents(marketValue),
    legacyPrepaidSnapshots: rows
      .filter((value) => Number.isSafeInteger(value.prepaid) && value.prepaid! > 0)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((value) => ({ month: value.month, amount: fromCents(value.prepaid!) })),
    marketValueFilled: !!row && row.marketValueKnown !== false,
    filled: !!row,
    updatedAt: row?.updatedAt ?? null,
  };
}

export const fundSavingsService = {
  async get(refMonth?: string): Promise<FundSavingsView> {
    const month = normalizeMonth(refMonth);
    const [rows, start] = await Promise.all([db.fundSavingsSnapshots.toArray(), getBookkeepingStart()]);
    const startMonth = start?.startDate.slice(0, 7);
    return toView(month, rows.filter((row) => !startMonth || row.month >= startMonth));
  },

  async list(): Promise<FundSavingsView[]> {
    const [all, start] = await Promise.all([
      db.fundSavingsSnapshots.toArray(),
      getBookkeepingStart(),
    ]);
    const startMonth = start?.startDate.slice(0, 7);
    const rows = all.filter((row) => !startMonth || row.month >= startMonth);
    return rows
      .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)
      .map((row) => toView(row.month, rows));
  },

  async set(input: {
    month?: string;
    marketValue: string;
  }): Promise<FundSavingsView> {
    const month = normalizeMonth(input.month);
    await assertActiveMonth(month);
    const marketValueFilled = !!input.marketValue.trim();
    const marketValue = marketValueFilled ? toCents(input.marketValue) : 0;
    if (!Number.isSafeInteger(marketValue)) throw new Error('金额必须是有效数字且不能超出范围');
    if (marketValue < 0) throw new Error('当前市值不能为负数');
    const row: FundSavingsSnapshotRow = {
      month,
      marketValue,
      updatedAt: nowTs(),
      ...(!marketValueFilled ? { marketValueKnown: false as const } : {}),
    };
    // put 整行覆盖：重新保存旧月份时会清掉 prepaid/netInvestment/flowBaseline。
    await db.fundSavingsSnapshots.put(row);
    return this.get(month);
  },
};
