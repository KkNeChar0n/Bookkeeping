import {
  db,
  type BudgetDetailRow,
  type BudgetLineRow,
  type BudgetSnapshotRow,
  type CardRow,
  type CategoryRow,
  type ConsumptionBudgetRow,
  type InitialBalanceLogRow,
  type FundPrincipalLogRow,
  type FundMonthSnapshotRow,
  type FundSavingsSnapshotRow,
  type LegacyFundContributionRow,
  type LegacyFundSnapshotRow,
  type SavingsActualRow,
  type SavingsEntryRow,
  type SavingsLogRow,
  type SpendQuotaRow,
  type TransactionRow,
} from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID, VIRTUAL_CONSUMPTION_CARD_NAME } from '../domain/consumption';
import { buildOrphanCleanupPlan } from '../domain/orphanCleanup';
import { aggregateLegacyFundSavings, isValidMonth } from '../domain/fundSavings';

type LegacyConsumptionBudgetRow = ConsumptionBudgetRow & { consumptionCardId?: string };
type LegacyBackupCardRow = CardRow & { savingsPurpose?: 'FUND_POOL' };
interface LegacyAssetTransferRow {
  id: string;
  date: string;
  sourceCardId: string;
  targetKind: 'SAVINGS' | 'FUND_PRINCIPAL';
  targetCardId: string;
  amount: number;
  savingsApplied?: number;
  principalApplied: number;
  note: string | null;
  createdAt: number;
}

export interface BackupData {
  app: 'bookkeeping';
  version: number;
  exportedAt: string;
  cards: LegacyBackupCardRow[];
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
  assetTransfers?: LegacyAssetTransferRow[];
  fundPrincipalLogs?: FundPrincipalLogRow[];
  fundMonthSnapshots?: FundMonthSnapshotRow[];
  fundSavingsSnapshots?: FundSavingsSnapshotRow[];
  fundContributions?: LegacyFundContributionRow[];
  fundSnapshots?: LegacyFundSnapshotRow[];
  consumptionBudgets?: LegacyConsumptionBudgetRow[];
}

export interface NormalizedBackupData extends Omit<
  BackupData,
  | 'cards'
  | 'consumptionBudgets'
  | 'spendQuotas'
  | 'fundContributions'
  | 'fundSnapshots'
  | 'assetTransfers'
  | 'fundPrincipalLogs'
  | 'fundMonthSnapshots'
  | 'fundSavingsSnapshots'
