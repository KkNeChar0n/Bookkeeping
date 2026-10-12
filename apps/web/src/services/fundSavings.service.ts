import { db, nowTs, type FundSavingsSnapshotRow } from '../db/db';
import { fromCents, toCents } from '../domain/money';
import { isValidMonth } from '../domain/fundSavings';

export interface FundSavingsView {
  month: string;
  sourceMonth: string | null;
  marketValue: string;
  prepaid: string;
  total: string;
  netInvestment: string | null;
  /** 仅表示目标月有显式净投入值；起点/月度对账完整性请检查 missingNetInvestmentMonths。 */
  netInvestmentFilled: boolean;
  cumulativeNetInvestment: string;
  missingNetInvestmentMonths: string[];
  isFlowBaseline: boolean;
  flowBaselineMonth: string | null;
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
  const applicable = rows.filter((value) => value.month <= month);
  const byMonth = new Map(applicable.map((value) => [value.month, value]));
  const monthlyRow = byMonth.get(month);
  const flowBaselineMonth =
    applicable
      .filter((value) => value.flowBaseline === 1)
      .map((value) => value.month)
      .sort()
      .at(-1) ?? null;
  const monthlyNet = monthlyRow?.flowBaseline === 1 ? undefined : monthlyRow?.netInvestment;
  const netInvestmentFilled = Number.isSafeInteger(monthlyNet);
  const flowRows = applicable.filter(
    (value) => !flowBaselineMonth || value.month > flowBaselineMonth,
  );
  const cumulativeNetInvestment = flowRows.reduce(
    (sum, value) => sum + (Number.isSafeInteger(value.netInvestment) ? value.netInvestment! : 0),
    0,
  );
  if (!Number.isSafeInteger(cumulativeNetInvestment)) throw new Error('累计基金净投入超出金额范围');
  const missingNetInvestmentMonths: string[] = [];
  const firstMonth = applicable.map((value) => value.month).sort()[0];
  if (firstMonth) {
    const [firstYear, firstMonthNumber] = firstMonth.split('-').map(Number);
    const [lastYear, lastMonthNumber] = month.split('-').map(Number);
    for (
      let index = firstYear * 12 + firstMonthNumber - 1;
      index <= lastYear * 12 + lastMonthNumber - 1;
      index++
    ) {
      const cursor = `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
      if (
        (!flowBaselineMonth || cursor > flowBaselineMonth) &&
        !Number.isSafeInteger(byMonth.get(cursor)?.netInvestment)
      ) {
        missingNetInvestmentMonths.push(cursor);
      }
    }
  }
  const marketValue = row?.marketValueKnown === false ? 0 : row?.marketValue ?? 0;
  const prepaid = row?.prepaid ?? 0;
  return {
    month,
    sourceMonth: row?.month ?? null,
    marketValue: fromCents(marketValue),
    prepaid: fromCents(prepaid),
    total: fromCents(marketValue + prepaid),
    netInvestment: netInvestmentFilled ? fromCents(monthlyNet!) : null,
    netInvestmentFilled,
    cumulativeNetInvestment: fromCents(cumulativeNetInvestment),
    missingNetInvestmentMonths,
    isFlowBaseline: monthlyRow?.flowBaseline === 1,
    flowBaselineMonth,
    marketValueFilled: !!row && row.marketValueKnown !== false,
    filled: !!row,
    updatedAt: row?.updatedAt ?? null,
  };
}

export const fundSavingsService = {
  async get(refMonth?: string): Promise<FundSavingsView> {
    const month = normalizeMonth(refMonth);
    return toView(month, await db.fundSavingsSnapshots.toArray());
  },

  async list(): Promise<FundSavingsView[]> {
    const rows = await db.fundSavingsSnapshots.toArray();
    return rows
      .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)
      .map((row) => toView(row.month, rows));
  },

  async set(input: {
    month?: string;
    marketValue: string;
    prepaid: string;
    netInvestment?: string;
    flowBaseline?: boolean;
  }): Promise<FundSavingsView> {
    const month = normalizeMonth(input.month);
    const marketValueFilled = !!input.marketValue.trim();
    const marketValue = marketValueFilled ? toCents(input.marketValue) : 0;
    const prepaid = toCents(input.prepaid);
    const netInvestment =
      !input.flowBaseline && input.netInvestment?.trim() ? toCents(input.netInvestment) : undefined;
    if (
      !input.prepaid.trim() ||
      !Number.isSafeInteger(marketValue) ||
      !Number.isSafeInteger(prepaid) ||
      (netInvestment !== undefined && !Number.isSafeInteger(netInvestment))
    )
      throw new Error('金额必须是有效数字且不能超出范围');
    if (marketValue < 0 || prepaid < 0) throw new Error('当前市值和预充金额不能为负数');
    const row: FundSavingsSnapshotRow = {
      month,
      marketValue,
      prepaid,
      updatedAt: nowTs(),
      ...(netInvestment !== undefined ? { netInvestment } : {}),
      ...(input.flowBaseline ? { flowBaseline: 1 as const } : {}),
      ...(!marketValueFilled ? { marketValueKnown: false as const } : {}),
    };
    await db.fundSavingsSnapshots.put(row);
    return this.get(month);
  },
};
