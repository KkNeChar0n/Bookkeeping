import {
  db,
  type BudgetDetailRow,
  type BudgetLineRow,
  type BudgetSnapshotRow,
  type CardRow,
  type CategoryRow,
  type ConsumptionBudgetRow,
  type InitialBalanceLogRow,
  type SavingsActualRow,
  type SavingsEntryRow,
  type SavingsLogRow,
  type SpendQuotaRow,
  type TransactionRow,
} from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID, VIRTUAL_CONSUMPTION_CARD_NAME } from '../domain/consumption';

type LegacyConsumptionBudgetRow = ConsumptionBudgetRow & { consumptionCardId?: string };

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
  initialBalanceLogs?: InitialBalanceLogRow[];
  consumptionBudgets?: LegacyConsumptionBudgetRow[];
}

export interface NormalizedBackupData extends Omit<
  BackupData,
  'consumptionBudgets' | 'spendQuotas'
> {
  consumptionBudgets: ConsumptionBudgetRow[];
}

function virtualCard(): CardRow {
  return {
    id: VIRTUAL_CONSUMPTION_CARD_ID,
    name: VIRTUAL_CONSUMPTION_CARD_NAME,
    type: 'SPEND',
    initialBalance: 0,
    isDefault: 0,
    sortOrder: -1,
    createdAt: 0,
  };
}

/** Normalize v1-v3 backups before writing them into the already-upgraded v9 database. */
export function normalizeBackupData(data: BackupData): NormalizedBackupData {
  const oldSpendIds = new Set(
    data.cards.filter((card) => card.type === 'SPEND').map((card) => card.id),
  );
  const savings = data.cards
    .filter((card) => card.type === 'SAVINGS')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  const funder = savings.find((card) => card.isDefault) ?? savings[0];
  const aggregated = new Map<string, ConsumptionBudgetRow>();
  const monthsWithBudget = new Set<string>();

  for (const row of data.consumptionBudgets ?? []) {
    monthsWithBudget.add(row.month);
    const key = `${row.savingsCardId}|${row.month}`;
    const found = aggregated.get(key);
    if (found) {
      found.amount += row.amount;
      found.updatedAt = Math.max(found.updatedAt, row.updatedAt);
    } else {
      aggregated.set(key, {
        id: row.id,
        savingsCardId: row.savingsCardId,
        month: row.month,
        amount: row.amount,
        updatedAt: row.updatedAt,
      });
    }
  }

  if (funder) {
    const fallbackByMonth = new Map<string, { amount: number; updatedAt: number }>();
    for (const row of data.spendQuotas ?? []) {
      if (monthsWithBudget.has(row.month)) continue;
      const found = fallbackByMonth.get(row.month) ?? { amount: 0, updatedAt: 0 };
      found.amount += row.amount;
      found.updatedAt = Math.max(found.updatedAt, row.updatedAt);
      fallbackByMonth.set(row.month, found);
    }
    for (const [month, value] of fallbackByMonth) {
      aggregated.set(`${funder.id}|${month}`, {
        id: crypto.randomUUID(),
        savingsCardId: funder.id,
        month,
        amount: value.amount,
        updatedAt: value.updatedAt,
      });
    }
  }

  return {
    app: 'bookkeeping',
    version: 5,
    exportedAt: data.exportedAt,
    cards: [...data.cards.filter((card) => card.type !== 'SPEND'), virtualCard()],
    budgetSnapshots: data.budgetSnapshots ?? [],
    budgetLines: data.budgetLines ?? [],
    transactions: (data.transactions ?? []).map((row) =>
      oldSpendIds.has(row.cardId) && row.cardId !== VIRTUAL_CONSUMPTION_CARD_ID
        ? { ...row, cardId: VIRTUAL_CONSUMPTION_CARD_ID }
        : row,
    ),
    budgetDetails: data.budgetDetails ?? [],
    savingsActuals: data.savingsActuals ?? [],
    categories: data.categories ?? [],
    savingsEntries: data.savingsEntries ?? [],
    savingsLogs: data.savingsLogs ?? [],
    initialBalanceLogs: data.initialBalanceLogs ?? [],
    consumptionBudgets: [...aggregated.values()],
  };
}

