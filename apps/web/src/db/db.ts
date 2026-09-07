import Dexie, { type Table } from 'dexie';
import type { TxType } from '../domain/balance';
import { VIRTUAL_CONSUMPTION_CARD_ID, VIRTUAL_CONSUMPTION_CARD_NAME } from '../domain/consumption';

// 卡类型：储蓄卡 / 消费卡 / 基金
export type CardType = 'SAVINGS' | 'SPEND' | 'FUND';
export type SavingsPurpose = 'FUND_POOL';

// 本地存储实体：金额一律以“分”(整数)存储
export interface CardRow {
  id: string;
  name: string;
  type: CardType;
  initialBalance: number; // cents（储蓄卡用作预算基数）
  isDefault: number; // 0/1（Dexie 索引友好）
  sortOrder: number;
  createdAt: number;
  savingsPurpose?: SavingsPurpose; // 储蓄卡专用用途；FUND_POOL=基金资金卡
  // 基金专用：直接填的两个数（分）
  fundPrincipal?: number; // 累计投入本金
  fundValue?: number; // 当前市值
}

export interface BudgetSnapshotRow {
  id: string;
  date: string; // YYYY-MM-DD
  note: string | null;
  createdAt: number;
}

export interface BudgetLineRow {
  id: string;
  snapshotId: string;
  cardId: string;
  inAmount: number; // cents
  outAmount: number; // cents
}

export interface TransactionRow {
  id: string;
  cardId: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  amount: number; // cents, signed
  category: string | null;
  note: string | null;
  peerCardId: string | null;
  transferGroupId: string | null;
  createdAt: number;
}

// 预算细节（储蓄卡·按月）：计划收入 / 调出 / 支出
// IN=收入(+)  OUT=调出(−, 钱去别处仍是资产)  EXPENSE=支出(−, 钱花掉消失, 不进储蓄-预算统计)
// IN=收入(+)  TRANSFER_IN=调入(+)  OUT=调出(−)  EXPENSE=支出(−,花掉消失)
export interface BudgetDetailRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  label: string; // 备注
  category?: string; // 收支类型（收入/支出用）
  kind: 'IN' | 'OUT' | 'EXPENSE' | 'TRANSFER_IN';
  peerCardId?: string; // 调出/调入 的对手储蓄卡
  amount: number; // cents（正数）
  createdAt: number;
}

// 每月真实储蓄额（储蓄卡·每月1号一个数）
export interface SavingsActualRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number; // cents（真实储蓄余额）
  income?: number; // cents（旧版单条收入，已迁移到 savingsEntries）
  updatedAt: number;
}

// 储蓄卡按月的多笔条目：收入 / 超额支出（充给消费卡的额外钱）
export interface SavingsEntryRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  kind: 'INCOME' | 'EXCESS';
  amount: number; // cents
  note?: string;
  createdAt: number;
}

// 储蓄卡修改流水（审计日志）：每次把某项改成某值都留一条，带时间戳
export interface SavingsLogRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  field: 'AMOUNT' | 'INCOME' | 'EXCESS';
  amount: number; // cents（改成的新值）
  createdAt: number; // 时间戳
}

// 卡片期初余额修改流水（全局审计日志，不从属于某个月）
export interface InitialBalanceLogRow {
  id: string;
  cardId: string;
  previousAmount: number; // cents（修改前）
  amount: number; // cents（修改后）
  createdAt: number; // 时间戳
}

// 基金资金卡在某月向基金注资；同次提交共享 batchId，可整批撤销。
export interface FundContributionRow {
  id: string;
  batchId: string;
  sourceCardId: string;
  fundCardId: string;
  month: string; // YYYY-MM
  amount: number; // cents（正数）
  createdAt: number;
}

// 基金月末市值快照；同一基金同一月份唯一。
export interface FundSnapshotRow {
  id: string;
  fundCardId: string;
  month: string; // YYYY-MM
  value: number; // cents
  updatedAt: number;
}

// 旧版消费卡每月额度，仅用于旧备份/迁移的输入类型。
export interface SpendQuotaRow {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number; // cents
  updatedAt: number;
}

// 本月消费预算：一张储蓄卡对全局虚拟消费账户的当月预算贡献。
export interface ConsumptionBudgetRow {
  id: string;
  savingsCardId: string; // 出资的储蓄卡
  month: string; // YYYY-MM
  amount: number; // cents（本月消费预算）
  updatedAt: number;
}

// 收支类型（可编辑）
export interface CategoryRow {
  id: string;
  kind: 'income' | 'expense';
  name: string;
  sortOrder: number;
  createdAt: number;
}

