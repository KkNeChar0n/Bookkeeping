import { db, newId, nowTs, type FundContributionRow } from '../db/db';
import { fromCents, toCents, type Cents } from '../domain/money';

export interface FundPositionDTO {
  fundCardId: string;
  fundName: string;
  month: string;
  valueMonth: string | null;
  value: string | null;
  principal: string;
  profit: string | null;
  profitPct: number | null;
}

export interface FundContributionBatchDTO {
  batchId: string;
  month: string;
  total: string;
  createdAt: number;
  items: Array<{ fundCardId: string; fundName: string; amount: string }>;
}

export interface FundPoolMonthDTO {
  sourceCardId: string;
  month: string;
  startingAmount: string | null;
  allocated: string;
  available: string | null;
  batches: FundContributionBatchDTO[];
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function pct(profit: Cents, principal: Cents): number | null {
  return principal === 0 ? null : Math.round((profit / principal) * 10000) / 100;
}

async function ensureFundPool(cardId: string) {
  const card = await db.cards.get(cardId);
  if (!card || card.type !== 'SAVINGS' || card.savingsPurpose !== 'FUND_POOL') {
    throw new Error('基金资金卡不存在');
  }
  return card;
}

async function contributionRowsForSource(sourceCardId: string, month?: string) {
  const rows = await db.fundContributions.where('sourceCardId').equals(sourceCardId).toArray();
  return month ? rows.filter((row) => row.month === month) : rows;
}

function sumRows(rows: FundContributionRow[]): Cents {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export const fundService = {
  async poolCard() {
    return (await db.cards.toArray()).find(
      (card) => card.type === 'SAVINGS' && card.savingsPurpose === 'FUND_POOL',
    );
  },

  async poolMonth(sourceCardId: string, month: string): Promise<FundPoolMonthDTO> {
    await ensureFundPool(sourceCardId);
    const [actual, contributions, cards] = await Promise.all([
      db.savingsActuals.where('[cardId+month]').equals([sourceCardId, month]).first(),
      contributionRowsForSource(sourceCardId, month),
      db.cards.toArray(),
    ]);
    const fundNames = new Map(cards.map((card) => [card.id, card.name]));
    const fundOrder = new Map(cards.map((card) => [card.id, card.sortOrder]));
    const groups = new Map<string, FundContributionRow[]>();
    for (const row of contributions) {
      const group = groups.get(row.batchId) ?? [];
      group.push(row);
      groups.set(row.batchId, group);
    }
    const allocated = sumRows(contributions);
    const batches = [...groups.entries()]
      .map(([batchId, rows]) => ({
        batchId,
        month,
        total: fromCents(sumRows(rows)),
        createdAt: Math.max(...rows.map((row) => row.createdAt)),
        items: rows
          .sort((a, b) => (fundOrder.get(a.fundCardId) ?? 0) - (fundOrder.get(b.fundCardId) ?? 0))
          .map((row) => ({
            fundCardId: row.fundCardId,
            fundName: fundNames.get(row.fundCardId) ?? '已删除基金',
            amount: fromCents(row.amount),
          })),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    return {
      sourceCardId,
      month,
      startingAmount: actual ? fromCents(actual.amount) : null,
      allocated: fromCents(allocated),
      available: actual ? fromCents(actual.amount - allocated) : null,
      batches,
    };
  },

  async createContributionBatch(input: {
    sourceCardId: string;
    month: string;
    allocations: Array<{ fundCardId: string; amount: string }>;
  }): Promise<{ batchId: string }> {
    if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error('月份格式不正确');
    const normalized = input.allocations
      .map((row) => ({ fundCardId: row.fundCardId, amount: toCents(row.amount || '0') }))
      .filter((row) => row.amount > 0);
    if (!normalized.length) throw new Error('请至少填写一笔注资金额');
    const duplicate = new Set<string>();
    for (const row of normalized) {
      if (duplicate.has(row.fundCardId)) throw new Error('同一批次不能重复选择基金');
      duplicate.add(row.fundCardId);
    }
    const batchId = newId();
    await db.transaction('rw', [db.cards, db.savingsActuals, db.fundContributions], async () => {
      await ensureFundPool(input.sourceCardId);
      const funds = await db.cards.bulkGet(normalized.map((row) => row.fundCardId));
      if (funds.some((fund) => !fund || fund.type !== 'FUND'))
        throw new Error('注资目标必须是基金');
      const actual = await db.savingsActuals
        .where('[cardId+month]')
        .equals([input.sourceCardId, input.month])
        .first();
      if (!actual) throw new Error('请先填写该月月初可投资金额');
      const existing = await contributionRowsForSource(input.sourceCardId, input.month);
      const total = normalized.reduce((sum, row) => sum + row.amount, 0);
      if (sumRows(existing) + total > actual.amount) throw new Error('注资合计超过当月可用金额');
      const createdAt = nowTs();
      await db.fundContributions.bulkAdd(
        normalized.map((row) => ({
          id: newId(),
          batchId,
          sourceCardId: input.sourceCardId,
          fundCardId: row.fundCardId,
          month: input.month,
          amount: row.amount,
          createdAt,
        })),
      );
    });
    return { batchId };
  },

  async undoContributionBatch(batchId: string): Promise<void> {
    const rows = await db.fundContributions.where('batchId').equals(batchId).toArray();
    if (!rows.length) throw new Error('注资批次不存在');
    await db.transaction('rw', db.fundContributions, async () => {
      await db.fundContributions.where('batchId').equals(batchId).delete();
    });
  },

  async contributedToFund(fundCardId: string, upToMonth: string): Promise<Cents> {
    const rows = await db.fundContributions.where('fundCardId').equals(fundCardId).toArray();
    return rows.filter((row) => row.month <= upToMonth).reduce((sum, row) => sum + row.amount, 0);
  },

  async contributedFromPool(
    sourceCardId: string,
    upToMonth: string,
    fromMonth?: string,
  ): Promise<Cents> {
    const rows = await contributionRowsForSource(sourceCardId);
    return rows
      .filter((row) => row.month <= upToMonth && (!fromMonth || row.month >= fromMonth))
      .reduce((sum, row) => sum + row.amount, 0);
  },

  async principalAsOf(fundCardId: string, month: string): Promise<Cents> {
    const fund = await db.cards.get(fundCardId);
    if (!fund || fund.type !== 'FUND') throw new Error('基金不存在');
    return (
      (fund.fundPrincipal ?? fund.initialBalance) +
      (await this.contributedToFund(fundCardId, month))
    );
  },

  async setMonthEndValue(input: {
    fundCardId: string;
    month: string;
    value: string;
  }): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error('月份格式不正确');
    const value = toCents(input.value);
    if (value < 0) throw new Error('市值不能为负数');
    await db.transaction('rw', [db.cards, db.fundSnapshots], async () => {
      const fund = await db.cards.get(input.fundCardId);
      if (!fund || fund.type !== 'FUND') throw new Error('基金不存在');
      const existing = await db.fundSnapshots
        .where('[fundCardId+month]')
        .equals([input.fundCardId, input.month])
        .first();
      const updatedAt = nowTs();
      if (existing) {
        await db.fundSnapshots.update(existing.id, { value, updatedAt });
      } else {
        await db.fundSnapshots.add({
          id: newId(),
          fundCardId: input.fundCardId,
          month: input.month,
          value,
          updatedAt,
        });
      }
      const latest = (
        await db.fundSnapshots.where('fundCardId').equals(input.fundCardId).toArray()
      ).sort((a, b) => b.month.localeCompare(a.month))[0];
      if (latest) await db.cards.update(input.fundCardId, { fundValue: latest.value });
    });
  },

  async snapshotHistory(fundCardId: string) {
    const rows = await db.fundSnapshots.where('fundCardId').equals(fundCardId).toArray();
    return rows
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((row) => ({ month: row.month, value: fromCents(row.value), updatedAt: row.updatedAt }));
  },

  async positionAsOf(fundCardId: string, month = currentMonth()): Promise<FundPositionDTO> {
    const fund = await db.cards.get(fundCardId);
    if (!fund || fund.type !== 'FUND') throw new Error('基金不存在');
    const [principal, snapshots] = await Promise.all([
      this.principalAsOf(fundCardId, month),
      db.fundSnapshots.where('fundCardId').equals(fundCardId).toArray(),
    ]);
    const snapshot = snapshots
      .filter((row) => row.month <= month)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const profit = snapshot ? snapshot.value - principal : null;
    return {
      fundCardId,
      fundName: fund.name,
      month,
      valueMonth: snapshot?.month ?? null,
      value: snapshot ? fromCents(snapshot.value) : null,
      principal: fromCents(principal),
      profit: profit === null ? null : fromCents(profit),
      profitPct: profit === null ? null : pct(profit, principal),
    };
  },

  async positionsAsOf(month: string): Promise<FundPositionDTO[]> {
    const funds = (await db.cards.toArray())
      .filter((card) => card.type === 'FUND')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    return Promise.all(funds.map((fund) => this.positionAsOf(fund.id, month)));
  },

  async periodPositions(prefix: string) {
    if (prefix.length === 7)
      return [{ month: prefix, positions: await this.positionsAsOf(prefix) }];
    const snapshotRows = await db.fundSnapshots.where('month').startsWith(`${prefix}-`).toArray();
    const contributionRows = await db.fundContributions
      .where('month')
      .startsWith(`${prefix}-`)
      .toArray();
    const months = [
      ...new Set([...snapshotRows, ...contributionRows].map((row) => row.month)),
    ].sort();
    return Promise.all(
      months.map(async (month) => ({ month, positions: await this.positionsAsOf(month) })),
    );
  },
};
