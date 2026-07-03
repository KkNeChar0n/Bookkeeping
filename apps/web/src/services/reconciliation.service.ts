import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { spendService } from './spend.service';
import { fromCents } from '../domain/money';

export interface Reconciliation {
  refMonth: string;
  budgetTotal: string; // 预算总资产 = Σ储蓄预期 + Σ基金本金（截至 refMonth）
  actualTotal: string; // 实际总资产 = Σ储蓄实际 + Σ基金市值
  diff: string; // 实际 − 预算
  fundProfit: string; // 基金盈亏（市值 − 本金）
  overspend: string; // 累计消费超支（真正花掉的、超过额度的钱）
  prepaid: string; // 预充暂存 = 挪给消费卡的钱 − 真超支（暂时没花掉的部分）
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

    // 从储蓄挪给消费卡的钱（累计"超额支出"条目）
    const moved = await savingsEntryService.cumExcessUpTo(ref);
    // 其中真正花掉的（消费记录里逐月超过额度的部分）
    const overspend = await spendService.cumOverspendUpTo(ref);
    // 剩下的是预充在消费卡、暂时没花的钱（可正可负）
    const prepaid = moved - overspend;
    const incomeDiff = cumActualIncome - cumExpectedIncome;

    const budgetTotal = savingsExpected + fundPrincipal;
    const actualTotal = savingsActual + fundValue;
    const diff = actualTotal - budgetTotal;
    // 差额 = 基金盈亏 − 消费超支 − 预充暂存 + 收入差额 + 利息
    //      （消费超支 + 预充暂存 = 从储蓄挪出的钱，故利息残差不变）
    const interest = diff - fundProfit + moved - incomeDiff;

    return {
      refMonth: ref,
      budgetTotal: fromCents(budgetTotal),
      actualTotal: fromCents(actualTotal),
      diff: fromCents(diff),
      fundProfit: fromCents(fundProfit),
      overspend: fromCents(overspend),
      prepaid: fromCents(prepaid),
      incomeDiff: fromCents(incomeDiff),
      interest: fromCents(interest),
      savingsFilled,
    };
  },
};
