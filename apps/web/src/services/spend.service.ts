import { db, newId, nowTs, type SpendQuotaRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export interface SpendMonthView {
  cardId: string;
  cardName: string;
  month: string;
  quota: string; // 本月额度（未填为 '0.00'）
  hasQuota: boolean;
  spent: string; // 本月已消费
  remaining: string; // 额度 − 已消费
  overspent: boolean; // 已消费 > 额度
}

function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

async function spentInMonth(cardId: string, month: string): Promise<Cents> {
  const txs = await db.transactions.where('cardId').equals(cardId).toArray();
  return txs
    .filter((t) => t.type === 'OUT' && monthOf(t.date) === month)
    .reduce((s, t) => s + -t.amount, 0);
}

async function quotaOf(cardId: string, month: string): Promise<SpendQuotaRow | undefined> {
  return db.spendQuotas.where('[cardId+month]').equals([cardId, month]).first();
}

export const spendService = {
  /** 某消费卡在某月的额度/已消费/剩余/超支 */
  async monthView(cardId: string, month: string): Promise<SpendMonthView> {
    const card = await db.cards.get(cardId);
    const q = await quotaOf(cardId, month);
    const quota = q?.amount ?? 0;
    const spent = await spentInMonth(cardId, month);
    return {
      cardId,
      cardName: card?.name ?? '',
      month,
      quota: fromCents(quota),
      hasQuota: !!q,
      spent: fromCents(spent),
      remaining: fromCents(quota - spent),
      overspent: spent > quota,
    };
  },

  /** 所有消费卡在某月的视图 */
  async listForMonth(month: string): Promise<SpendMonthView[]> {
    const cards = (await db.cards.toArray())
      .filter((c) => c.type === 'SPEND')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    return Promise.all(cards.map((c) => this.monthView(c.id, month)));
  },

  /** 按周期(prefix: 'YYYY-MM' 或 'YYYY')汇总各消费卡：已消费/额度/超支 */
  async periodView(prefix: string): Promise<SpendMonthView[]> {
    const [cards, txs, quotas] = await Promise.all([
      db.cards.toArray(),
      db.transactions.toArray(),
      db.spendQuotas.toArray(),
    ]);
    const spendCards = cards
      .filter((c) => c.type === 'SPEND')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

    return spendCards.map((c) => {
      // 按月聚合，便于逐月算超支
      const spentByMonth = new Map<string, Cents>();
      for (const t of txs) {
        if (t.type !== 'OUT' || t.cardId !== c.id || !t.date.startsWith(prefix)) continue;
        const m = t.date.slice(0, 7);
        spentByMonth.set(m, (spentByMonth.get(m) ?? 0) + -t.amount);
      }
      const quotaByMonth = new Map<string, Cents>();
      for (const q of quotas) {
        if (q.cardId !== c.id || !q.month.startsWith(prefix)) continue;
        quotaByMonth.set(q.month, q.amount);
      }
      let spent = 0;
      let quota = 0;
      let overspend = 0;
      const months = new Set([...spentByMonth.keys(), ...quotaByMonth.keys()]);
      for (const m of months) {
        const s = spentByMonth.get(m) ?? 0;
        const q = quotaByMonth.get(m) ?? 0;
        spent += s;
        quota += q;
        overspend += Math.max(0, s - q);
      }
      return {
        cardId: c.id,
        cardName: c.name,
        month: prefix,
        quota: fromCents(quota),
        hasQuota: quotaByMonth.size > 0,
        spent: fromCents(spent),
        remaining: fromCents(quota - spent),
        overspent: overspend > 0,
      };
    });
  },

  /** 截至某月的累计消费额度（=计划消费，对账里当作计划流出资产） */
  async cumQuotaUpTo(refMonth: string): Promise<Cents> {
    const quotas = await db.spendQuotas.toArray();
    return quotas.filter((q) => q.month <= refMonth).reduce((s, q) => s + q.amount, 0);
  },

  /** 截至某月的累计消费超支（逐月 max(0, 花−额度) 之和） */
  async cumOverspendUpTo(refMonth: string): Promise<Cents> {
    const [txs, quotas] = await Promise.all([db.transactions.toArray(), db.spendQuotas.toArray()]);
    const key = (cardId: string, m: string) => `${cardId}|${m}`;
    const spentMap = new Map<string, Cents>();
    for (const t of txs) {
      if (t.type !== 'OUT') continue;
      const m = t.date.slice(0, 7);
      if (m > refMonth) continue;
      spentMap.set(key(t.cardId, m), (spentMap.get(key(t.cardId, m)) ?? 0) + -t.amount);
    }
    const quotaMap = new Map<string, Cents>();
    for (const q of quotas) {
      if (q.month > refMonth) continue;
      quotaMap.set(key(q.cardId, q.month), q.amount);
    }
    let total = 0;
    for (const [k, s] of spentMap) total += Math.max(0, s - (quotaMap.get(k) ?? 0));
    return total;
  },

  async setQuota(input: { cardId: string; month: string; amount: string }): Promise<void> {
    const amt = toCents(input.amount);
    const existing = await quotaOf(input.cardId, input.month);
    if (existing) await db.spendQuotas.update(existing.id, { amount: amt, updatedAt: nowTs() });
    else
      await db.spendQuotas.add({
        id: newId(),
        cardId: input.cardId,
        month: input.month,
        amount: amt,
        updatedAt: nowTs(),
      });
  },
};
