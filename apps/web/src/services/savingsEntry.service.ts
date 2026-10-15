import { db, newId, nowTs } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';
import {
  assertActiveMonth,
  assertConsumptionMonth,
  getBookkeepingStart,
  hasConsumptionHistory,
} from './bookkeepingScope';

export type SavingsEntryKind = 'INCOME' | 'EXCESS';

export interface SavingsEntryDTO {
  id: string;
  kind: SavingsEntryKind;
  amount: string;
  note: string | null;
}

export const savingsEntryService = {
  /** 某卡某月的多笔条目（收入 + 超额支出） */
  async list(cardId: string, month: string): Promise<SavingsEntryDTO[]> {
    const start = await getBookkeepingStart();
    const historical = Boolean(start && month < start.startDate.slice(0, 7));
    if (historical && !hasConsumptionHistory(start)) return [];
    const rows = await db.savingsEntries.where('[cardId+month]').equals([cardId, month]).toArray();
    return rows
      .filter((row) => !historical || row.kind === 'EXCESS')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ id: r.id, kind: r.kind, amount: fromCents(r.amount), note: r.note ?? null }));
  },

  async add(input: {
    cardId: string;
    month: string;
    kind: SavingsEntryKind;
    amount: string;
    note?: string;
  }): Promise<void> {
    if (input.kind === 'EXCESS') await assertConsumptionMonth(input.month);
    else await assertActiveMonth(input.month);
    const amt = toCents(input.amount);
    if (amt <= 0) throw new Error('金额必须为正');
    await db.savingsEntries.add({
      id: newId(),
      cardId: input.cardId,
      month: input.month,
      kind: input.kind,
      amount: amt,
      note: input.note?.trim() || undefined,
      createdAt: nowTs(),
    });
  },

  async remove(id: string): Promise<void> {
    await db.savingsEntries.delete(id);
  },

  /** 覆盖式设置某卡某月某类型的金额（清掉该月该类型旧条目，按新值写一条；金额≤0则清空） */
  async setEntry(input: {
    cardId: string;
    month: string;
    kind: SavingsEntryKind;
    amount: string;
  }): Promise<void> {
    if (input.kind === 'EXCESS') await assertConsumptionMonth(input.month);
    else await assertActiveMonth(input.month);
    const rows = await db.savingsEntries
      .where('[cardId+month]')
      .equals([input.cardId, input.month])
      .toArray();
    const stale = rows.filter((r) => r.kind === input.kind).map((r) => r.id);
    if (stale.length) await db.savingsEntries.bulkDelete(stale);
    const amt = toCents(input.amount || '0');
    if (amt > 0) {
      await db.savingsEntries.add({
        id: newId(),
        cardId: input.cardId,
        month: input.month,
        kind: input.kind,
        amount: amt,
        note: undefined,
        createdAt: nowTs(),
      });
    }
  },

  /** 某周期(prefix)的实际收入合计（所有储蓄卡） */
  async actualIncome(prefix: string): Promise<Cents> {
    const [rows, start] = await Promise.all([
      db.savingsEntries.where('kind').equals('INCOME').toArray(),
      getBookkeepingStart(),
    ]);
    const startMonth = start?.startDate.slice(0, 7);
    return rows
      .filter((r) => r.month.startsWith(prefix) && (!startMonth || r.month >= startMonth))
      .reduce((s, r) => s + r.amount, 0);
  },

  /** 某卡截至某月的累计收入 */
  async cumIncomeUpTo(cardId: string, refMonth: string): Promise<Cents> {
    const [all, start] = await Promise.all([
      db.savingsEntries.where('cardId').equals(cardId).toArray(),
      getBookkeepingStart(),
    ]);
    const startMonth = start?.startDate.slice(0, 7);
    return all
      .filter((r) => r.kind === 'INCOME' && r.month <= refMonth && (!startMonth || r.month >= startMonth))
      .reduce((s, r) => s + r.amount, 0);
  },

  /** 截至某月的累计超额支出（所有储蓄卡）——对账里真正从储蓄流出的消费钱 */
  async cumExcessUpTo(refMonth: string): Promise<Cents> {
    const [rows, start] = await Promise.all([
      db.savingsEntries.where('kind').equals('EXCESS').toArray(),
      getBookkeepingStart(),
    ]);
    const startMonth = hasConsumptionHistory(start) ? undefined : start?.startDate.slice(0, 7);
    return rows
      .filter((r) => r.month <= refMonth && (!startMonth || r.month >= startMonth))
      .reduce((s, r) => s + r.amount, 0);
  },
};
