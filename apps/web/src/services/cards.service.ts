import { db, newId, nowTs, type CardRow, type CardType } from '../db/db';
import { fromCents, toCents } from '../domain/money';
import type { Card } from '../api/types';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';

function toDTO(c: CardRow): Card {
  return {
    id: c.id,
    name: c.name,
    type: c.type ?? 'SAVINGS',
    initialBalance: fromCents(c.initialBalance),
    isDefault: c.isDefault === 1,
    sortOrder: c.sortOrder,
    fundPrincipal: fromCents(c.fundPrincipal ?? c.initialBalance),
    fundValue: fromCents(c.fundValue ?? c.initialBalance),
  };
}

async function orderedRows(): Promise<CardRow[]> {
  const rows = await db.cards.toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export const cardsService = {
  async list(): Promise<Card[]> {
    return (await orderedRows()).filter((row) => row.id !== VIRTUAL_CONSUMPTION_CARD_ID).map(toDTO);
  },

  async create(input: {
    name: string;
    type?: CardType;
    initialBalance?: string;
    isDefault?: boolean;
  }): Promise<Card> {
    const name = input.name.trim();
    if (!name) throw new Error('卡片名称不能为空');
    const rows = await db.cards.toArray();
    const sortOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
    const initial = toCents(input.initialBalance ?? '0');
    const type = input.type ?? 'SAVINGS';
    if (type === 'SPEND') throw new Error('消费账户由系统统一管理');
    const row: CardRow = {
      id: newId(),
      name,
      type,
      initialBalance: initial,
      isDefault: input.isDefault ? 1 : 0,
      sortOrder,
      createdAt: nowTs(),
      // 基金：本金/市值起点 = 初始
      ...(type === 'FUND' ? { fundPrincipal: initial, fundValue: initial } : {}),
    };
    await db.transaction('rw', db.cards, async () => {
      if (input.isDefault) {
        await db.cards.toCollection().modify({ isDefault: 0 });
      }
      await db.cards.add(row);
    });
    return toDTO(row);
  },

  async update(
    id: string,
    input: { name?: string; type?: CardType; initialBalance?: string },
  ): Promise<Card> {
    const existing = await db.cards.get(id);
    if (!existing) throw new Error('卡片不存在');
    if (id === VIRTUAL_CONSUMPTION_CARD_ID) throw new Error('消费账户由系统统一管理');
    const patch: Partial<CardRow> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('卡片名称不能为空');
      patch.name = name;
    }
    if (input.type !== undefined) patch.type = input.type;
    const nextInitial =
      input.initialBalance === undefined ? undefined : toCents(input.initialBalance);
    if (nextInitial !== undefined) patch.initialBalance = nextInitial;
    await db.transaction('rw', [db.cards, db.initialBalanceLogs], async () => {
      const current = await db.cards.get(id);
      if (!current) throw new Error('卡片不存在');
      if (nextInitial !== undefined && nextInitial !== current.initialBalance) {
        await db.initialBalanceLogs.add({
          id: newId(),
          cardId: id,
          previousAmount: current.initialBalance,
          amount: nextInitial,
          createdAt: nowTs(),
        });
      }
      await db.cards.update(id, patch);
    });
    return toDTO({ ...existing, ...patch });
  },

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await db.cards.get(id);
    if (!existing) throw new Error('卡片不存在');
    if (id === VIRTUAL_CONSUMPTION_CARD_ID) throw new Error('消费账户不可删除');
    if (existing.isDefault === 1) throw new Error('默认卡不可删除，请先设置其他默认卡');
    await db.transaction(
      'rw',
      [
        db.cards,
        db.budgetLines,
        db.transactions,
        db.budgetDetails,
        db.savingsActuals,
        db.savingsEntries,
        db.savingsLogs,
        db.initialBalanceLogs,
        db.consumptionBudgets,
        db.assetTransfers,
        db.fundPrincipalLogs,
      ],
      async () => {
        const transactions = await db.transactions.toArray();
        const affectedGroups = new Set(
          transactions
            .filter((row) => row.cardId === id || row.peerCardId === id)
            .map((row) => row.transferGroupId)
            .filter((group): group is string => !!group),
        );
        const transactionIds = transactions
          .filter(
            (row) =>
              row.cardId === id ||
              row.peerCardId === id ||
              (!!row.transferGroupId && affectedGroups.has(row.transferGroupId)),
          )
          .map((row) => row.id);
        const budgetDetails = await db.budgetDetails.toArray();
        const budgetDetailIds = budgetDetails
          .filter((row) => row.cardId === id || row.peerCardId === id)
          .map((row) => row.id);
        const assetTransfers = await db.assetTransfers.toArray();
        const relatedAssetTransfers = assetTransfers.filter(
          (row) => row.sourceCardId === id || row.targetCardId === id,
        );

        // 删除一端时，反向恢复仍保留储蓄卡受到的余额影响。
        const savingsRollback = new Map<string, { cardId: string; month: string; delta: number }>();
        for (const row of relatedAssetTransfers) {
          if (row.savingsApplied !== 1) continue;
          const month = row.date.slice(0, 7);
          let cardId: string | null = null;
          let delta = 0;
          if (row.sourceCardId === id && row.targetKind === 'SAVINGS') {
            cardId = row.targetCardId;
            delta = -row.amount;
          } else if (row.targetCardId === id) {
            cardId = row.sourceCardId;
            delta = row.amount;
          }
          if (!cardId || cardId === id) continue;
          const key = `${cardId}|${month}`;
          const current = savingsRollback.get(key);
          savingsRollback.set(key, {
            cardId,
            month,
            delta: (current?.delta ?? 0) + delta,
          });
        }
        for (const rollback of savingsRollback.values()) {
          const actual = await db.savingsActuals
            .where('[cardId+month]')
            .equals([rollback.cardId, rollback.month])
            .first();
          if (!actual) throw new Error('划转对应的月度余额不存在，无法删除卡片');
          await db.savingsActuals.update(actual.id, {
            amount: actual.amount + rollback.delta,
            updatedAt: nowTs(),
          });
        }

        // 删除来源储蓄卡时，仍保留的目标基金需要同步回退实际应用过的本金。
        const principalRollbackByFund = new Map<string, number>();
        if (existing.type === 'SAVINGS') {
          for (const row of relatedAssetTransfers) {
            if (
              row.sourceCardId === id &&
              row.targetKind === 'FUND_PRINCIPAL' &&
              row.principalApplied === 1
            ) {
              principalRollbackByFund.set(
                row.targetCardId,
                (principalRollbackByFund.get(row.targetCardId) ?? 0) + row.amount,
              );
            }
          }
        }
        for (const [fundId, rollback] of principalRollbackByFund) {
          const fund = await db.cards.get(fundId);
          if (!fund || fund.type !== 'FUND') continue;
          const principal = fund.fundPrincipal ?? fund.initialBalance;
          if (principal < rollback) throw new Error(`基金「${fund.name}」本金不足，无法删除该储蓄卡`);
          await db.cards.update(fundId, { fundPrincipal: principal - rollback });
        }

        await Promise.all([
          transactionIds.length ? db.transactions.bulkDelete(transactionIds) : Promise.resolve(),
          budgetDetailIds.length ? db.budgetDetails.bulkDelete(budgetDetailIds) : Promise.resolve(),
          db.budgetLines.where('cardId').equals(id).delete(),
          db.savingsActuals.where('cardId').equals(id).delete(),
          db.savingsEntries.where('cardId').equals(id).delete(),
          db.savingsLogs.where('cardId').equals(id).delete(),
          db.initialBalanceLogs.where('cardId').equals(id).delete(),
          db.consumptionBudgets.where('savingsCardId').equals(id).delete(),
          relatedAssetTransfers.length
            ? db.assetTransfers.bulkDelete(relatedAssetTransfers.map((row) => row.id))
            : Promise.resolve(),
          db.fundPrincipalLogs.where('fundCardId').equals(id).delete(),
        ]);
        await db.cards.delete(id);
      },
    );
    return { ok: true };
  },

  /** 基金：更新市值；本金变更属于人工校准，必须留下审计。 */
  async setFund(id: string, input: { principal?: string; value?: string }): Promise<Card> {
    const existing = await db.cards.get(id);
    if (!existing || existing.type !== 'FUND') throw new Error('基金不存在');
    const patch: Partial<CardRow> = {};
    const nextPrincipal = input.principal === undefined ? undefined : toCents(input.principal);
    const nextValue = input.value === undefined ? undefined : toCents(input.value);
    if (nextPrincipal !== undefined && nextPrincipal < 0) throw new Error('基金本金不能为负数');
    if (nextValue !== undefined && nextValue < 0) throw new Error('基金市值不能为负数');
    if (nextPrincipal !== undefined) patch.fundPrincipal = nextPrincipal;
    if (nextValue !== undefined) patch.fundValue = nextValue;
    await db.transaction(
      'rw',
      [db.cards, db.assetTransfers, db.fundPrincipalLogs],
      async () => {
        const current = await db.cards.get(id);
        if (!current || current.type !== 'FUND') throw new Error('基金不存在');
        const previousPrincipal = current.fundPrincipal ?? current.initialBalance;
        if (nextPrincipal !== undefined && nextPrincipal !== previousPrincipal) {
          const transfers = await db.assetTransfers.where('targetCardId').equals(id).toArray();
          const applied = transfers
            .filter(
              (row) => row.targetKind === 'FUND_PRINCIPAL' && row.principalApplied === 1,
            )
            .reduce((sum, row) => sum + row.amount, 0);
          if (nextPrincipal < applied) {
            throw new Error(`本金不能低于仍有效的划转合计 ${fromCents(applied)}`);
          }
          await db.fundPrincipalLogs.add({
            id: newId(),
            fundCardId: id,
            previousAmount: previousPrincipal,
            amount: nextPrincipal,
            createdAt: nowTs(),
          });
        }
        await db.cards.update(id, patch);
      },
    );
    return toDTO({ ...existing, ...patch });
  },

  async setDefault(id: string): Promise<{ ok: true }> {
    const existing = await db.cards.get(id);
    if (!existing) throw new Error('卡片不存在');
    await db.transaction('rw', db.cards, async () => {
      await db.cards.toCollection().modify({ isDefault: 0 });
      await db.cards.update(id, { isDefault: 1 });
    });
    return { ok: true };
  },

  async reorder(orderedIds: string[]): Promise<Card[]> {
    if (orderedIds.length === 0) throw new Error('排序列表为空');
    if (orderedIds.includes(VIRTUAL_CONSUMPTION_CARD_ID)) throw new Error('消费账户不可排序');
    await db.transaction('rw', db.cards, async () => {
      await Promise.all(orderedIds.map((id, idx) => db.cards.update(id, { sortOrder: idx })));
    });
    return this.list();
  },
};
