import { db, newId, nowTs, type BudgetLineRow, type BudgetSnapshotRow, type CardRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';
import type { BudgetSnapshot, BudgetLine } from '../api/types';

async function orderedCards(): Promise<CardRow[]> {
  const rows = await db.cards.toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

/** 计算所有快照（按日期升序）每卡的滚动派生余额 */
async function computeAll(): Promise<{
  snapshots: BudgetSnapshotRow[];
  cards: CardRow[];
  linesBySnap: Map<string, BudgetLineRow[]>;
  balances: Map<string, Map<string, Cents>>;
}> {
  const [snapsRaw, cards, allLines] = await Promise.all([
    db.budgetSnapshots.toArray(),
    orderedCards(),
    db.budgetLines.toArray(),
  ]);
  const snapshots = snapsRaw.sort((a, b) => a.date.localeCompare(b.date));
  const linesBySnap = new Map<string, BudgetLineRow[]>();
  for (const l of allLines) {
    const arr = linesBySnap.get(l.snapshotId) ?? [];
    arr.push(l);
    linesBySnap.set(l.snapshotId, arr);
  }

  const running = new Map<string, Cents>();
  for (const c of cards) running.set(c.id, c.initialBalance);
  const balances = new Map<string, Map<string, Cents>>();
  for (const snap of snapshots) {
    const byCard = new Map((linesBySnap.get(snap.id) ?? []).map((l) => [l.cardId, l]));
    const snapMap = new Map<string, Cents>();
    for (const c of cards) {
      const line = byCard.get(c.id);
      const delta = line ? line.inAmount - line.outAmount : 0;
      running.set(c.id, (running.get(c.id) ?? 0) + delta);
      snapMap.set(c.id, running.get(c.id) ?? 0);
    }
    balances.set(snap.id, snapMap);
  }
  return { snapshots, cards, linesBySnap, balances };
}

function buildDTO(
  snap: BudgetSnapshotRow,
  cards: CardRow[],
  lines: BudgetLineRow[],
  balanceMap: Map<string, Cents>,
): BudgetSnapshot {
  const byCard = new Map(lines.map((l) => [l.cardId, l]));
  let tIn = 0;
  let tOut = 0;
  let tBal = 0;
  const dtoLines: BudgetLine[] = cards.map((c) => {
    const l = byCard.get(c.id);
    const inC = l ? l.inAmount : 0;
    const outC = l ? l.outAmount : 0;
    const bal = balanceMap.get(c.id) ?? 0;
    tIn += inC;
    tOut += outC;
    tBal += bal;
    return {
      cardId: c.id,
      cardName: c.name,
      inAmount: fromCents(inC),
      outAmount: fromCents(outC),
      balance: fromCents(bal),
    };
  });
  return {
    id: snap.id,
    date: snap.date,
    note: snap.note,
    lines: dtoLines,
    totals: { inAmount: fromCents(tIn), outAmount: fromCents(tOut), balance: fromCents(tBal) },
  };
}

export const budgetsService = {
  async list(): Promise<BudgetSnapshot[]> {
    const { snapshots, cards, linesBySnap, balances } = await computeAll();
    return snapshots.map((s) =>
      buildDTO(s, cards, linesBySnap.get(s.id) ?? [], balances.get(s.id) ?? new Map()),
    );
  },

  async get(id: string): Promise<BudgetSnapshot> {
    const { snapshots, cards, linesBySnap, balances } = await computeAll();
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) throw new Error('预算快照不存在');
    return buildDTO(snap, cards, linesBySnap.get(id) ?? [], balances.get(id) ?? new Map());
  },

  async upsertSnapshot(input: { date: string; note?: string }): Promise<BudgetSnapshot> {
    const date = input.date.slice(0, 10);
    const existing = await db.budgetSnapshots.where('date').equals(date).first();
    if (existing) return this.get(existing.id);
    const row: BudgetSnapshotRow = {
      id: newId(),
      date,
      note: input.note ?? null,
      createdAt: nowTs(),
    };
    await db.budgetSnapshots.add(row);
    return this.get(row.id);
  },

  async setLine(input: {
    snapshotId: string;
    cardId: string;
    inAmount?: string;
    outAmount?: string;
  }): Promise<BudgetSnapshot> {
    const snap = await db.budgetSnapshots.get(input.snapshotId);
    if (!snap) throw new Error('预算快照不存在');
    const inC = input.inAmount !== undefined ? toCents(input.inAmount) : undefined;
    const outC = input.outAmount !== undefined ? toCents(input.outAmount) : undefined;
    if ((inC !== undefined && inC < 0) || (outC !== undefined && outC < 0)) {
      throw new Error('收/支不能为负');
    }
    const existing = await db.budgetLines
      .where('[snapshotId+cardId]')
      .equals([input.snapshotId, input.cardId])
      .first();
    if (existing) {
      await db.budgetLines.update(existing.id, {
        ...(inC !== undefined ? { inAmount: inC } : {}),
        ...(outC !== undefined ? { outAmount: outC } : {}),
      });
    } else {
      await db.budgetLines.add({
        id: newId(),
        snapshotId: input.snapshotId,
        cardId: input.cardId,
        inAmount: inC ?? 0,
        outAmount: outC ?? 0,
      });
    }
    return this.get(input.snapshotId);
  },

  async transfer(input: {
    snapshotId: string;
    cardId: string;
    direction: 'OUT' | 'IN';
    peerCardId: string;
    amount: string;
  }): Promise<BudgetSnapshot> {
    if (!input.peerCardId) throw new Error('请选择对手卡');
    if (input.peerCardId === input.cardId) throw new Error('对手卡不能与当前卡相同');
    const n = toCents(input.amount);
    if (n <= 0) throw new Error('调账金额必须为正');
    const snap = await db.budgetSnapshots.get(input.snapshotId);
    if (!snap) throw new Error('预算快照不存在');

    // 调出：当前卡 out += N，对手卡 in += N；调入相反
    const bump = async (cardId: string, field: 'inAmount' | 'outAmount') => {
      const line = await db.budgetLines
        .where('[snapshotId+cardId]')
        .equals([input.snapshotId, cardId])
        .first();
      if (line) {
        await db.budgetLines.update(line.id, { [field]: line[field] + n });
      } else {
        await db.budgetLines.add({
          id: newId(),
          snapshotId: input.snapshotId,
          cardId,
          inAmount: field === 'inAmount' ? n : 0,
          outAmount: field === 'outAmount' ? n : 0,
        });
      }
    };
    await bump(input.cardId, input.direction === 'OUT' ? 'outAmount' : 'inAmount');
    await bump(input.peerCardId, input.direction === 'OUT' ? 'inAmount' : 'outAmount');
    return this.get(input.snapshotId);
  },

  async remove(id: string): Promise<{ ok: true }> {
    const snap = await db.budgetSnapshots.get(id);
    if (!snap) throw new Error('预算快照不存在');
    await db.transaction('rw', db.budgetSnapshots, db.budgetLines, async () => {
      await db.budgetLines.where('snapshotId').equals(id).delete();
      await db.budgetSnapshots.delete(id);
    });
    return { ok: true };
  },
};