> {
  cards: CardRow[];
  consumptionBudgets: ConsumptionBudgetRow[];
  fundSavingsSnapshots: FundSavingsSnapshotRow[];
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

/** Normalize old backups before writing them into the already-upgraded database. */
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

  const normalized = {
    app: 'bookkeeping' as const,
    version: 13,
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
    fundPrincipalLogs: data.fundPrincipalLogs ?? [],
    fundMonthSnapshots: data.fundMonthSnapshots ?? [],
    consumptionBudgets: [...aggregated.values()],
  };
  const plan = buildOrphanCleanupPlan({
    cards: normalized.cards,
    budgetSnapshots: normalized.budgetSnapshots,
    budgetLines: normalized.budgetLines,
    transactions: normalized.transactions,
    budgetDetails: normalized.budgetDetails ?? [],
    savingsActuals: normalized.savingsActuals ?? [],
    savingsEntries: normalized.savingsEntries ?? [],
    savingsLogs: normalized.savingsLogs ?? [],
    initialBalanceLogs: normalized.initialBalanceLogs ?? [],
    consumptionBudgets: normalized.consumptionBudgets,
    fundContributions: data.fundContributions ?? [],
    fundSnapshots: data.fundSnapshots ?? [],
  });
  const keep = <T extends { id: string }>(rows: T[], deletedIds: string[]) => {
    const deleted = new Set(deletedIds);
    return rows.filter((row) => !deleted.has(row.id));
  };
  const validContributions = keep(data.fundContributions ?? [], plan.fundContributionIds);
  const validSnapshots = keep(data.fundSnapshots ?? [], plan.fundSnapshotIds);
  const contributionsByFund = new Map<string, number>();
  for (const row of validContributions) {
    contributionsByFund.set(
      row.fundCardId,
      (contributionsByFund.get(row.fundCardId) ?? 0) + row.amount,
    );
  }
  const latestSnapshotByFund = new Map<string, LegacyFundSnapshotRow>();
  for (const row of validSnapshots) {
    const current = latestSnapshotByFund.get(row.fundCardId);
    if (
      !current ||
      row.month > current.month ||
      (row.month === current.month && row.updatedAt > current.updatedAt)
    ) {
      latestSnapshotByFund.set(row.fundCardId, row);
    }
  }
  const cards: CardRow[] = (normalized.cards as LegacyBackupCardRow[]).map((legacyCard) => {
    const card = { ...legacyCard };
    delete card.savingsPurpose;
    if (card.type !== 'FUND') return card;
    const latest = latestSnapshotByFund.get(card.id);
    return {
      ...card,
      fundPrincipal:
        (card.fundPrincipal ?? card.initialBalance) + (contributionsByFund.get(card.id) ?? 0),
      ...(latest ? { fundValue: latest.value } : {}),
    };
  });
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const legacyAssetTransfers = (data.assetTransfers ?? []).filter((row) => {
    const source = cardById.get(row.sourceCardId);
    const target = cardById.get(row.targetCardId);
    if (!source || source.type !== 'SAVINGS' || !target || row.amount <= 0) return false;
    return row.targetKind === 'SAVINGS'
      ? target.type === 'SAVINGS' && row.sourceCardId !== row.targetCardId
      : row.targetKind === 'FUND_PRINCIPAL' && target.type === 'FUND';
  });
  const savingsActuals = keep(normalized.savingsActuals ?? [], plan.savingsActualIds).map(
    (row) => ({
      ...row,
    }),
  );
  const actualByCardMonth = new Map(
    savingsActuals.map((row) => [`${row.cardId}|${row.month}`, row]),
  );
  for (const row of legacyAssetTransfers) {
    if (row.savingsApplied !== 1) continue;
    const actual = actualByCardMonth.get(`${row.sourceCardId}|${row.date.slice(0, 7)}`);
    if (actual) actual.amount += row.amount;
  }
  const snapshotByFundMonth = new Map<string, FundMonthSnapshotRow>();
  for (const row of normalized.fundMonthSnapshots) {
    if (
      cardById.get(row.fundCardId)?.type !== 'FUND' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
      !Number.isSafeInteger(row.principal) ||
      !Number.isSafeInteger(row.value) ||
      row.principal < 0 ||
      row.value < 0
    ) {
      continue;
    }
    const key = `${row.fundCardId}|${row.month}`;
    const found = snapshotByFundMonth.get(key);
    if (!found || row.updatedAt >= found.updatedAt) snapshotByFundMonth.set(key, { ...row });
  }
  if (data.version < 11 || !Array.isArray(data.fundMonthSnapshots)) {
    const exportedMonth = /^\d{4}-\d{2}/.exec(data.exportedAt)?.[0] ?? '1970-01';
    for (const card of cards.filter((row) => row.type === 'FUND')) {
      snapshotByFundMonth.set(`${card.id}|${exportedMonth}`, {
        id: crypto.randomUUID(),
        fundCardId: card.id,
        month: exportedMonth,
        principal: card.fundPrincipal ?? card.initialBalance,
        value: card.fundValue ?? card.initialBalance,
        updatedAt: Date.parse(data.exportedAt) || Date.now(),
      });
    }
  }
  const exportedMonth = /^\d{4}-\d{2}/.exec(data.exportedAt)?.[0] ?? '1970-01';
  const exportedAt = Date.parse(data.exportedAt) || Date.now();
  const suppliedFundSavings = new Map<string, FundSavingsSnapshotRow>();
  for (const row of data.fundSavingsSnapshots ?? []) {
    if (
      !isValidMonth(row.month) ||
      !Number.isSafeInteger(row.marketValue) ||
      !Number.isSafeInteger(row.prepaid) ||
      row.marketValue < 0 ||
      row.prepaid < 0
    ) {
      continue;
    }
    const found = suppliedFundSavings.get(row.month);
    if (!found || row.updatedAt >= found.updatedAt) suppliedFundSavings.set(row.month, { ...row });
  }
  const fundSavingsSnapshots = Array.isArray(data.fundSavingsSnapshots)
    ? [...suppliedFundSavings.values()]
    : aggregateLegacyFundSavings(
        cards.filter((card) => card.type === 'FUND'),
        [...snapshotByFundMonth.values()],
        exportedMonth,
        exportedAt,
      );
  const finalCards = cards.filter((card) => card.type !== 'FUND');
  const preliminary = {
    budgetLines: keep(normalized.budgetLines, plan.budgetLineIds),
    transactions: keep(normalized.transactions, plan.transactionIds),
    budgetDetails: keep(normalized.budgetDetails ?? [], plan.budgetDetailIds),
    savingsActuals,
    savingsEntries: keep(normalized.savingsEntries ?? [], plan.savingsEntryIds),
    savingsLogs: keep(normalized.savingsLogs ?? [], plan.savingsLogIds),
    initialBalanceLogs: keep(normalized.initialBalanceLogs ?? [], plan.initialBalanceLogIds),
    consumptionBudgets: keep(normalized.consumptionBudgets, plan.consumptionBudgetIds),
  };
  const finalPlan = buildOrphanCleanupPlan({
    cards: finalCards,
    budgetSnapshots: normalized.budgetSnapshots,
    ...preliminary,
    fundContributions: [],
    fundSnapshots: [],
  });
  return {
    app: 'bookkeeping',
    version: 13,
    exportedAt: data.exportedAt,
    cards: finalCards,
    budgetSnapshots: normalized.budgetSnapshots,
    budgetLines: keep(preliminary.budgetLines, finalPlan.budgetLineIds),
    transactions: keep(preliminary.transactions, finalPlan.transactionIds),
    budgetDetails: keep(preliminary.budgetDetails, finalPlan.budgetDetailIds),
    savingsActuals: keep(preliminary.savingsActuals, finalPlan.savingsActualIds),
    categories: normalized.categories,
    savingsEntries: keep(preliminary.savingsEntries, finalPlan.savingsEntryIds),
    savingsLogs: keep(preliminary.savingsLogs, finalPlan.savingsLogIds),
    initialBalanceLogs: keep(preliminary.initialBalanceLogs, finalPlan.initialBalanceLogIds),
    consumptionBudgets: keep(preliminary.consumptionBudgets, finalPlan.consumptionBudgetIds),
    fundSavingsSnapshots,
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
      fundSavingsSnapshots,
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
      db.fundSavingsSnapshots.toArray(),
    ]);
    return {
      app: 'bookkeeping',
      version: 13,
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
      fundSavingsSnapshots,
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
        db.fundSavingsSnapshots,
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
          db.fundSavingsSnapshots.clear(),
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
        await db.fundSavingsSnapshots.bulkAdd(data.fundSavingsSnapshots);
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

  /** Clear user ledger data while keeping the fund savings pool, categories and consumption account. */
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
          .filter((card) => card.id !== VIRTUAL_CONSUMPTION_CARD_ID)
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
