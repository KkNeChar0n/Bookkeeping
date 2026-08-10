import type { Cents } from './money';

/** Stable internal account used by every consumption transaction. */
export const VIRTUAL_CONSUMPTION_CARD_ID = '__virtual_consumption__';
export const VIRTUAL_CONSUMPTION_CARD_NAME = '消费';

export interface ConsumptionMonthInput {
  budget: Cents;
  excess: Cents;
  spent: Cents;
  prepaidStart?: Cents;
}

export interface MonthlyAmount {
  month: string;
  amount: Cents;
}

export function sumExactMonth(rows: MonthlyAmount[], month: string): Cents {
  return rows
    .filter((row) => row.month === month)
    .reduce((sum, row) => sum + row.amount, 0);
}

export interface ConsumptionMonthTotals {
  budget: Cents;
  excess: Cents;
  spent: Cents;
  remaining: Cents;
  overspend: Cents;
  carry: Cents;
  newTransfer: Cents;
  prepaidEnd: Cents;
}

/**
 * The canonical monthly formula. Excess recharge increases available money but
 * deliberately does not conceal spending above the user's monthly budget.
 */
export function consumptionMonthTotals(input: ConsumptionMonthInput): ConsumptionMonthTotals {
  const prepaidStart = input.prepaidStart ?? 0;
  const carry = Math.min(Math.max(prepaidStart, 0), input.budget);
  return {
    budget: input.budget,
    excess: input.excess,
    spent: input.spent,
    remaining: input.budget + input.excess - input.spent,
    overspend: Math.max(0, input.spent - input.budget),
    carry,
    newTransfer: input.budget - carry,
    prepaidEnd: prepaidStart + input.budget + input.excess - input.spent - carry,
  };
}

export interface BudgetContribution {
  savingsCardId: string;
  budget: Cents;
}

export interface CarryAllocation extends BudgetContribution {
  carry: Cents;
  newTransfer: Cents;
}

/** Allocate the single global carry pool proportionally; the last row absorbs cents. */
export function allocateCarry(
  contributions: BudgetContribution[],
  prepaidStart: Cents,
): CarryAllocation[] {
  const positive = contributions.map((row) => ({ ...row, budget: Math.max(0, row.budget) }));
  const totalBudget = positive.reduce((sum, row) => sum + row.budget, 0);
  const totalCarry = Math.min(Math.max(prepaidStart, 0), totalBudget);
  let assigned = 0;
  return positive.map((row, index) => {
    const carry =
      index === positive.length - 1
        ? totalCarry - assigned
        : totalBudget > 0
          ? Math.floor((totalCarry * row.budget) / totalBudget)
          : 0;
    assigned += carry;
    return { ...row, carry, newTransfer: row.budget - carry };
  });
}
