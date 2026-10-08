export type CardType = 'SAVINGS' | 'SPEND' | 'FUND';

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  SAVINGS: '储蓄卡',
  SPEND: '消费卡',
  FUND: '基金',
};

export interface Card {
  id: string;
  name: string;
  type: CardType;
  initialBalance: string;
  isDefault: boolean;
  sortOrder: number;
  fundPrincipal?: string;
  fundValue?: string;
}

/** 卡片在某日期下的类型化摘要（主页展开 / 详情页用） */
export interface CardView {
  cardId: string;
  cardName: string;
  type: CardType;
  /** 截至所选日期的实际余额 */
  balance: string;
  /** 与预算的差额（实际 − 预算），储蓄/消费卡用 */
  budgetBalance: string;
  diff: string;
  overspent: boolean;
  /** 储蓄卡：截至日期的累计收入 */
  income: string;
  /** 消费卡：截至日期的累计支出 */
  spent: string;
  /** 基金：本金 / 盈亏 / 盈亏率(%) */
  principal: string;
  profit: string;
  profitPct: number | null;
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
