import Dexie, { type Table } from 'dexie';
import type { TxType } from '../domain/balance';

// 本地存储实体：金额一律以“分”(整数)存储
export interface CardRow {
  id: string;
  name: string;
  initialBalance: number; // cents
  isDefault: number; // 0/1（Dexie 索引友好）
  sortOrder: number;
  createdAt: number;
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

export class BookkeepingDB extends Dexie {
  cards!: Table<CardRow, string>;
  budgetSnapshots!: Table<BudgetSnapshotRow, string>;
  budgetLines!: Table<BudgetLineRow, string>;
  transactions!: Table<TransactionRow, string>;

  constructor() {
    super('bookkeeping');
    this.version(1).stores({
      cards: 'id, sortOrder, isDefault',
      budgetSnapshots: 'id, &date',
      budgetLines: 'id, &[snapshotId+cardId], snapshotId, cardId',
      transactions: 'id, cardId, date, type, transferGroupId, [cardId+date]',
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
