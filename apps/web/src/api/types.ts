export interface Card {
  id: string;
  name: string;
  initialBalance: string;
  isDefault: boolean;
  sortOrder: number;
}

export type TxType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';

export interface Transaction {
  id: string;
  cardId: string;
  date: string;
  type: TxType;
  amount: string;
  category: string | null;
  note: string | null;
  peerCardId: string | null;
  peerCardName: string | null;
  transferGroupId: string | null;
}

export interface BudgetLine {
  cardId: string;
  cardName: string;
  inAmount: string;
  outAmount: string;
  balance: string;
}

export interface BudgetSnapshot {
  id: string;
  date: string;
  note: string | null;
  lines: BudgetLine[];
  totals: { inAmount: string; outAmount: string; balance: string };
}

export interface ComparisonCard {
  cardId: string;
  cardName: string;
  budgetBalance: string;
  actualBalance: string;
  diff: string;
  overspent: boolean;
}

export interface Comparison {
  targetDate: string;
  basisDate: string | null;
  unfilled: boolean;
  cards: ComparisonCard[];
}

export interface Categories {
  income: string[];
  expense: string[];
}

export interface PeriodIE {
  label: string;
  income: string;
  expense: string;
}

export interface Summary {
  month: string;
  current: PeriodIE;
  m2m: { previous: PeriodIE; incomePct: number | null; expensePct: number | null };
  y2y: { sameMonthLastYear: PeriodIE; incomePct: number | null; expensePct: number | null };
  budgetVsActual: Comparison;
}
