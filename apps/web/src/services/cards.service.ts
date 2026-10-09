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
  };
}

async function orderedRows(): Promise<CardRow[]> {
  const rows = await db.cards.toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export const cardsService = {
  async list(): Promise<Card[]> {
    return (await orderedRows()).filter((row) => row.type === 'SAVINGS').map(toDTO);
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
    if (type !== 'SAVINGS') throw new Error('只能创建储蓄卡');
    const row: CardRow = {
      id: newId(),
      name,
      type,
      initialBalance: initial,
      isDefault: input.isDefault ? 1 : 0,
      sortOrder,
      createdAt: nowTs(),
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
    if (input.type !== undefined) {
      if (input.type !== 'SAVINGS') throw new Error('只能管理储蓄卡');
      patch.type = input.type;
    }
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
        await Promise.all([
          transactionIds.length ? db.transactions.bulkDelete(transactionIds) : Promise.resolve(),
          budgetDetailIds.length ? db.budgetDetails.bulkDelete(budgetDetailIds) : Promise.resolve(),
          db.budgetLines.where('cardId').equals(id).delete(),
          db.savingsActuals.where('cardId').equals(id).delete(),
          db.savingsEntries.where('cardId').equals(id).delete(),
          db.savingsLogs.where('cardId').equals(id).delete(),
          db.initialBalanceLogs.where('cardId').equals(id).delete(),
          db.consumptionBudgets.where('savingsCardId').equals(id).delete(),
        ]);
        await db.cards.delete(id);
      },
    );
    return { ok: true };
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
