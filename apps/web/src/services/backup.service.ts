import {
  db,
  type BudgetDetailRow,
  type BudgetLineRow,
  type BudgetSnapshotRow,
  type CardRow,
  type SavingsActualRow,
  type SpendQuotaRow,
  type TransactionRow,
} from '../db/db';

export interface BackupData {
  app: 'bookkeeping';
  version: number;
  exportedAt: string;
  cards: CardRow[];
  budgetSnapshots: BudgetSnapshotRow[];
  budgetLines: BudgetLineRow[];
  transactions: TransactionRow[];
  budgetDetails?: BudgetDetailRow[];
  savingsActuals?: SavingsActualRow[];
  spendQuotas?: SpendQuotaRow[];
}

export const backupService = {
  async exportAll(): Promise<BackupData> {
    const [
      cards,
      budgetSnapshots,
      budgetLines,
      transactions,
      budgetDetails,
      savingsActuals,
      spendQuotas,
    ] = await Promise.all([
      db.cards.toArray(),
      db.budgetSnapshots.toArray(),
      db.budgetLines.toArray(),
      db.transactions.toArray(),
      db.budgetDetails.toArray(),
      db.savingsActuals.toArray(),
      db.spendQuotas.toArray(),
    ]);
    return {
      app: 'bookkeeping',
      version: 2,
      exportedAt: new Date().toISOString(),
      cards,
      budgetSnapshots,
      budgetLines,
      transactions,
      budgetDetails,
      savingsActuals,
      spendQuotas,
    };
  },

  async downloadBackup(): Promise<void> {
    const data = await this.exportAll();
    const stamp = data.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `记账备份-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async importAll(data: BackupData): Promise<{ cards: number; transactions: number }> {
    if (data?.app !== 'bookkeeping' || !Array.isArray(data.cards)) {
      throw new Error('文件格式不正确，不是记账备份');
    }
    await db.transaction(
      'rw',
      [
        db.cards,
        db.budgetSnapshots,
        db.budgetLines,
        db.transactions,
        db.budgetDetails,
        db.savingsActuals,
        db.spendQuotas,
      ],
      async () => {
        await Promise.all([
          db.transactions.clear(),
          db.budgetLines.clear(),
          db.budgetSnapshots.clear(),
          db.cards.clear(),
          db.budgetDetails.clear(),
          db.savingsActuals.clear(),
          db.spendQuotas.clear(),
        ]);
        await db.cards.bulkAdd(data.cards);
        await db.budgetSnapshots.bulkAdd(data.budgetSnapshots ?? []);
        await db.budgetLines.bulkAdd(data.budgetLines ?? []);
        await db.transactions.bulkAdd(data.transactions ?? []);
        await db.budgetDetails.bulkAdd(data.budgetDetails ?? []);
        await db.savingsActuals.bulkAdd(data.savingsActuals ?? []);
        await db.spendQuotas.bulkAdd(data.spendQuotas ?? []);
      },
    );
    return { cards: data.cards.length, transactions: (data.transactions ?? []).length };
  },

  async importFromFile(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as BackupData;
    return this.importAll(data);
  },
};