export class BookkeepingDB extends Dexie {
  cards!: Table<CardRow, string>;
  budgetSnapshots!: Table<BudgetSnapshotRow, string>;
  budgetLines!: Table<BudgetLineRow, string>;
  transactions!: Table<TransactionRow, string>;
  budgetDetails!: Table<BudgetDetailRow, string>;
  savingsActuals!: Table<SavingsActualRow, string>;
  categories!: Table<CategoryRow, string>;
  savingsEntries!: Table<SavingsEntryRow, string>;
  savingsLogs!: Table<SavingsLogRow, string>;
  initialBalanceLogs!: Table<InitialBalanceLogRow, string>;
  fundContributions!: Table<FundContributionRow, string>;
  fundSnapshots!: Table<FundSnapshotRow, string>;
  consumptionBudgets!: Table<ConsumptionBudgetRow, string>;

  constructor(name = 'bookkeeping') {
    super(name);
    this.version(1).stores({
      cards: 'id, sortOrder, isDefault',
      budgetSnapshots: 'id, &date',
      budgetLines: 'id, &[snapshotId+cardId], snapshotId, cardId',
      transactions: 'id, cardId, date, type, transferGroupId, [cardId+date]',
    });
    // v2：卡片新增 type 字段，旧数据默认按储蓄卡处理
    this.version(2)
      .stores({ cards: 'id, sortOrder, isDefault, type' })
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .toCollection()
          .modify((c: CardRow) => {
            if (!c.type) c.type = 'SAVINGS';
          });
      });
    // v3：储蓄卡按月预算细节 + 每月真实储蓄额
    this.version(3).stores({
      budgetDetails: 'id, cardId, [cardId+month]',
      savingsActuals: 'id, &[cardId+month], cardId',
    });
    // v4：消费卡每月额度
    this.version(4).stores({
      spendQuotas: 'id, &[cardId+month], cardId',
    });
    // v5：可编辑收支类型
    this.version(5).stores({
      categories: 'id, kind',
    });
    // v6：储蓄卡多笔收入/超额支出；把旧的单条 income 迁移过来
    this.version(6)
      .stores({ savingsEntries: 'id, cardId, [cardId+month], kind' })
      .upgrade(async (tx) => {
        const rows = (await tx.table('savingsActuals').toArray()) as SavingsActualRow[];
        const entries: SavingsEntryRow[] = [];
        for (const r of rows) {
          if (r.income && r.income > 0) {
            entries.push({
              id: crypto.randomUUID(),
              cardId: r.cardId,
              month: r.month,
              kind: 'INCOME',
              amount: r.income,
              createdAt: r.updatedAt,
            });
          }
        }
        if (entries.length) await tx.table('savingsEntries').bulkAdd(entries);
      });
    // v7：储蓄卡修改流水（审计日志）
    this.version(7).stores({
      savingsLogs: 'id, cardId, [cardId+month], createdAt',
    });
    // v8：本月消费预算（储蓄卡→消费卡）。把旧的 spendQuotas 迁移过来，出资卡默认取默认储蓄卡
    this.version(8)
      .stores({
        consumptionBudgets:
          'id, &[savingsCardId+consumptionCardId+month], [savingsCardId+month], [consumptionCardId+month], month',
      })
      .upgrade(async (tx) => {
        const cards = (await tx.table('cards').toArray()) as CardRow[];
        const savings = cards.filter((c) => c.type === 'SAVINGS');
        const funder =
          savings.find((c) => c.isDefault) ??
          savings.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)[0];
        if (!funder) return;
        const quotas = (await tx.table('spendQuotas').toArray()) as SpendQuotaRow[];
        const rows = quotas.map((q) => ({
          id: crypto.randomUUID(),
          savingsCardId: funder.id,
          consumptionCardId: q.cardId,
          month: q.month,
          amount: q.amount,
          updatedAt: q.updatedAt,
        }));
        if (rows.length) await tx.table('consumptionBudgets').bulkAdd(rows);
      });

    // v9：消费账户变为唯一的系统虚拟账户；预算按“储蓄卡+月份”聚合。
    this.version(9)
      .stores({
        spendQuotas: null,
        // Keep this index non-unique while the upgrade callback merges old per-consumption-card rows.
        consumptionBudgets: 'id, [savingsCardId+month], month',
      })
      .upgrade(async (tx) => {
        const cards = (await tx.table('cards').toArray()) as CardRow[];
        const oldSpendIds = new Set(
          cards.filter((card) => card.type === 'SPEND').map((card) => card.id),
        );
        const savings = cards
          .filter((card) => card.type === 'SAVINGS')
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
        const defaultSavings = savings.find((card) => card.isDefault) ?? savings[0];
        const oldBudgets = (await tx
          .table('consumptionBudgets')
          .toArray()) as ConsumptionBudgetRow[];
        const legacyQuotas = (await tx.table('spendQuotas').toArray()) as SpendQuotaRow[];

        const aggregated = new Map<string, ConsumptionBudgetRow>();
        const monthsWithBudget = new Set<string>();
        for (const row of oldBudgets) {
          monthsWithBudget.add(row.month);
          const key = `${row.savingsCardId}|${row.month}`;
          const found = aggregated.get(key);
          if (found) {
            found.amount += row.amount;
            found.updatedAt = Math.max(found.updatedAt, row.updatedAt);
          } else {
            aggregated.set(key, {
              id: row.id,
              savingsCardId: row.savingsCardId,
              month: row.month,
              amount: row.amount,
              updatedAt: row.updatedAt,
            });
          }
        }
        if (defaultSavings) {
          const quotaByMonth = new Map<string, { amount: number; updatedAt: number }>();
          for (const quota of legacyQuotas) {
            if (monthsWithBudget.has(quota.month)) continue;
            const found = quotaByMonth.get(quota.month) ?? { amount: 0, updatedAt: 0 };
            found.amount += quota.amount;
            found.updatedAt = Math.max(found.updatedAt, quota.updatedAt);
            quotaByMonth.set(quota.month, found);
          }
          for (const [month, value] of quotaByMonth) {
            aggregated.set(`${defaultSavings.id}|${month}`, {
              id: crypto.randomUUID(),
              savingsCardId: defaultSavings.id,
              month,
              amount: value.amount,
              updatedAt: value.updatedAt,
            });
          }
        }

        await tx.table('consumptionBudgets').clear();
        if (aggregated.size) {
          await tx.table('consumptionBudgets').bulkAdd([...aggregated.values()]);
        }
        await tx
          .table('transactions')
          .toCollection()
          .modify((row: TransactionRow) => {
            if (oldSpendIds.has(row.cardId)) row.cardId = VIRTUAL_CONSUMPTION_CARD_ID;
          });
        await tx.table('cards').bulkDelete([...oldSpendIds]);
        await tx.table('cards').put({
          id: VIRTUAL_CONSUMPTION_CARD_ID,
          name: VIRTUAL_CONSUMPTION_CARD_NAME,
          type: 'SPEND',
          initialBalance: 0,
          isDefault: 0,
          sortOrder: -1,
          createdAt: 0,
        } satisfies CardRow);
      });
    // Add uniqueness only after v9 has collapsed possible duplicates.
    this.version(10).stores({
      consumptionBudgets: 'id, &[savingsCardId+month], month',
    });

    // v11：期初余额每次实际变更都保留修改前后金额与时间戳。
    this.version(11).stores({
      initialBalanceLogs: 'id, cardId, [cardId+createdAt], createdAt',
    });

    // v12：基金资金卡、可撤销注资和基金月末市值快照。
    this.version(12)
      .stores({
        cards: 'id, sortOrder, isDefault, type, savingsPurpose',
        fundContributions:
          'id, batchId, sourceCardId, fundCardId, month, [sourceCardId+month], [fundCardId+month]',
        fundSnapshots: 'id, &[fundCardId+month], fundCardId, month',
      })
      .upgrade(async (tx) => {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const funds = ((await tx.table('cards').toArray()) as CardRow[]).filter(
          (card) => card.type === 'FUND',
        );
        const snapshots = funds.map(
          (fund) =>
            ({
              id: crypto.randomUUID(),
              fundCardId: fund.id,
              month,
              value: fund.fundValue ?? fund.initialBalance,
              updatedAt: Date.now(),
            }) satisfies FundSnapshotRow,
        );
        if (snapshots.length) await tx.table('fundSnapshots').bulkAdd(snapshots);
      });

    // Fresh installs skip upgrade callbacks, so seed the same internal account on populate.
    this.on('populate', () =>
      this.cards.add({
        id: VIRTUAL_CONSUMPTION_CARD_ID,
        name: VIRTUAL_CONSUMPTION_CARD_NAME,
        type: 'SPEND',
        initialBalance: 0,
        isDefault: 0,
        sortOrder: -1,
        createdAt: 0,
      }),
    );
  }
}

export const db = new BookkeepingDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowTs(): number {
  return Date.now();
}
