import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { consumptionBudgetService } from './consumptionBudget.service';
import { fromCents } from '../domain/money';

export interface Reconciliation {
  refMonth: string;
  budgetTotal: string; // 预算总资产 = Σ储蓄预期 + Σ基金本金（截至 refMonth）
  actualTotal: string; // 实际总资产 = Σ储蓄实际 + Σ基金市值
  diff: string; // 实际 − 预算
  fundProfit: string; // 基金盈亏（市值 − 本金）
  overspend: string; // 累计消费超支（净额：已花 − 消费预算）
  prepaid: string; // 预充暂存（消费卡里还没花掉的钱，随结转自动升降）
  carryover: string; // 累计结转（用掉上月预充的部分）
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

    // 消费侧累计量（含跨月结转）
    const { carryover, overspendPos } = await consumptionBudgetService.reconcileTotals(ref);
    const moved = await savingsEntryService.cumExcessUpTo(ref); // 额外挪给消费卡的钱
    const overspend = overspendPos; // 消费超支：逐月真正超过预算的部分（没花就是 0）
    const prepaid = moved - overspend - carryover; // 预充暂存：额外结余（正常没花的预算不计入）
    const incomeDiff = cumActualIncome - cumExpectedIncome;

    const budgetTotal = savingsExpected + fundPrincipal;
    const actualTotal = savingsActual + fundValue;
    const diff = actualTotal - budgetTotal;
    // 差额 = 基金盈亏 + 收入差额 + 利息 − 消费超支 − 预充暂存
    //      （消费超支 + 预充暂存 = Σ超额支出 − Σ结转 = 额外挪出净额）
    const interest = diff - fundProfit - incomeDiff + overspend + prepaid;

    return {
      refMonth: ref,
      budgetTotal: fromCents(budgetTotal),
      actualTotal: fromCents(actualTotal),
      diff: fromCents(diff),
      fundProfit: fromCents(fundProfit),
      overspend: fromCents(overspend),
      prepaid: fromCents(prepaid),
      carryover: fromCents(carryover),
      incomeDiff: fromCents(incomeDiff),
      interest: fromCents(interest),
      savingsFilled,
    };
  },
};
