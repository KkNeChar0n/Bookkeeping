import { db } from '../db/db';
import { budgetPlanService } from './budgetPlan.service';
import { savingsActualService } from './savingsActual.service';
import { savingsEntryService } from './savingsEntry.service';
import { consumptionBudgetService } from './consumptionBudget.service';
import { fromCents, toCents } from '../domain/money';
import { fundSavingsService } from './fundSavings.service';
import { addMonths } from '../lib/format';
import { getBookkeepingStart } from './bookkeepingScope';

export interface Reconciliation {
  refMonth: string;
  bookkeepingStartDate: string | null;
  reconciliationAvailable: boolean;
  budgetTotal: string; // 对账预算基准 = Σ储蓄预期
  actualTotal: string; // 实际总资产 = Σ储蓄实际 + 基金当前市值
  diff: string; // 实际 − 预算
  fundMarketValue: string;
  fundMarketValueFilled: boolean;
  overspend: string; // 逐月超出消费定额的部分之和，不与少花月份抵销
  prepaid: string; // 消费充值对账余额；累计消费起账模式不等同于真实消费资金结余
  carryover: string; // 资产口径累计结转；累计消费模式只计起账月之后
  incomeDiff: string; // 累计收入差额（截至 refMonth）
  interest: string; // 截至 refMonth 累计资产变动/其他（未解释残差）
  savingsFilled: boolean;
  savingsBalanceSources: { cardName: string; month: string | null }[];
  fundSourceMonth: string | null;
}

export interface InterestChange {
  previousMonth: string;
  previousInterest: string | null;
  amount: string | null;
  unavailableReason: string | null;
  warnings: string[];
}

