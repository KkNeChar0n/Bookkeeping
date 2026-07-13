import { db, newId, nowTs, type BudgetDetailRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export type BudgetKind = 'IN' | 'OUT' | 'EXPENSE' | 'TRANSFER_IN';

/** 对余额的符号：收入/调入为 +，调出/支出为 − */
const sign = (kind: BudgetKind): number => (kind === 'IN' || kind === 'TRANSFER_IN' ? 1 : -1);

export interface BudgetDetailDTO {
  id: string;
  label: string;
  category: string | null;
  kind: BudgetKind;
  peerCardId: string | null;
  amount: string;
}

export interface BudgetMonthDTO {
  month: string; // YYYY-MM
  details: BudgetDetailDTO[];
  /** 当月净额（收入 − 调出） */
  net: string;
  /** 预期余额 = 初始 + 截至本月(含)累计净额 */
  expected: string;
}

function toDetail(d: BudgetDetailRow): BudgetDetailDTO {
  return {
    id: d.id,
    label: d.label,
    category: d.category ?? null,
    kind: d.kind,
    peerCardId: d.peerCardId ?? null,
    amount: fromCents(d.amount),
  };
}

async function initialOf(cardId: string): Promise<Cents> {
  const c = await db.cards.get(cardId);
  return c ? c.initialBalance : 0;
}

export const budgetPlanService = {
  /** 某储蓄卡按月的预算细节 + 滚动预期余额；extraMonths 用于展示尚无细节的空月份 */
  async months(cardId: string, extraMonths: string[] = []): Promise<BudgetMonthDTO[]> {
    const [rows, initial] = await Promise.all([
      db.budgetDetails.where('cardId').equals(cardId).toArray(),
      initialOf(cardId),
    ]);
    const byMonth = new Map<string, BudgetDetailRow[]>();
    for (const r of rows) {
      const arr = byMonth.get(r.month) ?? [];
      arr.push(r);
      byMonth.set(r.month, arr);
    }
    for (const m of extraMonths) if (!byMonth.has(m)) byMonth.set(m, []);

    const months = [...byMonth.keys()].sort();
    let running = initial;
    return months.map((month) => {
      const details = (byMonth.get(month) ?? []).sort((a, b) => a.createdAt - b.createdAt);
      // 收入/调入 +，调出/支出 −
      const net = details.reduce((s, d) => s + sign(d.kind) * d.amount, 0);
      running += net;
      return {
        month,
        details: details.map(toDetail),
        net: fromCents(net),
        expected: fromCents(running),
      };
    });
  },

  async addDetail(input: {
    cardId: string;
    month: string;
    label: string;
    category?: string;
    kind: BudgetKind;
    amount: string;
  }): Promise<void> {
    const amt = toCents(input.amount);
    if (amt <= 0) throw new Error('金额必须为正');
    const defLabel =
      input.kind === 'IN'
        ? '收入'
        : input.kind === 'OUT'
          ? '调出'
          : input.kind === 'TRANSFER_IN'
            ? '调入'
            : '支出';
    await db.budgetDetails.add({
      id: newId(),
      cardId: input.cardId,
      month: input.month,
      label: input.label.trim() || input.category || defLabel,
      category: input.category || undefined,
      kind: input.kind,
      amount: amt,
      createdAt: nowTs(),
    });
  },

  /** 预算层调出：本卡记一笔调出，对手储蓄卡同月记一笔调入（零和） */
  async transfer(input: {
    cardId: string;
    peerCardId: string;
    month: string;
    amount: string;
    note?: string;
  }): Promise<void> {
    if (!input.peerCardId) throw new Error('请选择对手储蓄卡');
    if (input.peerCardId === input.cardId) throw new Error('对手卡不能是自己');
    const amt = toCents(input.amount);
    if (amt <= 0) throw new Error('金额必须为正');
    const ts = nowTs();
    const [self, peer] = await Promise.all([db.cards.get(input.cardId), db.cards.get(input.peerCardId)]);
    await db.budgetDetails.bulkAdd([
      {
        id: newId(),
        cardId: input.cardId,
        month: input.month,
        label: input.note?.trim() || `调出→${peer?.name ?? ''}`,
        kind: 'OUT',
        peerCardId: input.peerCardId,
        amount: amt,
        createdAt: ts,
      },
      {
        id: newId(),
        cardId: input.peerCardId,
        month: input.month,
        label: input.note?.trim() || `调入←${self?.name ?? ''}`,
        kind: 'TRANSFER_IN',
        peerCardId: input.cardId,
        amount: amt,
        createdAt: ts,
      },
    ]);
  },

  /** 某储蓄卡某月的预期收入（只算 IN，不含调入） */
  async expectedIncome(cardId: string, month: string): Promise<Cents> {
    const rows = await db.budgetDetails.where('[cardId+month]').equals([cardId, month]).toArray();
    return rows.filter((r) => r.kind === 'IN').reduce((s, r) => s + r.amount, 0);
  },

  /** 某储蓄卡「截至某月」的累计预期收入（只算 IN） */
  async totalIncomeUpTo(cardId: string, month: string): Promise<Cents> {
    const rows = await db.budgetDetails.where('cardId').equals(cardId).toArray();
    return rows.filter((r) => r.kind === 'IN' && r.month <= month).reduce((s, r) => s + r.amount, 0);
  },

  async deleteDetail(id: string): Promise<void> {
    const row = await db.budgetDetails.get(id);
    if (!row) return;
    // 调出/调入是成对的零和记录：删一条，对手卡上配对的那条也级联删除
    if ((row.kind === 'OUT' || row.kind === 'TRANSFER_IN') && row.peerCardId) {
      const mateKind = row.kind === 'OUT' ? 'TRANSFER_IN' : 'OUT';
      const peers = await db.budgetDetails
        .where('[cardId+month]')
        .equals([row.peerCardId, row.month])
        .toArray();
      const mate = peers.find(
        (p) =>
          p.kind === mateKind &&
          p.peerCardId === row.cardId &&
          p.amount === row.amount &&
          p.createdAt === row.createdAt,
      );
      await db.transaction('rw', db.budgetDetails, async () => {
        await db.budgetDetails.delete(id);
        if (mate) await db.budgetDetails.delete(mate.id);
      });
      return;
    }
    await db.budgetDetails.delete(id);
  },

  /** 某储蓄卡当前月份视图：本月预期余额 + 本月细节 */
  async currentMonthView(
    cardId: string,
    month: string,
  ): Promise<{ month: string; expected: string; details: BudgetDetailDTO[] }> {
    const all = await this.months(cardId, [month]);
    const m = all.find((x) => x.month === month);
    return {
      month,
      expected: m ? m.expected : fromCents(await this.expectedBalance(cardId, month)),
      details: m ? m.details : [],
    };
  },

  /**
   * 各储蓄卡「截至某月」的预期余额（统计/对账用），与预算页显示的口径一致：
   * 期初 + Σ(收入 + 调入 − 调出 − 支出)。支出会扣减（参与储蓄-预算）。
   */
  async expectedBalance(cardId: string, month: string): Promise<Cents> {
    const [rows, initial] = await Promise.all([
      db.budgetDetails.where('cardId').equals(cardId).toArray(),
      initialOf(cardId),
    ]);
    let bal = initial;
    for (const r of rows) {
      if (r.month > month) continue;
      bal += sign(r.kind) * r.amount; // 收入/调入 +，调出/支出 −
    }
    return bal;
  },
};
