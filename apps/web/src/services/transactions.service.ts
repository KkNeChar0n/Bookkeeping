import { db, newId, nowTs, type TransactionRow } from '../db/db';
import { fromCents, toCents } from '../domain/money';
import { adjustmentForTargetBalance } from '../domain/balance';
import { actualBalanceForCard } from './ledger';
import type { Transaction } from '../api/types';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
function normDate(d?: string): string {
  if (!d) return todayISO();
  return d.slice(0, 10);
}

async function toDTO(t: TransactionRow): Promise<Transaction> {
  const peer = t.peerCardId ? await db.cards.get(t.peerCardId) : null;
  return {
    id: t.id,
    cardId: t.cardId,
    date: t.date,
    type: t.type,
    amount: fromCents(t.amount),
    category: t.category,
    note: t.note,
    peerCardId: t.peerCardId,
    peerCardName: peer?.name ?? null,
    transferGroupId: t.transferGroupId,
  };
}

export const txService = {
  async list(filter: { cardId?: string; from?: string; to?: string } = {}): Promise<Transaction[]> {
    let rows = await db.transactions.toArray();
    if (filter.cardId) rows = rows.filter((t) => t.cardId === filter.cardId);
    if (filter.from) rows = rows.filter((t) => t.date >= filter.from!);
    if (filter.to) rows = rows.filter((t) => t.date <= filter.to!);
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return Promise.all(rows.map(toDTO));
  },

  /** 修改一笔流水（日期/类型/金额/备注）；金额按 type 保持符号 */
  async update(
    id: string,
    input: { amount?: string; category?: string; note?: string; date?: string },
  ): Promise<Transaction> {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('流水不存在');
    const patch: Partial<TransactionRow> = {};
    if (input.amount !== undefined) {
      const abs = toCents(input.amount);
      if (abs <= 0) throw new Error('金额必须为正');
      patch.amount = existing.type === 'OUT' ? -abs : existing.type === 'IN' ? abs : existing.amount;
    }
    if (input.category !== undefined) patch.category = input.category || null;
    if (input.note !== undefined) patch.note = input.note || null;
    if (input.date !== undefined) patch.date = normDate(input.date);
    await db.transactions.update(id, patch);
    return toDTO({ ...existing, ...patch });
  },

  async createEntry(input: {
    cardId: string;
    type: 'IN' | 'OUT';
    amount: string;
    date?: string;
    category?: string;
    note?: string;
  }): Promise<Transaction> {
    const abs = toCents(input.amount);
    if (abs <= 0) throw new Error('金额必须为正');
    const row: TransactionRow = {
      id: newId(),
      cardId: input.cardId,
      type: input.type,
      amount: input.type === 'IN' ? abs : -abs,
      date: normDate(input.date),
      category: input.category ?? null,
      note: input.note ?? null,
      peerCardId: null,
      transferGroupId: null,
      createdAt: nowTs(),
    };
    await db.transactions.add(row);
    return toDTO(row);
  },

  async transfer(input: {
    cardId: string;
    direction: 'OUT' | 'IN';
    peerCardId: string;
    amount: string;
    date?: string;
    note?: string;
  }): Promise<{ ok: true; transferGroupId: string }> {
    if (!input.peerCardId) throw new Error('请选择对手卡');
    if (input.peerCardId === input.cardId) throw new Error('对手卡不能与当前卡相同');
    const n = toCents(input.amount);
    if (n <= 0) throw new Error('调账金额必须为正');
    const selfDelta = input.direction === 'OUT' ? -n : n;
    const date = normDate(input.date);
    const group = newId();
    const ts = nowTs();
    await db.transactions.bulkAdd([
      {
        id: newId(),
        cardId: input.cardId,
        type: 'TRANSFER',
        amount: selfDelta,
        date,
        category: null,
        note: input.note ?? null,
        peerCardId: input.peerCardId,
        transferGroupId: group,
        createdAt: ts,
      },
      {
        id: newId(),
        cardId: input.peerCardId,
        type: 'TRANSFER',
        amount: -selfDelta,
        date,
        category: null,
        note: input.note ?? null,
        peerCardId: input.cardId,
        transferGroupId: group,
        createdAt: ts,
      },
    ]);
    return { ok: true, transferGroupId: group };
  },

  async setActualBalance(input: {
    cardId: string;
    targetBalance: string;
    date?: string;
    note?: string;
  }): Promise<{ ok: true; adjusted: boolean; delta?: string }> {
    const card = await db.cards.get(input.cardId);
    if (!card) throw new Error('卡片不存在');
    const current = await actualBalanceForCard(input.cardId);
    const delta = adjustmentForTargetBalance(current, toCents(input.targetBalance));
    if (delta === 0) return { ok: true, adjusted: false };
    await db.transactions.add({
      id: newId(),
      cardId: input.cardId,
      type: 'ADJUST',
      amount: delta,
      date: normDate(input.date),
      category: null,
      note: input.note ?? '余额调整',
      peerCardId: null,
      transferGroupId: null,
      createdAt: nowTs(),
    });
    return { ok: true, adjusted: true, delta: fromCents(delta) };
  },

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('流水不存在');
    if (existing.type === 'TRANSFER' && existing.transferGroupId) {
      await db.transactions.where('transferGroupId').equals(existing.transferGroupId).delete();
    } else {
      await db.transactions.delete(id);
    }
    return { ok: true };
  },
};
