import {
  db,
  type BudgetDetailRow,
  type BudgetLineRow,
  type BudgetSnapshotRow,
  type CardRow,
  type CategoryRow,
  type ConsumptionBudgetRow,
  type SavingsActualRow,
  type SavingsEntryRow,
  type SavingsLogRow,
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
  categories?: CategoryRow[];
  savingsEntries?: SavingsEntryRow[];
  savingsLogs?: SavingsLogRow[];
  consumptionBudgets?: ConsumptionBudgetRow[];
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
      categories,
    ] = await Promise.all([
      db.cards.toArray(),
      db.budgetSnapshots.toArray(),
      db.budgetLines.toArray(),
      db.transactions.toArray(),
      db.budgetDetails.toArray(),
      db.savingsActuals.toArray(),
      db.spendQuotas.toArray(),
      db.categories.toArray(),
    ]);
    const savingsEntries = await db.savingsEntries.toArray();
    const savingsLogs = await db.savingsLogs.toArray();
    const consumptionBudgets = await db.consumptionBudgets.toArray();
    return {
      app: 'bookkeeping',
      version: 3,
      exportedAt: new Date().toISOString(),
      cards,
      budgetSnapshots,
      budgetLines,
      transactions,
      budgetDetails,
      savingsActuals,
      spendQuotas,
      categories,
      savingsEntries,
      savingsLogs,
      consumptionBudgets,
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
        db.categories,
        db.savingsEntries,
        db.savingsLogs,
        db.consumptionBudgets,
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
          db.categories.clear(),
          db.savingsEntries.clear(),
          db.savingsLogs.clear(),
          db.consumptionBudgets.clear(),
        ]);
        await db.cards.bulkAdd(data.cards);
        await db.budgetSnapshots.bulkAdd(data.budgetSnapshots ?? []);
        await db.budgetLines.bulkAdd(data.budgetLines ?? []);
        await db.transactions.bulkAdd(data.transactions ?? []);
        await db.budgetDetails.bulkAdd(data.budgetDetails ?? []);
        await db.savingsActuals.bulkAdd(data.savingsActuals ?? []);
        await db.spendQuotas.bulkAdd(data.spendQuotas ?? []);
        await db.categories.bulkAdd(data.categories ?? []);
        await db.savingsEntries.bulkAdd(data.savingsEntries ?? []);
        await db.savingsLogs.bulkAdd(data.savingsLogs ?? []);
        await db.consumptionBudgets.bulkAdd(data.consumptionBudgets ?? []);
      },
    );
    return { cards: data.cards.length, transactions: (data.transactions ?? []).length };
  },

  async importFromFile(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as BackupData;
    return this.importAll(data);
  },

  /** 清空全部数据，但保留基金卡及其本金/市值（收支类型也保留） */
  async clearAllExceptFund(): Promise<void> {
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
        db.savingsEntries,
        db.savingsLogs,
        db.consumptionBudgets,
      ],
      async () => {
        const nonFund = (await db.cards.toArray())
          .filter((c) => c.type !== 'FUND')
          .map((c) => c.id);
        await Promise.all([
          db.cards.bulkDelete(nonFund),
          db.budgetSnapshots.clear(),
          db.budgetLines.clear(),
          db.transactions.clear(),
          db.budgetDetails.clear(),
          db.savingsActuals.clear(),
          db.spendQuotas.clear(),
          db.savingsEntries.clear(),
          db.savingsLogs.clear(),
          db.consumptionBudgets.clear(),
        ]);
      },
    );
  },
};
