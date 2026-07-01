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
