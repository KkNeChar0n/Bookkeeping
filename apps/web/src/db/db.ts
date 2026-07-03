import Dexie, { type Table } from 'dexie';
import type { TxType } from '../domain/balance';

// 卡类型：储蓄卡 / 消费卡 / 基金
export type CardType = 'SAVINGS' | 'SPEND' | 'FUND';

// 本地存储实体：金额一律以“分”(整数)存储
export interface CardRow {
  id: string;
  name: string;
  type: CardType;
  initialBalance: number; // cents（储蓄卡用作预算基数）
  isDefault: number; // 0/1（Dexie 索引友好）
  sortOrder: number;
  createdAt: number;
  // 基金专用：直接填的两个数（分）
  fundPrincipal?: number; // 累计投入本金
  fundValue?: number; // 当前市值
}

export interface BudgetSnapshotRow {
  id: string;
  date: string; // YYYY-MM-DD
  note: string | null;
  createdAt: number;
}

export interface BudgetLineRow {
  id: string;
  snapshotId: string;
  cardId: string;
  inAmount: number; // cents
  outAmount: number; // cents
}

export interface TransactionRow {
  id: string;
  cardId: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  amount: number; // cents, signed
  category: string | null;
  note: string | null;
  peerCardId: string | null;
  transferGroupId: string | null;
  createdAt: number;
}

// 预算细节（储蓄卡·按月）：计划收入 / 调出 / 支出
// IN=收入(+)  OUT=调出(−, 钱去别处仍是资产)  EXPENSE=支出(−, 钱花掉消失, 不进储蓄-预算统计)
// IN=收入(+)  TRANSFER_IN=调入(+)  OUT=调出(−)  EXPENSE=支出(−,花掉消失)
export interface BudgetDetailRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  label: string; // 备注
  category?: string; // 收支类型（收入/支出用）
  kind: 'IN' | 'OUT' | 'EXPENSE' | 'TRANSFER_IN';
  peerCardId?: string; // 调出/调入 的对手储蓄卡
  amount: number; // cents（正数）
  createdAt: number;
}

// 每月真实储蓄额（储蓄卡·每月1号一个数）
export interface SavingsActualRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number; // cents（真实储蓄余额）
  income?: number; // cents（旧版单条收入，已迁移到 savingsEntries）
  updatedAt: number;
}

// 储蓄卡按月的多笔条目：收入 / 超额支出（充给消费卡的额外钱）
export interface SavingsEntryRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  kind: 'INCOME' | 'EXCESS';
  amount: number; // cents
  note?: string;
  createdAt: number;
}

// 储蓄卡修改流水（审计日志）：每次把某项改成某值都留一条，带时间戳
export interface SavingsLogRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  field: 'AMOUNT' | 'INCOME' | 'EXCESS';
  amount: number; // cents（改成的新值）
  createdAt: number; // 时间戳
}

// 消费卡每月额度（旧：直接在消费卡上填。新流程改由 consumptionBudgets 供给）
export interface SpendQuotaRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number; // cents
  updatedAt: number;
}

// 本月消费预算：在某张储蓄卡的编辑里，给某张消费卡拨的预算（=该消费卡当月额度来源）
// 绑定到具体储蓄卡，新转账才对得上那张卡的余额削减
export interface ConsumptionBudgetRow {
  id: string;
  savingsCardId: string; // 出资的储蓄卡
  consumptionCardId: string; // 供给的消费卡
  month: string; // YYYY-MM
  amount: number; // cents（本月消费预算）
  updatedAt: number;
}

// 收支类型（可编辑）
export interface CategoryRow {
  id: string;
  kind: 'income' | 'expense';
  name: string;
  sortOrder: number;
  createdAt: number;
}

export class BookkeepingDB extends Dexie {
  cards!: Table<CardRow, string>;
  budgetSnapshots!: Table<BudgetSnapshotRow, string>;
  budgetLines!: Table<BudgetLineRow, string>;
  transactions!: Table<TransactionRow, string>;
  budgetDetails!: Table<BudgetDetailRow, string>;
  savingsActuals!: Table<SavingsActualRow, string>;
  spendQuotas!: Table<SpendQuotaRow, string>;
  categories!: Table<CategoryRow, string>;
  savingsEntries!: Table<SavingsEntryRow, string>;
  savingsLogs!: Table<SavingsLogRow, string>;
  consumptionBudgets!: Table<ConsumptionBudgetRow, string>;

  constructor() {
    super('bookkeeping');
    this.version(1).stores({
      cards: 'id, sortOrder, isDefault',
      budgetSnapshots: 'id, &date',
      budgetLines: 'id, &[snapshotId+cardId], snapshotId, cardId',
      transactions: 'id, cardId, date, type, transferGroupId, [cardId+date]',
    });
    // v2：卡片新增 type 字段，旧数据默认按储蓄卡处理
    this.version(2)
      .stores({ cards: 'id, sortOrder, isDefault, type' })
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .toCollection()
          .modify((c: CardRow) => {
            if (!c.type) c.type = 'SAVINGS';
          });
      });
    // v3：储蓄卡按月预算细节 + 每月真实储蓄额
    this.version(3).stores({
      budgetDetails: 'id, cardId, [cardId+month]',
      savingsActuals: 'id, &[cardId+month], cardId',
    });
    // v4：消费卡每月额度
    this.version(4).stores({
      spendQuotas: 'id, &[cardId+month], cardId',
    });
    // v5：可编辑收支类型
    this.version(5).stores({
      categories: 'id, kind',
    });
    // v6：储蓄卡多笔收入/超额支出；把旧的单条 income 迁移过来
    this.version(6)
      .stores({ savingsEntries: 'id, cardId, [cardId+month], kind' })
      .upgrade(async (tx) => {
        const rows = (await tx.table('savingsActuals').toArray()) as SavingsActualRow[];
        const entries: SavingsEntryRow[] = [];
        for (const r of rows) {
          if (r.income && r.income > 0) {
            entries.push({
              id: crypto.randomUUID(),
              cardId: r.cardId,
              month: r.month,
              kind: 'INCOME',
              amount: r.income,
              createdAt: r.updatedAt,
            });
          }
        }
        if (entries.length) await tx.table('savingsEntries').bulkAdd(entries);
      });
    // v7：储蓄卡修改流水（审计日志）
    this.version(7).stores({
      savingsLogs: 'id, cardId, [cardId+month], createdAt',
    });
    // v8：本月消费预算（储蓄卡→消费卡）。把旧的 spendQuotas 迁移过来，出资卡默认取默认储蓄卡
    this.version(8)
      .stores({
        consumptionBudgets:
          'id, &[savingsCardId+consumptionCardId+month], [savingsCardId+month], [consumptionCardId+month], month',
      })
      .upgrade(async (tx) => {
        const cards = (await tx.table('cards').toArray()) as CardRow[];
        const savings = cards.filter((c) => c.type === 'SAVINGS');
        const funder =
          savings.find((c) => c.isDefault) ??
          savings.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)[0];
        if (!funder) return;
        const quotas = (await tx.table('spendQuotas').toArray()) as SpendQuotaRow[];
        const rows: ConsumptionBudgetRow[] = quotas.map((q) => ({
          id: crypto.randomUUID(),
          savingsCardId: funder.id,
          consumptionCardId: q.cardId,
          month: q.month,
          amount: q.amount,
          updatedAt: q.updatedAt,
        }));
        if (rows.length) await tx.table('consumptionBudgets').bulkAdd(rows);
      });
  }
}

export const db = new BookkeepingDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowTs(): number {
  return Date.now();
}
