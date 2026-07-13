import { db, newId, nowTs, type ConsumptionBudgetRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const idx = y * 12 + (mo - 1) - 1;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

// 按月汇总：本月消费预算 / 超额支出 / 已花（消费卡）
async function monthlyTotals(upTo: string) {
  const [budgets, excess, txs, cards] = await Promise.all([
    db.consumptionBudgets.toArray(),
    db.savingsEntries.where('kind').equals('EXCESS').toArray(),
    db.transactions.toArray(),
    db.cards.toArray(),
  ]);
  const spendIds = new Set(cards.filter((c) => c.type === 'SPEND').map((c) => c.id));
  const budgetByM = new Map<string, Cents>();
  for (const b of budgets)
    if (b.month <= upTo) budgetByM.set(b.month, (budgetByM.get(b.month) ?? 0) + b.amount);
  const excessByM = new Map<string, Cents>();
  for (const e of excess)
    if (e.month <= upTo) excessByM.set(e.month, (excessByM.get(e.month) ?? 0) + e.amount);
  const spentByM = new Map<string, Cents>();
  for (const t of txs) {
    if (t.type !== 'OUT' || !spendIds.has(t.cardId)) continue;
    const m = t.date.slice(0, 7);
    if (m > upTo) continue;
    spentByM.set(m, (spentByM.get(m) ?? 0) + -t.amount);
  }
  const months = [
    ...new Set([...budgetByM.keys(), ...excessByM.keys(), ...spentByM.keys()]),
  ].sort();
  return { months, budgetByM, excessByM, spentByM };
}

// 按月正序递推：结转(m)=min(上月末暂存, 本月预算)，暂存(m)=上月暂存+预算+超额−已花−结转
async function series(upTo: string) {
  const { months, budgetByM, excessByM, spentByM } = await monthlyTotals(upTo);
  let buffer = 0;
  let carryoverTotal = 0;
  let totalBudget = 0;
  let totalSpent = 0;
  let overspendPos = 0; // Σ逐月 max(0, 已花 − 消费预算)：真正超过预算的部分
  const bufferStart = new Map<string, Cents>();
  for (const m of months) {
    bufferStart.set(m, buffer);
    const budget = budgetByM.get(m) ?? 0;
    const spent = spentByM.get(m) ?? 0;
    const carry = Math.max(0, Math.min(buffer, budget));
    carryoverTotal += carry;
    totalBudget += budget;
    totalSpent += spent;
    overspendPos += Math.max(0, spent - budget);
    buffer = buffer + budget + (excessByM.get(m) ?? 0) - spent - carry;
  }
  return { bufferEnd: buffer, carryoverTotal, totalBudget, totalSpent, overspendPos, bufferStart };
}

export interface CBudgetDTO {
  consumptionCardId: string;
  consumptionCardName: string;
  amount: string;
}

export const consumptionBudgetService = {
  /** 某储蓄卡某月给各消费卡填的预算（消费卡全列出，没填的为空） */
  async list(savingsCardId: string, month: string): Promise<CBudgetDTO[]> {
    const [cards, rows] = await Promise.all([
      db.cards.toArray(),
      db.consumptionBudgets.where('[savingsCardId+month]').equals([savingsCardId, month]).toArray(),
    ]);
    const byCard = new Map(rows.map((r) => [r.consumptionCardId, r.amount]));
    return cards
      .filter((c) => c.type === 'SPEND')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map((c) => ({
        consumptionCardId: c.id,
        consumptionCardName: c.name,
        amount: byCard.has(c.id) ? fromCents(byCard.get(c.id)!) : '',
      }));
  },

  /** 覆盖式设置（金额≤0 则删除该条） */
  async setBudget(input: {
    savingsCardId: string;
    consumptionCardId: string;
    month: string;
    amount: string;
  }): Promise<void> {
    const amt = toCents(input.amount || '0');
    const existing = await db.consumptionBudgets
      .where('[savingsCardId+consumptionCardId+month]')
      .equals([input.savingsCardId, input.consumptionCardId, input.month])
      .first();
    if (amt <= 0) {
      if (existing) await db.consumptionBudgets.delete(existing.id);
      return;
    }
    if (existing) {
      await db.consumptionBudgets.update(existing.id, { amount: amt, updatedAt: nowTs() });
    } else {
      const row: ConsumptionBudgetRow = {
        id: newId(),
        savingsCardId: input.savingsCardId,
        consumptionCardId: input.consumptionCardId,
        month: input.month,
        amount: amt,
        updatedAt: nowTs(),
      };
      await db.consumptionBudgets.add(row);
    }
  },

  /** 某消费卡某月的额度 = 各储蓄卡给它的预算之和 */
  async quotaFor(consumptionCardId: string, month: string): Promise<Cents> {
    const rows = await db.consumptionBudgets
      .where('[consumptionCardId+month]')
      .equals([consumptionCardId, month])
      .toArray();
    return rows.reduce((s, r) => s + r.amount, 0);
  },

  /**
   * 某周期(prefix)内各消费卡各月分得的「超额支出」。
   * 超额支出记在储蓄卡上（额外充给消费卡的钱），按该储蓄卡当月对各消费卡的预算占比分摊，
   * 键为 `consumptionCardId|month`。
   */
  async excessMap(prefix: string): Promise<Map<string, Cents>> {
    const [budgets, excessRows] = await Promise.all([
      db.consumptionBudgets.toArray(),
      db.savingsEntries.where('kind').equals('EXCESS').toArray(),
    ]);
    // 储蓄卡当月超额支出、当月预算总额
    const exBySavM = new Map<string, Cents>();
    for (const e of excessRows)
      if (e.month.startsWith(prefix))
        exBySavM.set(`${e.cardId}|${e.month}`, (exBySavM.get(`${e.cardId}|${e.month}`) ?? 0) + e.amount);
    const totBySavM = new Map<string, Cents>();
    for (const b of budgets)
      if (b.month.startsWith(prefix))
        totBySavM.set(`${b.savingsCardId}|${b.month}`, (totBySavM.get(`${b.savingsCardId}|${b.month}`) ?? 0) + b.amount);
    const out = new Map<string, Cents>();
    for (const b of budgets) {
      if (!b.month.startsWith(prefix)) continue;
      const ex = exBySavM.get(`${b.savingsCardId}|${b.month}`) ?? 0;
      const tot = totBySavM.get(`${b.savingsCardId}|${b.month}`) ?? 0;
      if (ex <= 0 || tot <= 0) continue;
      const share = Math.round((ex * b.amount) / tot);
      const k = `${b.consumptionCardId}|${b.month}`;
      out.set(k, (out.get(k) ?? 0) + share);
    }
    return out;
  },

  /** 某消费卡某月分得的超额支出 */
  async excessFor(consumptionCardId: string, month: string): Promise<Cents> {
    const m = await this.excessMap(month);
    return m.get(`${consumptionCardId}|${month}`) ?? 0;
  },

  /** 进入某月编辑时，可用于结转的期初暂存（=上月末暂存），元 */
  async bufferBefore(month: string): Promise<string> {
    const s = await series(prevMonth(month));
    return fromCents(Math.max(0, s.bufferEnd));
  },

  /** 对账所需的累计量（截至 ref） */
  async reconcileTotals(refMonth: string): Promise<{
    totalBudget: Cents;
    totalSpent: Cents;
    carryover: Cents;
    overspendPos: Cents;
    buffer: Cents;
  }> {
    const s = await series(refMonth);
    return {
      totalBudget: s.totalBudget,
      totalSpent: s.totalSpent,
      carryover: s.carryoverTotal,
      overspendPos: s.overspendPos,
      buffer: s.bufferEnd,
    };
  },
};
