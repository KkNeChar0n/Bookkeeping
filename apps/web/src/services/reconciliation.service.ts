import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { fromCents } from '../domain/money';

export interface Reconciliation {
  refMonth: string;
  budgetTotal: string; // 预算总资产 = Σ储蓄预期 + Σ基金本金（截至 refMonth）
  actualTotal: string; // 实际总资产 = Σ储蓄实际 + Σ基金市值
  diff: string; // 实际 − 预算
  fundProfit: string; // 基金盈亏（市值 − 本金）
  overspend: string; // 累计消费超支（截至 refMonth）
  incomeDiff: string; // 累计收入差额（截至 refMonth）
  interest: string; // 利息/其他（残差）
  savingsFilled: boolean;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const reconciliationService = {
  /** 截至 refMonth 的总资产对账；不传=当前月 */
  async compute(refMonth?: string): Promise<Reconciliation> {
    const ref = refMonth || thisMonth();
    const cards = await db.cards.toArray();
    const savings = cards.filter((c) => c.type === 'SAVINGS');
    const funds = cards.filter((c) => c.type === 'FUND');

    let savingsExpected = 0;
    let savingsActual = 0;
    let savingsFilled = savings.length > 0;
    let cumExpectedIncome = 0;
    let cumActualIncome = 0;
    for (const c of savings) {
      savingsExpected += await budgetPlanService.expectedBalance(c.id, ref);
      const bal = await savingsActualService.balanceAsOf(c.id, ref);
      if (bal) {
        savingsActual += bal.amount;
        cumExpectedIncome += await budgetPlanService.totalIncomeUpTo(c.id, ref);
        cumActualIncome += await savingsEntryService.cumIncomeUpTo(c.id, ref);
      } else {
        savingsFilled = false;
      }
    }

    let fundPrincipal = 0;
    let fundValue = 0;
    for (const f of funds) {
      fundPrincipal += f.fundPrincipal ?? f.initialBalance;
      fundValue += f.fundValue ?? f.initialBalance;
    }
    const fundProfit = fundValue - fundPrincipal;

    // 消费从储蓄真正流出的钱 = 累计"超额支出"（充给消费卡的额外钱）
    const overspend = await savingsEntryService.cumExcessUpTo(ref);
    const incomeDiff = cumActualIncome - cumExpectedIncome;

    const budgetTotal = savingsExpected + fundPrincipal;
    const actualTotal = savingsActual + fundValue;
    const diff = actualTotal - budgetTotal;
    // 差额 = 基金盈亏 − 超额支出 + 收入差额 + 利息
    const interest = diff - fundProfit + overspend - incomeDiff;

    return {
      refMonth: ref,
      budgetTotal: fromCents(budgetTotal),
      actualTotal: fromCents(actualTotal),
      diff: fromCents(diff),
      fundProfit: fromCents(fundProfit),
      overspend: fromCents(overspend),
      incomeDiff: fromCents(incomeDiff),
      interest: fromCents(interest),
      savingsFilled,
    };
  },
};
