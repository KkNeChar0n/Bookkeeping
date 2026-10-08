import { db, newId, nowTs, type AssetTransferRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export interface AssetTransferDTO {
  id: string;
  date: string;
  sourceCardId: string;
  sourceCardName: string;
  targetKind: AssetTransferRow['targetKind'];
  targetCardId: string;
  targetCardName: string;
  amount: string;
  principalApplied: boolean;
  note: string | null;
  createdAt: number;
}

function todayISO(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function normalizeDate(value?: string): string {
  const date = (value || todayISO()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式不正确');
  return date;
}

async function toDTO(row: AssetTransferRow): Promise<AssetTransferDTO> {
  const [source, target] = await Promise.all([
    db.cards.get(row.sourceCardId),
    db.cards.get(row.targetCardId),
  ]);
  return {
    id: row.id,
    date: row.date,
    sourceCardId: row.sourceCardId,
    sourceCardName: source?.name ?? '已删除储蓄卡',
    targetKind: row.targetKind,
    targetCardId: row.targetCardId,
    targetCardName: target?.name ?? '已删除目标',
    amount: fromCents(row.amount),
    principalApplied: row.principalApplied === 1,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export const assetTransferService = {
  async create(input: {
    sourceCardId: string;
    targetCardId: string;
    targetKind: AssetTransferRow['targetKind'];
    amount: string;
    date?: string;
    note?: string;
    principalAlreadyIncluded?: boolean;
  }): Promise<AssetTransferDTO> {
    if (!input.sourceCardId || !input.targetCardId) throw new Error('请选择来源和去向');
    if (input.sourceCardId === input.targetCardId) throw new Error('来源和去向不能相同');
    const amount = toCents(input.amount);
    if (amount <= 0) throw new Error('划转金额必须为正');
    const date = normalizeDate(input.date);
    const principalApplied =
      input.targetKind === 'FUND_PRINCIPAL' && !input.principalAlreadyIncluded ? 1 : 0;
    const row: AssetTransferRow = {
      id: newId(),
      date,
      sourceCardId: input.sourceCardId,
      targetKind: input.targetKind,
      targetCardId: input.targetCardId,
      amount,
      principalApplied,
      note: input.note?.trim() || null,
      createdAt: nowTs(),
    };

    await db.transaction('rw', [db.cards, db.assetTransfers], async () => {
      const [source, target] = await Promise.all([
        db.cards.get(input.sourceCardId),
        db.cards.get(input.targetCardId),
      ]);
      if (!source || source.type !== 'SAVINGS') throw new Error('划转来源必须是储蓄卡');
      const expectedTargetType = input.targetKind === 'SAVINGS' ? 'SAVINGS' : 'FUND';
      if (!target || target.type !== expectedTargetType) {
        throw new Error(input.targetKind === 'SAVINGS' ? '划转目标必须是储蓄卡' : '划转目标必须是基金');
      }
      await db.assetTransfers.add(row);
      if (principalApplied === 1) {
        await db.cards.update(target.id, {
          fundPrincipal: (target.fundPrincipal ?? target.initialBalance) + amount,
        });
      }
    });
    return toDTO(row);
  },

  async list(filter: { cardId?: string; month?: string; fundCardId?: string } = {}) {
    let rows = await db.assetTransfers.toArray();
    if (filter.cardId) {
      rows = rows.filter(
        (row) => row.sourceCardId === filter.cardId || row.targetCardId === filter.cardId,
      );
    }
    if (filter.fundCardId) {
      rows = rows.filter(
        (row) =>
          row.targetKind === 'FUND_PRINCIPAL' && row.targetCardId === filter.fundCardId,
      );
    }
    if (filter.month) rows = rows.filter((row) => row.date.startsWith(`${filter.month}-`));
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return Promise.all(rows.map(toDTO));
  },

  async appliedPrincipalForFund(fundCardId: string): Promise<Cents> {
    const rows = await db.assetTransfers.where('targetCardId').equals(fundCardId).toArray();
    return rows
      .filter((row) => row.targetKind === 'FUND_PRINCIPAL' && row.principalApplied === 1)
      .reduce((sum, row) => sum + row.amount, 0);
  },

  async fundInvestmentUpTo(refMonth: string): Promise<Cents> {
    const rows = await db.assetTransfers.toArray();
    return rows
      .filter(
        (row) => row.targetKind === 'FUND_PRINCIPAL' && row.date.slice(0, 7) <= refMonth,
      )
      .reduce((sum, row) => sum + row.amount, 0);
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', [db.cards, db.assetTransfers], async () => {
      const row = await db.assetTransfers.get(id);
      if (!row) throw new Error('资产划转不存在');
      if (row.targetKind === 'FUND_PRINCIPAL' && row.principalApplied === 1) {
        const fund = await db.cards.get(row.targetCardId);
        if (!fund || fund.type !== 'FUND') throw new Error('目标基金不存在');
        const principal = fund.fundPrincipal ?? fund.initialBalance;
        if (principal < row.amount) throw new Error('当前基金本金不足，无法撤销这笔划转');
        await db.cards.update(fund.id, { fundPrincipal: principal - row.amount });
      }
      await db.assetTransfers.delete(id);
    });
  },
};
