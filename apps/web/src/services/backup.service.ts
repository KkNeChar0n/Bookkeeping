import { db, type BudgetLineRow, type BudgetSnapshotRow, type CardRow, type TransactionRow } from '../db/db';

export interface BackupData {
  app: 'bookkeeping';
  version: 1;
  exportedAt: string;
  cards: CardRow[];
  budgetSnapshots: BudgetSnapshotRow[];
  budgetLines: BudgetLineRow[];
  transactions: TransactionRow[];
}

export const backupService = {
  /** 导出全部数据为 JSON 对象 */
  async exportAll(): Promise<BackupData> {
    const [cards, budgetSnapshots, budgetLines, transactions] = await Promise.all([
      db.cards.toArray(),
      db.budgetSnapshots.toArray(),
      db.budgetLines.toArray(),
      db.transactions.toArray(),
    ]);
    return {
      app: 'bookkeeping',
      version: 1,
      exportedAt: new Date().toISOString(),
      cards,
      budgetSnapshots,
      budgetLines,
      transactions,
    };
  },

  /** 触发浏览器下载备份文件（iOS 会弹出“存储到文件”） */
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

  /** 从备份对象整库覆盖导入（清空后写入） */
  async importAll(data: BackupData): Promise<{ cards: number; snapshots: number; lines: number; transactions: number }> {
    if (data?.app !== 'bookkeeping' || !Array.isArray(data.cards)) {
      throw new Error('文件格式不正确，不是记账备份');
    }
    await db.transaction(
      'rw',
      db.cards,
      db.budgetSnapshots,
      db.budgetLines,
      db.transactions,
      async () => {
        await Promise.all([
          db.transactions.clear(),
          db.budgetLines.clear(),
          db.budgetSnapshots.clear(),
          db.cards.clear(),
        ]);
        await db.cards.bulkAdd(data.cards);
        await db.budgetSnapshots.bulkAdd(data.budgetSnapshots ?? []);
        await db.budgetLines.bulkAdd(data.budgetLines ?? []);
        await db.transactions.bulkAdd(data.transactions ?? []);
      },
    );
    return {
      cards: data.cards.length,
      snapshots: (data.budgetSnapshots ?? []).length,
      lines: (data.budgetLines ?? []).length,
      transactions: (data.transactions ?? []).length,
    };
  },

  /** 从上传的 File 解析并导入 */
  async importFromFile(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as BackupData;
    return this.importAll(data);
  },
};
