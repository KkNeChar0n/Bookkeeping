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
export interface BudgetDetailRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  label: string;
  kind: 'IN' | 'OUT' | 'EXPENSE';
  amount: number; // cents（正数）
  createdAt: number;
}

// 每月真实储蓄额（储蓄卡·每月1号一个数）
export interface SavingsActualRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number; // cents
  updatedAt: number;
}

// 消费卡每月额度
export interface SpendQuotaRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number; // cents
  updatedAt: number;
}

export class BookkeepingDB extends Dexie {
  cards!: Table<CardRow, string>;
  budgetSnapshots!: Table<BudgetSnapshotRow, string>;
  budgetLines!: Table<BudgetLineRow, string>;
  transactions!: Table<TransactionRow, string>;
  budgetDetails!: Table<BudgetDetailRow, string>;
  savingsActuals!: Table<SavingsActualRow, string>;
  spendQuotas!: Table<SpendQuotaRow, string>;

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
  }
}

export const db = new BookkeepingDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowTs(): number {
  return Date.now();
}
