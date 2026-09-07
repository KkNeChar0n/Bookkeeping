interface IdRow {
  id: string;
}

interface CardReferenceRow extends IdRow {
  cardId: string;
}

interface PeerCardReferenceRow extends CardReferenceRow {
  peerCardId?: string | null;
}

interface TransactionReferenceRow extends PeerCardReferenceRow {
  transferGroupId?: string | null;
}

export interface OrphanCleanupSource {
  cards: readonly IdRow[];
  budgetSnapshots: readonly IdRow[];
  budgetLines: readonly (CardReferenceRow & { snapshotId: string })[];
  transactions: readonly TransactionReferenceRow[];
  budgetDetails: readonly PeerCardReferenceRow[];
  savingsActuals: readonly CardReferenceRow[];
  savingsEntries: readonly CardReferenceRow[];
  savingsLogs: readonly CardReferenceRow[];
  initialBalanceLogs: readonly CardReferenceRow[];
  consumptionBudgets: readonly (IdRow & { savingsCardId: string })[];
  fundContributions: readonly (IdRow & { sourceCardId: string; fundCardId: string })[];
  fundSnapshots: readonly (IdRow & { fundCardId: string })[];
}

export interface OrphanCleanupPlan {
  budgetLineIds: string[];
  transactionIds: string[];
  budgetDetailIds: string[];
  savingsActualIds: string[];
  savingsEntryIds: string[];
  savingsLogIds: string[];
  initialBalanceLogIds: string[];
  consumptionBudgetIds: string[];
  fundContributionIds: string[];
  fundSnapshotIds: string[];
}

const referencesMissingCard = (row: PeerCardReferenceRow, validCardIds: Set<string>) =>
  !validCardIds.has(row.cardId) || (!!row.peerCardId && !validCardIds.has(row.peerCardId));

/**
 * Build a deterministic deletion plan for records that reference cards or snapshots
 * which no longer exist. No amounts are inferred or rewritten.
 */
export function buildOrphanCleanupPlan(source: OrphanCleanupSource): OrphanCleanupPlan {
  const validCardIds = new Set(source.cards.map((row) => row.id));
  const validSnapshotIds = new Set(source.budgetSnapshots.map((row) => row.id));
  const brokenTransferGroups = new Set(
    source.transactions
      .filter((row) => referencesMissingCard(row, validCardIds))
      .map((row) => row.transferGroupId)
      .filter((groupId): groupId is string => !!groupId),
  );

  return {
    budgetLineIds: source.budgetLines
      .filter((row) => !validCardIds.has(row.cardId) || !validSnapshotIds.has(row.snapshotId))
      .map((row) => row.id),
    transactionIds: source.transactions
      .filter(
        (row) =>
          referencesMissingCard(row, validCardIds) ||
          (!!row.transferGroupId && brokenTransferGroups.has(row.transferGroupId)),
      )
      .map((row) => row.id),
    budgetDetailIds: source.budgetDetails
      .filter((row) => referencesMissingCard(row, validCardIds))
      .map((row) => row.id),
    savingsActualIds: source.savingsActuals
      .filter((row) => !validCardIds.has(row.cardId))
      .map((row) => row.id),
    savingsEntryIds: source.savingsEntries
      .filter((row) => !validCardIds.has(row.cardId))
      .map((row) => row.id),
    savingsLogIds: source.savingsLogs
      .filter((row) => !validCardIds.has(row.cardId))
      .map((row) => row.id),
    initialBalanceLogIds: source.initialBalanceLogs
      .filter((row) => !validCardIds.has(row.cardId))
      .map((row) => row.id),
    consumptionBudgetIds: source.consumptionBudgets
      .filter((row) => !validCardIds.has(row.savingsCardId))
      .map((row) => row.id),
    fundContributionIds: source.fundContributions
      .filter((row) => !validCardIds.has(row.sourceCardId) || !validCardIds.has(row.fundCardId))
      .map((row) => row.id),
    fundSnapshotIds: source.fundSnapshots
      .filter((row) => !validCardIds.has(row.fundCardId))
      .map((row) => row.id),
  };
}
