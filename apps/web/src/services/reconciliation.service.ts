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
  budgetTotal: string; // 对账预算基准 = Σ储蓄预期 − 累计基金净投入 + 市值
  actualTotal: string; // 实际总资产 = Σ储蓄实际 + 基金储蓄池
  diff: string; // 实际 − 预算
  fundMarketValue: string;
  fundPrepaid: string;
  fundTotal: string;
  fundNetInvestment: string | null;
  fundCumulativeNetInvestment: string;
  fundNetInvestmentFilled: boolean; // 截至目标月的净投入是否完整
  fundMissingNetInvestmentMonths: string[];
  fundFlowBaselineMonth: string | null;
  fundMarketValueFilled: boolean;
  overspend: string; // 逐月超出消费定额的部分之和，不与少花月份抵销
  prepaid: string; // 消费充值对账余额；累计消费起账模式不等同于真实消费资金结余
  carryover: string; // 资产口径累计结转；累计消费模式只计起账月之后
  incomeDiff: string; // 累计收入差额（截至 refMonth）
  interest: string; // 截至 refMonth 累计利息/其他（未解释残差）
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
        fundMarketValue: '0.00', fundPrepaid: '0.00', fundTotal: '0.00',
        fundNetInvestment: null, fundCumulativeNetInvestment: '0.00',
        fundNetInvestmentFilled: false, fundMissingNetInvestmentMonths: [],
        fundFlowBaselineMonth: null, fundMarketValueFilled: false,
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
    const fundPrepaid = toCents(fund.prepaid);
    const fundTotal = fundMarketValue + fundPrepaid;

    // 消费侧累计量。保留历史消费模式下定额/充值/超支覆盖完整历史，
    // 资产口径结转只计起账月之后，之前的资金流已包含在手填期初中。
    const { carryover, overspendPos } = await consumptionBudgetService.reconcileTotals(ref);
    const moved = await savingsEntryService.cumExcessUpTo(ref); // 累计额外充值
    const overspend = overspendPos; // 消费超支：逐月真正超过预算的部分（没花就是 0）
    // 保持既有对账口径：正常未花预算不计入预充暂存。
    const prepaid = moved - overspend - carryover;
    const incomeDiff = cumActualIncome - cumExpectedIncome;

    const fundOpeningAdjustment = start?.manualOpening
      ? -start.openingFundMarketValue
      : start?.openingFundPrepaid ?? 0;
    const budgetTotal = savingsExpected + fundOpeningAdjustment
      - toCents(fund.cumulativeNetInvestment) + fundMarketValue;
    const actualTotal = savingsActual + fundTotal;
    const diff = actualTotal - budgetTotal;
    // 差额 = 收入差额 + 利息 − 消费超支 − 预充暂存。
    // 旧口径独立预充只进实际；手工期初已经含全部基金资产，先抵销期初市值，
    // 再用当前市值替换。净投入扣减预算现金，现金及市值不能再次全额加期初。
    // 净投入未填只能按已知值计算并提示不完整，不能把真实残差归零。
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
      fundPrepaid: fromCents(fundPrepaid),
      fundTotal: fromCents(fundTotal),
      fundNetInvestment: fund.netInvestment,
      fundCumulativeNetInvestment: fund.cumulativeNetInvestment,
      fundNetInvestmentFilled: fund.missingNetInvestmentMonths.length === 0
        && !(start?.manualOpening && !start.fundOpeningConfirmed),
      fundMissingNetInvestmentMonths: start?.manualOpening && !start.fundOpeningConfirmed
        ? [start.startDate.slice(0, 7)] : fund.missingNetInvestmentMonths,
      fundFlowBaselineMonth: fund.flowBaselineMonth,
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
      const complete = current.savingsFilled && current.fundNetInvestmentFilled;
      return {
        ...current,
        interestChange: {
          previousMonth,
          previousInterest: '0.00',
          amount: complete ? current.interest : null,
          unavailableReason: complete ? null : '新账储蓄余额、基金开账基准或净投入未填写完整。',
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
      if (!result.fundNetInvestmentFilled) {
        missing.push(
          `${result.refMonth} 对账的基金净投入未确认：${result.fundMissingNetInvestmentMonths.join('、')}`,
        );
      }
      for (const source of result.savingsBalanceSources) {
        if (source.month && source.month !== result.refMonth) {
          warnings.push(`${result.refMonth} 的${source.cardName}余额沿用自 ${source.month}。`);
        }
      }
      if (result.fundSourceMonth && result.fundSourceMonth !== result.refMonth) {
        warnings.push(`${result.refMonth} 的基金账户余额沿用自 ${result.fundSourceMonth}。`);
      }
    }
    if (current.fundFlowBaselineMonth !== previous.fundFlowBaselineMonth) {
      warnings.push('本月基金净投入累计起点发生变化，新增差额包含对账口径变化，不代表当月利息。');
    }
    const previousComplete = previous.savingsFilled && previous.fundNetInvestmentFilled;
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
