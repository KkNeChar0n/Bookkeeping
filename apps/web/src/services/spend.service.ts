import { db } from '../db/db';
import { consumptionMonthTotals, VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { fromCents, type Cents } from '../domain/money';
import { consumptionBudgetService } from './consumptionBudget.service';
import { getBookkeepingStart, hasConsumptionHistory, isActiveConsumption } from './bookkeepingScope';

export interface SpendMonthView {
  month: string;
  quota: string;
  hasQuota: boolean;
  spent: string;
  excess: string;
  remaining: string;
  overspend: string;
  overspent: boolean;
  /** 启用重新起账后，全部消费含仅供查询的历史消费。 */
  totalSpent?: string;
  historicalOnly?: boolean;
  startDate?: string;
  /** Consumption stays cumulative across an asset-only restart. */
  consumptionHistory?: true;
}

export interface SpendPeriodView extends SpendMonthView {
  months: SpendMonthView[];
}

export const spendService = {
  async monthView(month: string): Promise<SpendMonthView> {
    const [quota, excess, transactions, start] = await Promise.all([
      consumptionBudgetService.quotaFor(month),
      consumptionBudgetService.excessFor(month),
      db.transactions.where('cardId').equals(VIRTUAL_CONSUMPTION_CARD_ID).toArray(),
      getBookkeepingStart(),
    ]);
    const monthly = transactions.filter((row) => row.type === 'OUT' && row.date.slice(0, 7) === month);
    const totalSpent = monthly.reduce((sum, row) => sum + -row.amount, 0);
    const spent: Cents = monthly
      .filter((row) => isActiveConsumption(row, start))
      .reduce((sum, row) => sum + -row.amount, 0);
    const totals = consumptionMonthTotals({ budget: quota, excess, spent });
    return {
      month,
      quota: fromCents(quota),
      hasQuota: quota > 0,
      spent: fromCents(spent),
      excess: fromCents(excess),
      remaining: fromCents(totals.remaining),
      overspend: fromCents(totals.overspend),
      overspent: totals.overspend > 0,
      ...(start ? {
        totalSpent: fromCents(totalSpent),
        historicalOnly: !hasConsumptionHistory(start) && month < start.startDate.slice(0, 7),
        startDate: start.startDate,
        ...(hasConsumptionHistory(start) ? { consumptionHistory: true as const } : {}),
      } : {}),
    };
  },

  /** A month view stays exact-month; a year view sums values and monthly overspend. */
  async periodView(prefix: string): Promise<SpendPeriodView> {
    if (prefix.length === 7) {
      const row = await this.monthView(prefix);
      return { ...row, months: [row] };
    }
    const months = Array.from(
      { length: 12 },
      (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`,
    );
    const rows = await Promise.all(months.map((month) => this.monthView(month)));
    const sum = (field: 'quota' | 'spent' | 'excess' | 'remaining' | 'overspend') =>
      rows.reduce((total, row) => total + Number(row[field]), 0);
    const overspend = sum('overspend');
    const start = await getBookkeepingStart();
    return {
      month: prefix,
      quota: fromCents(Math.round(sum('quota') * 100)),
      hasQuota: rows.some((row) => row.hasQuota),
      spent: fromCents(Math.round(sum('spent') * 100)),
      excess: fromCents(Math.round(sum('excess') * 100)),
      remaining: fromCents(Math.round(sum('remaining') * 100)),
      overspend: fromCents(Math.round(overspend * 100)),
      overspent: overspend > 0,
      months: rows,
      ...(start ? {
        totalSpent: fromCents(rows.reduce((total, row) => total + Math.round(Number(row.totalSpent ?? row.spent) * 100), 0)),
        historicalOnly: !hasConsumptionHistory(start) && prefix < start.startDate.slice(0, 4),
        startDate: start.startDate,
        ...(hasConsumptionHistory(start) ? { consumptionHistory: true as const } : {}),
      } : {}),
    };
  },
};
