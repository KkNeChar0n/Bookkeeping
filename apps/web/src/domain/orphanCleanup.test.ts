import assert from 'node:assert/strict';
import test from 'node:test';
import { VIRTUAL_CONSUMPTION_CARD_ID } from './consumption';
import { buildOrphanCleanupPlan } from './orphanCleanup';

test('orphan cleanup removes missing references and both sides of actual transfers', () => {
  const plan = buildOrphanCleanupPlan({
    cards: [{ id: 'valid' }, { id: 'fund' }, { id: VIRTUAL_CONSUMPTION_CARD_ID }],
    budgetSnapshots: [{ id: 'snapshot' }],
    budgetLines: [
      { id: 'valid-line', snapshotId: 'snapshot', cardId: 'valid' },
      { id: 'missing-card-line', snapshotId: 'snapshot', cardId: 'deleted' },
      { id: 'missing-snapshot-line', snapshotId: 'deleted-snapshot', cardId: 'valid' },
    ],
    transactions: [
      {
        id: 'valid-transfer-side',
        cardId: 'valid',
        peerCardId: 'deleted',
        transferGroupId: 'broken-group',
      },
      {
        id: 'deleted-transfer-side',
        cardId: 'deleted',
        peerCardId: 'valid',
        transferGroupId: 'broken-group',
      },
      {
        id: 'group-row-without-direct-reference',
        cardId: 'valid',
        peerCardId: null,
        transferGroupId: 'broken-group',
      },
      {
        id: 'valid-consumption',
        cardId: VIRTUAL_CONSUMPTION_CARD_ID,
        peerCardId: null,
        transferGroupId: null,
      },
      {
        id: 'orphan-income',
        cardId: 'deleted',
        peerCardId: null,
        transferGroupId: null,
      },
    ],
    budgetDetails: [
      { id: 'valid-budget', cardId: 'valid', peerCardId: null },
      { id: 'broken-budget-out', cardId: 'deleted', peerCardId: 'valid' },
      { id: 'broken-budget-in', cardId: 'valid', peerCardId: 'deleted' },
    ],
    savingsActuals: [
      { id: 'valid-actual', cardId: 'valid' },
      { id: 'orphan-actual', cardId: 'deleted' },
    ],
    savingsEntries: [{ id: 'orphan-entry', cardId: 'deleted' }],
    savingsLogs: [{ id: 'orphan-log', cardId: 'deleted' }],
    initialBalanceLogs: [{ id: 'orphan-initial-log', cardId: 'deleted' }],
    consumptionBudgets: [
      { id: 'valid-consumption-budget', savingsCardId: 'valid' },
      { id: 'orphan-consumption-budget', savingsCardId: 'deleted' },
    ],
    fundContributions: [
      { id: 'valid-funding', sourceCardId: 'valid', fundCardId: 'fund' },
      { id: 'orphan-funding-source', sourceCardId: 'deleted', fundCardId: 'fund' },
      { id: 'orphan-funding-target', sourceCardId: 'valid', fundCardId: 'deleted' },
    ],
    fundSnapshots: [
      { id: 'valid-fund-snapshot', fundCardId: 'fund' },
      { id: 'orphan-fund-snapshot', fundCardId: 'deleted' },
    ],
  });

  assert.deepEqual(plan, {
    budgetLineIds: ['missing-card-line', 'missing-snapshot-line'],
    transactionIds: [
      'valid-transfer-side',
      'deleted-transfer-side',
      'group-row-without-direct-reference',
      'orphan-income',
    ],
    budgetDetailIds: ['broken-budget-out', 'broken-budget-in'],
    savingsActualIds: ['orphan-actual'],
    savingsEntryIds: ['orphan-entry'],
    savingsLogIds: ['orphan-log'],
    initialBalanceLogIds: ['orphan-initial-log'],
    consumptionBudgetIds: ['orphan-consumption-budget'],
    fundContributionIds: ['orphan-funding-source', 'orphan-funding-target'],
    fundSnapshotIds: ['orphan-fund-snapshot'],
  });
});
