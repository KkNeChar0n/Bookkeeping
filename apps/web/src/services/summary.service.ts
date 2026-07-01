import { incomeExpense } from './ledger';
import { comparisonService } from './comparison.service';
import { fromCents, type Cents } from '../domain/money';
import type { PeriodIE, Summary } from '../api/types';

function monthRange(year: number, monthIndex: number): { from: string; to: string; label: string } {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last), label };
}

function pct(cur: Cents, base: Cents): number | null {
  if (base === 0) return null;
  return Math.round(((cur - base) / base) * 10000) / 100;
}

export const summaryService = {
  async monthly(month?: string): Promise<Summary> {
    const now = new Date();
    let year = now.getUTCFullYear();
    let monthIndex = now.getUTCMonth();
    if (month) {
      const [y, m] = month.split('-').map(Number);
      if (y && m) {
        year = y;
        monthIndex = m - 1;
      }
    }
    const cur = monthRange(year, monthIndex);
    const prev = monthRange(year, monthIndex - 1);
    const lastYear = monthRange(year - 1, monthIndex);

    const [curIE, prevIE, lastYearIE, comparison] = await Promise.all([
      incomeExpense({ from: cur.from, to: cur.to }),
      incomeExpense({ from: prev.from, to: prev.to }),
      incomeExpense({ from: lastYear.from, to: lastYear.to }),
      comparisonService.compare(cur.to),
    ]);

    const period = (label: string, ie: { income: Cents; expense: Cents }): PeriodIE => ({
      label,
      income: fromCents(ie.income),
      expense: fromCents(ie.expense),
    });

    return {
      month: cur.label,
      current: period(cur.label, curIE),
      m2m: {
        previous: period(prev.label, prevIE),
        incomePct: pct(curIE.income, prevIE.income),
        expensePct: pct(curIE.expense, prevIE.expense),
      },
      y2y: {
        sameMonthLastYear: period(lastYear.label, lastYearIE),
        incomePct: pct(curIE.income, lastYearIE.income),
        expensePct: pct(curIE.expense, lastYearIE.expense),
      },
      budgetVsActual: comparison,
    };
  },
};