export const backupService = {
  async exportAll(): Promise<NormalizedBackupData> {
    const [
      cards,
      budgetSnapshots,
      budgetLines,
      transactions,
      budgetDetails,
      savingsActuals,
      categories,
      savingsEntries,
      savingsLogs,
      initialBalanceLogs,
      consumptionBudgets,
    ] = await Promise.all([
      db.cards.toArray(),
      db.budgetSnapshots.toArray(),
      db.budgetLines.toArray(),
      db.transactions.toArray(),
      db.budgetDetails.toArray(),
      db.savingsActuals.toArray(),
      db.categories.toArray(),
      db.savingsEntries.toArray(),
      db.savingsLogs.toArray(),
      db.initialBalanceLogs.toArray(),
      db.consumptionBudgets.toArray(),
    ]);
    return {
      app: 'bookkeeping',
      version: 5,
      exportedAt: new Date().toISOString(),
      cards,
      budgetSnapshots,
      budgetLines,
      transactions,
      budgetDetails,
      savingsActuals,
      categories,
      savingsEntries,
      savingsLogs,
      initialBalanceLogs,
      consumptionBudgets,
    };
  },

  async downloadBackup(): Promise<void> {
    const data = await this.exportAll();
    const stamp = data.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `记账备份-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  async importAll(input: BackupData): Promise<{ cards: number; transactions: number }> {
    if (input?.app !== 'bookkeeping' || !Array.isArray(input.cards)) {
      throw new Error('文件格式不正确，不是记账备份');
    }
    const data = normalizeBackupData(input);
    await db.transaction(
      'rw',
      [
        db.cards,
        db.budgetSnapshots,
        db.budgetLines,
        db.transactions,
        db.budgetDetails,
        db.savingsActuals,
        db.categories,
        db.savingsEntries,
        db.savingsLogs,
        db.initialBalanceLogs,
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
          db.categories.clear(),
          db.savingsEntries.clear(),
          db.savingsLogs.clear(),
          db.initialBalanceLogs.clear(),
          db.consumptionBudgets.clear(),
        ]);
        await db.cards.bulkAdd(data.cards);
        await db.budgetSnapshots.bulkAdd(data.budgetSnapshots);
        await db.budgetLines.bulkAdd(data.budgetLines);
        await db.transactions.bulkAdd(data.transactions);
        await db.budgetDetails.bulkAdd(data.budgetDetails ?? []);
        await db.savingsActuals.bulkAdd(data.savingsActuals ?? []);
        await db.categories.bulkAdd(data.categories ?? []);
        await db.savingsEntries.bulkAdd(data.savingsEntries ?? []);
        await db.savingsLogs.bulkAdd(data.savingsLogs ?? []);
        await db.initialBalanceLogs.bulkAdd(data.initialBalanceLogs ?? []);
        await db.consumptionBudgets.bulkAdd(data.consumptionBudgets);
      },
    );
    return {
      cards: data.cards.filter((card) => card.id !== VIRTUAL_CONSUMPTION_CARD_ID).length,
      transactions: data.transactions.length,
    };
  },

  async importFromFile(file: File) {
    return this.importAll(JSON.parse(await file.text()) as BackupData);
  },

  /** Clear user ledger data while keeping funds, categories and the internal consumption account. */
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
        db.savingsEntries,
        db.savingsLogs,
        db.initialBalanceLogs,
        db.consumptionBudgets,
      ],
      async () => {
        const removable = (await db.cards.toArray())
          .filter((card) => card.type !== 'FUND' && card.id !== VIRTUAL_CONSUMPTION_CARD_ID)
          .map((card) => card.id);
        await Promise.all([
          db.cards.bulkDelete(removable),
          db.budgetSnapshots.clear(),
          db.budgetLines.clear(),
          db.transactions.clear(),
          db.budgetDetails.clear(),
          db.savingsActuals.clear(),
          db.savingsEntries.clear(),
          db.savingsLogs.clear(),
          db.initialBalanceLogs.clear(),
          db.consumptionBudgets.clear(),
        ]);
        await db.cards.put(virtualCard());
      },
    );
  },
};
