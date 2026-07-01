// 纯函数：余额派生引擎（不依赖任何存储，便于单元测试与复用）
import type { Cents } from './money';

export type TxType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';

export interface BalanceTx {
  type: TxType;
  /** 对本卡余额的有符号影响（IN/+，OUT/-，TRANSFER ±，ADJUST ±） */
  amount: Cents;
}

/** 某卡实际余额 = 初始余额 + 全部流水有符号金额之和 */
export function deriveBalance(initialBalance: Cents, txs: ReadonlyArray<BalanceTx>): Cents {
  return txs.reduce((acc, t) => acc + t.amount, initialBalance);
}

/** 手改余额需补一条 ADJUST：金额 = 目标余额 − 当前派生余额 */
export function adjustmentForTargetBalance(currentDerived: Cents, targetBalance: Cents): Cents {
  return targetBalance - currentDerived;
}

export interface IncomeExpense {
  income: Cents;
  expense: Cents;
}

/** 收支统计：仅统计 IN/OUT，排除 TRANSFER 与 ADJUST */
export function sumIncomeExpense(txs: ReadonlyArray<BalanceTx>): IncomeExpense {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'IN') income += t.amount;
    else if (t.type === 'OUT') expense += -t.amount;
  }
  return { income, expense };
}

export interface BudgetLineInput {
  inAmount: Cents;
  outAmount: Cents;
}

/** 给定按日期升序的各快照行，返回每个快照处的滚动派生余额 */
export function deriveBudgetBalances(
  initialBalance: Cents,
  linesByDateAsc: ReadonlyArray<BudgetLineInput>,
): Cents[] {
  const out: Cents[] = [];
  let running = initialBalance;
  for (const line of linesByDateAsc) {
    running += line.inAmount - line.outAmount;
    out.push(running);
  }
  return out;
}

export interface DatedSnapshot<T> {
  date: string;
  snapshot: T;
}

export interface CoverageResult<T> {
  snapshot: T | null;
  /** true 表示目标日期晚于所有快照（“该期预算未填”） */
  unfilled: boolean;
}

/**
 * 覆盖周期：对日期 D，取“日期 ≥ D 的最近一个快照”。
 * 若 D 晚于所有快照，则取最后一个并标记 unfilled。
 */
export function resolveCoverageSnapshot<T>(
  targetDate: string,
  snapshots: ReadonlyArray<DatedSnapshot<T>>,
): CoverageResult<T> {
  if (snapshots.length === 0) return { snapshot: null, unfilled: true };
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const covering = sorted.find((s) => s.date >= targetDate);
  if (covering) return { snapshot: covering.snapshot, unfilled: false };
  return { snapshot: sorted[sorted.length - 1].snapshot, unfilled: true };
}
