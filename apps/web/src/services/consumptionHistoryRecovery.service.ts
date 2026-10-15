import { db, newId, nowTs, type ConsumptionBudgetRow, type SavingsEntryRow } from '../db/db';
import { fromCents } from '../domain/money';
import { isValidMonth } from '../domain/fundSavings';

export interface ConsumptionHistoryPreview {
  exportedAt: string;
  throughMonth: string;
  months: { month: string; budget: string; excess: string }[];
  totalBudget: string;
  totalExcess: string;
  budgetRows: number;
  excessRows: number;
  skippedExisting: number;
  skippedFuture: number;
}

type Funding = { cardId: string; month: string; amount: number };
type RecoveryPlan = {
  preview: ConsumptionHistoryPreview;
  budgets: Funding[];
  excess: Funding[];
};
type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('消费资金备份格式不正确');
  }
  return value as RecordValue;
}

function sum(a: number, b: number): number {
  const value = a + b;
  if (!Number.isSafeInteger(value)) throw new Error('消费资金金额超出安全范围');
  return value;
}

/** Read only the consumption funding portion. No old asset or transaction is imported. */
async function buildPlan(input: unknown): Promise<RecoveryPlan> {
  const data = record(input);
  if (
    data.app !== 'bookkeeping' || !Array.isArray(data.cards) ||
    typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)) ||
    (data.consumptionBudgets !== undefined && !Array.isArray(data.consumptionBudgets)) ||
    (data.savingsEntries !== undefined && !Array.isArray(data.savingsEntries)) ||
    (data.spendQuotas !== undefined && !Array.isArray(data.spendQuotas))
  ) throw new Error('请选择清账前的完整记账备份文件');

  const [start, cards, currentBudgets, currentExcess] = await Promise.all([
    db.bookkeepingStart.get('active'),
    db.cards.toArray(),
    db.consumptionBudgets.toArray(),
    db.savingsEntries.where('kind').equals('EXCESS').toArray(),
  ]);
  if (!start?.manualOpening) throw new Error('仅手工重新起账的账本需要恢复历史消费资金');
  const throughMonth = start.startDate.slice(0, 7);
  const sourceCards = data.cards.map(record);
  const sourceById = new Map<string, RecordValue>();
  for (const card of sourceCards) {
    if (typeof card.id !== 'string' || !card.id || sourceById.has(card.id)) {
      throw new Error('备份中的卡片信息不正确');
    }
    sourceById.set(card.id, card);
  }
  const savings = cards.filter((card) => card.type === 'SAVINGS');
  const matchCard = (value: unknown): string => {
    if (typeof value !== 'string') throw new Error('消费资金缺少出资卡');
    const source = sourceById.get(value);
    if (!source || source.type !== 'SAVINGS') throw new Error('消费资金对应的储蓄卡不在备份中');
    const exact = savings.find((card) => card.id === value);
    if (exact) return exact.id;
    const sameName = savings.filter((card) => card.name === source.name);
    if (sameName.length !== 1) {
      throw new Error(`无法唯一匹配储蓄卡「${String(source.name ?? value)}」，未恢复任何数据`);
    }
    return sameName[0].id;
  };
  const budgets = new Map<string, Funding>();
  const excess = new Map<string, Funding>();
  const budgetMonths = new Set<string>();
  let skippedFuture = 0;
  const readRows = (
    rows: unknown[], target: Map<string, Funding>, cardField: string,
    selected: (row: RecordValue) => boolean = () => true,
  ) => {
    const seen = new Set<string>();
    for (const raw of rows) {
      const row = record(raw);
      if (!selected(row)) continue;
      if (
        typeof row.id !== 'string' || !row.id || seen.has(row.id) ||
        typeof row.month !== 'string' || !isValidMonth(row.month) || typeof row.amount !== 'number' ||
        !Number.isSafeInteger(row.amount) || row.amount < 0
      ) throw new Error('备份中的消费定额或超额充值损坏，未恢复任何数据');
      seen.add(row.id);
      if (row.month > throughMonth) { skippedFuture++; continue; }
      // Even an explicit modern zero suppresses the obsolete monthly quota fallback.
      if (target === budgets) budgetMonths.add(row.month);
      if (row.amount === 0) continue;
      const cardId = matchCard(row[cardField]);
      const key = `${cardId}|${row.month}`;
      const existing = target.get(key);
      target.set(key, { cardId, month: row.month, amount: sum(existing?.amount ?? 0, row.amount) });
    }
  };
  readRows(data.consumptionBudgets as unknown[] ?? [], budgets, 'savingsCardId');
  // Old single consumption-card quotas did not have a funding-card ID.
  const legacyFunder = sourceCards.find((card) => card.type === 'SAVINGS' && card.isDefault)
    ?? sourceCards.find((card) => card.type === 'SAVINGS');
  const quotas = (data.spendQuotas as unknown[] ?? []).map((value) => {
    const row = record(value);
    return { ...row, savingsCardId: legacyFunder?.id };
  });
  const suppliedBudgetMonths = new Set(budgetMonths);
  readRows(quotas, budgets, 'savingsCardId', (row) => !suppliedBudgetMonths.has(String(row.month)));
  readRows(data.savingsEntries as unknown[] ?? [], excess, 'cardId', (row) => row.kind === 'EXCESS');
  if (budgets.size === 0 && excess.size === 0) {
    throw new Error('该备份没有可恢复的历史消费定额或超额充值，请选择清账前的备份');
  }

  const existingBudgetKeys = new Set(currentBudgets.map((row) => `${row.savingsCardId}|${row.month}`));
  const existingExcessKeys = new Set(currentExcess.map((row) => `${row.cardId}|${row.month}`));
  const missingBudgets = [...budgets].filter(([key]) => !existingBudgetKeys.has(key)).map(([, row]) => row);
  const missingExcess = [...excess].filter(([key]) => !existingExcessKeys.has(key)).map(([, row]) => row);
  const months = new Map<string, { budget: number; excess: number }>();
  for (const [type, rows] of [['budget', budgets], ['excess', excess]] as const) {
    for (const row of rows.values()) {
      const total = months.get(row.month) ?? { budget: 0, excess: 0 };
      total[type] = sum(total[type], row.amount);
      months.set(row.month, total);
    }
  }
  const total = (rows: Map<string, Funding>) => [...rows.values()].reduce((value, row) => sum(value, row.amount), 0);
  return {
    budgets: missingBudgets,
    excess: missingExcess,
    preview: {
      exportedAt: data.exportedAt,
      throughMonth,
      months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({
        month, budget: fromCents(values.budget), excess: fromCents(values.excess),
      })),
      totalBudget: fromCents(total(budgets)),
      totalExcess: fromCents(total(excess)),
      budgetRows: missingBudgets.length,
      excessRows: missingExcess.length,
      skippedExisting: budgets.size + excess.size - missingBudgets.length - missingExcess.length,
      skippedFuture,
    },
  };
}

export const consumptionHistoryRecoveryService = {
  async preview(input: unknown): Promise<ConsumptionHistoryPreview> {
    return (await buildPlan(input)).preview;
  },

  async restore(input: unknown): Promise<ConsumptionHistoryPreview> {
    return db.transaction('rw', [db.bookkeepingStart, db.cards, db.consumptionBudgets, db.savingsEntries], async () => {
      // Rebuild under the transaction: data entered after preview must remain untouched.
      const plan = await buildPlan(input);
      const timestamp = nowTs();
      const budgets: ConsumptionBudgetRow[] = plan.budgets.map((row) => ({
        id: newId(), savingsCardId: row.cardId, month: row.month, amount: row.amount, updatedAt: timestamp,
      }));
      const excess: SavingsEntryRow[] = plan.excess.map((row) => ({
        id: newId(), ...row, kind: 'EXCESS', createdAt: timestamp,
      }));
      await db.consumptionBudgets.bulkAdd(budgets);
      await db.savingsEntries.bulkAdd(excess);
      await db.bookkeepingStart.update('active', { consumptionHistory: true });
      return plan.preview;
    });
  },
};
