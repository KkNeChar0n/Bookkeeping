import { db } from '../db/db';
import { savingsSummaryService } from './savingsSummary.service';
import { spendService } from './spend.service';
import { fromCents, toCents } from '../domain/money';

export interface Reconciliation {
  budgetTotal: string; // 预算总资产 = Σ储蓄预期 + Σ基金本金
  actualTotal: string; // 实际总资产 = Σ储蓄实际 + Σ基金市值
  diff: string; // 实际 − 预算
  fundProfit: string; // 基金盈亏（市值 − 本金）
  overspend: string; // 消费超支合计（正数）
  interest: string; // 利息/其他偏差（残差）
  savingsFilled: boolean; // 储蓄是否都填了真实额（未填则总资产不完整）
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const reconciliationService = {
  async compute(): Promise<Reconciliation> {
    const month = thisMonth();
    const [savings, spendViews, cards] = await Promise.all([
      savingsSummaryService.list(),
      spendService.listForMonth(month),
      db.cards.toArray(),
    ]);
    const funds = cards.filter((c) => c.type === 'FUND');

    let savingsExpected = 0;
    let savingsActual = 0;
    let savingsFilled = true;
    for (const s of savings) {
      savingsExpected += toCents(s.expected);
      if (s.actual !== null) savingsActual += toCents(s.actual);
      else savingsFilled = false;
    }

    let fundPrincipal = 0;
    let fundValue = 0;
    for (const f of funds) {
      fundPrincipal += f.fundPrincipal ?? f.initialBalance;
      fundValue += f.fundValue ?? f.initialBalance;
    }
    const fundProfit = fundValue - fundPrincipal;

    const overspend = spendViews.reduce(
      (s, v) => s + Math.max(0, -toCents(v.remaining)),
      0,
    );

    const budgetTotal = savingsExpected + fundPrincipal;
    const actualTotal = savingsActual + fundValue;
    const diff = actualTotal - budgetTotal;
    // 差额 = 基金盈亏 − 超支 + 利息  →  利息 = 差额 − 基金盈亏 + 超支
    const interest = diff - fundProfit + overspend;

    return {
      budgetTotal: fromCents(budgetTotal),
      actualTotal: fromCents(actualTotal),
      diff: fromCents(diff),
      fundProfit: fromCents(fundProfit),
      overspend: fromCents(overspend),
      interest: fromCents(interest),
      savingsFilled,
    };
  },
};
