import { db, newId, nowTs, type CardRow, type CardType } from '../db/db';
import { fromCents, toCents } from '../domain/money';
import type { Card } from '../api/types';

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
    return (await orderedRows()).map(toDTO);
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
    const patch: Partial<CardRow> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('卡片名称不能为空');
      patch.name = name;
    }
    if (input.type !== undefined) patch.type = input.type;
    if (input.initialBalance !== undefined) patch.initialBalance = toCents(input.initialBalance);
    await db.cards.update(id, patch);
    return toDTO({ ...existing, ...patch });
  },

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await db.cards.get(id);
    if (!existing) throw new Error('卡片不存在');
    if (existing.isDefault === 1) throw new Error('默认卡不可删除，请先设置其他默认卡');
    const asCard = await db.transactions.where('cardId').equals(id).count();
    const asPeer = await db.transactions.filter((t) => t.peerCardId === id).count();
    if (asCard + asPeer > 0) throw new Error('该卡存在关联流水，不能删除');
    await db.cards.delete(id);
    return { ok: true };
  },

  /** 基金：直接设置本金 / 市值（两个数） */
  async setFund(id: string, input: { principal?: string; value?: string }): Promise<Card> {
    const existing = await db.cards.get(id);
    if (!existing) throw new Error('卡片不存在');
    const patch: Partial<CardRow> = {};
    if (input.principal !== undefined) patch.fundPrincipal = toCents(input.principal);
    if (input.value !== undefined) patch.fundValue = toCents(input.value);
    await db.cards.update(id, patch);
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
    await db.transaction('rw', db.cards, async () => {
      await Promise.all(orderedIds.map((id, idx) => db.cards.update(id, { sortOrder: idx })));
    });
    return this.list();
  },
};