export interface ReconciliationReport extends Reconciliation {
  interestChange: InterestChange;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const reconciliationService = {
  /** 截至 refMonth 的总资产对账；不传=当前月 */
  async compute(refMonth?: string): Promise<Reconciliation> {
    const ref = refMonth || thisMonth();
    const start = await getBookkeepingStart();
    if (start && ref < start.startDate.slice(0, 7)) {
      // Numeric fields are placeholders only; callers must display the archived-period notice.
      return {
        refMonth: ref, bookkeepingStartDate: start.startDate, reconciliationAvailable: false,
        budgetTotal: '0.00', actualTotal: '0.00', diff: '0.00',
        fundMarketValue: '0.00', fundMarketValueFilled: false,
        overspend: '0.00', prepaid: '0.00', carryover: '0.00', incomeDiff: '0.00', interest: '0.00',
        savingsFilled: false, savingsBalanceSources: [], fundSourceMonth: null,
      };
    }
    const cards = await db.cards.toArray();
    const savings = cards.filter((c) => c.type === 'SAVINGS');

    let savingsExpected = 0;
    let savingsActual = 0;
    let savingsFilled = savings.length > 0;
    const savingsBalanceSources: Reconciliation['savingsBalanceSources'] = [];
    let cumExpectedIncome = 0;
    let cumActualIncome = 0;
    for (const c of savings) {
      savingsExpected += await budgetPlanService.expectedBalance(c.id, ref);
      const bal = await savingsActualService.balanceAsOf(c.id, ref);
      savingsBalanceSources.push({ cardName: c.name, month: bal?.month ?? null });
      if (bal) {
        savingsActual += bal.amount;
        cumExpectedIncome += await budgetPlanService.totalIncomeUpTo(c.id, ref);
        cumActualIncome += await savingsEntryService.cumIncomeUpTo(c.id, ref);
      } else {
        savingsFilled = false;
      }
    }

    const fund = await fundSavingsService.get(ref);
    const fundMarketValue = toCents(fund.marketValue);

    // 消费侧累计量。保留历史消费模式下定额/充值/超支覆盖完整历史，
    // 资产口径结转只计起账月之后，之前的资金流已包含在手填期初中。
    const { carryover, overspendPos } = await consumptionBudgetService.reconcileTotals(ref);
    const moved = await savingsEntryService.cumExcessUpTo(ref); // 累计额外充值
    const overspend = overspendPos; // 消费超支：逐月真正超过预算的部分（没花就是 0）
    // 保持既有对账口径：正常未花预算不计入预充暂存。
    const prepaid = moved - overspend - carryover;
    const incomeDiff = cumActualIncome - cumExpectedIncome;

    const budgetTotal = savingsExpected;
    const actualTotal = savingsActual + fundMarketValue;
    const diff = actualTotal - budgetTotal;
    // 差额 = 收入差额 + 资产变动/其他 − 消费超支 − 消费预充暂存。
    // 基金现金由普通储蓄卡承载，基金只把当前市值加入实际总资产。
    // 买入时现金减少且市值增加，总资产中性；市值涨跌自然进入剩余差额。
    //      （消费超支 + 预充暂存 = Σ超额充值 − Σ结转 = 额外挪出净额）
    const interest = diff - incomeDiff + overspend + prepaid;

    return {
      refMonth: ref,
      bookkeepingStartDate: start?.startDate ?? null,
      reconciliationAvailable: true,
      budgetTotal: fromCents(budgetTotal),
      actualTotal: fromCents(actualTotal),
      diff: fromCents(diff),
      fundMarketValue: fromCents(fundMarketValue),
      fundMarketValueFilled: !fund.filled || fund.marketValueFilled,
      overspend: fromCents(overspend),
      prepaid: fromCents(prepaid),
      carryover: fromCents(carryover),
      incomeDiff: fromCents(incomeDiff),
      interest: fromCents(interest),
      savingsFilled,
      savingsBalanceSources,
      fundSourceMonth: fund.sourceMonth,
    };
  },

  /** 统计展示用的只读相邻月对比；不改变累计口径或持久化任何金额。 */
  async report(refMonth?: string): Promise<ReconciliationReport> {
    const ref = refMonth || thisMonth();
    const previousMonth = addMonths(ref, -1);
    const current = await this.compute(ref);
    if (!current.reconciliationAvailable) {
      return {
        ...current,
        interestChange: {
          previousMonth, previousInterest: null, amount: null,
          unavailableReason: `起账前资产账本已${(await getBookkeepingStart())?.manualOpening ? '删除' : '归档'}；此期间仅保留历史消费查询。`, warnings: [],
        },
      };
    }
    if (current.bookkeepingStartDate?.slice(0, 7) === ref) {
      const start = await getBookkeepingStart();
      const complete = current.savingsFilled;
      return {
        ...current,
        interestChange: {
          previousMonth,
          previousInterest: '0.00',
          amount: complete ? current.interest : null,
          unavailableReason: complete ? null : '新账储蓄余额未填写完整。',
          warnings: [start?.manualOpening
            ? '本月为手工重新起账首月，按新填写的期初和资产对账，不与旧账上月比较；不会自动调平。'
            : `本月从 ${current.bookkeepingStartDate} 已核实的零差额起点计算，不与旧账上月比较。`],
        },
      };
    }
    const previous = await this.compute(previousMonth);
    const missing: string[] = [];
    const warnings: string[] = [];
    for (const result of [previous, current]) {
      if (!result.savingsFilled) missing.push(`${result.refMonth} 储蓄余额未填完整`);
      for (const source of result.savingsBalanceSources) {
        if (source.month && source.month !== result.refMonth) {
          warnings.push(`${result.refMonth} 的${source.cardName}余额沿用自 ${source.month}。`);
        }
      }
      if (result.fundSourceMonth && result.fundSourceMonth !== result.refMonth) {
        warnings.push(`${result.refMonth} 的基金市值沿用自 ${result.fundSourceMonth}。`);
      }
    }
    const previousComplete = previous.savingsFilled;
    return {
      ...current,
      interestChange: {
        previousMonth,
        previousInterest: previousComplete ? previous.interest : null,
        amount: missing.length ? null : fromCents(toCents(current.interest) - toCents(previous.interest)),
        unavailableReason: missing.length ? `${missing.join('；')}，无法计算完整新增差额。` : null,
        warnings,
      },
    };
  },
};
