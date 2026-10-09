import Dexie, { type Table } from 'dexie';
import type { TxType } from '../domain/balance';
import { VIRTUAL_CONSUMPTION_CARD_ID, VIRTUAL_CONSUMPTION_CARD_NAME } from '../domain/consumption';
import { buildOrphanCleanupPlan } from '../domain/orphanCleanup';
import { aggregateLegacyFundSavings } from '../domain/fundSavings';

// 卡类型：储蓄卡 / 消费卡 / 基金
export type CardType = 'SAVINGS' | 'SPEND' | 'FUND';

// 本地存储实体：金额一律以“分”(整数)存储
export interface CardRow {
  id: string;
  name: string;
  type: CardType;
  initialBalance: number; // cents（储蓄卡用作预算基数）
  isDefault: number; // 0/1（Dexie 索引友好）
  sortOrder: number;
  createdAt: number;
  // 仅供 v21 以前的基金卡迁移读取。
  fundPrincipal?: number;
  fundValue?: number;
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

// 旧版通用资产划转，仅供 v17/v18 数据库迁移读取。
interface LegacyAssetTransferRow {
  id: string;
  date: string; // YYYY-MM-DD
  sourceCardId: string;
  targetKind: 'SAVINGS' | 'FUND_PRINCIPAL';
  targetCardId: string;
  amount: number; // cents（正数）
  savingsApplied: number; // 兼容字段；v18 起固定为 0，1 表示需要修复 v17 的重复扣减
  principalApplied: number; // 0/1；历史补录为 0，避免重复增加基金本金
  note: string | null;
  createdAt: number;
}

// 基金本金人工校准审计。
export interface FundPrincipalLogRow {
  id: string;
  fundCardId: string;
  previousAmount: number;
  amount: number;
  createdAt: number;
}

// 基金月度快照：同一基金同一月份唯一，同时保存当时本金与市值。
export interface FundMonthSnapshotRow {
  id: string;
  fundCardId: string;
  month: string; // YYYY-MM
  principal: number;
  value: number;
  updatedAt: number;
}

// 全局基金储蓄池：每月最后填写的当前市值与预充金额。
export interface FundSavingsSnapshotRow {
  month: string; // YYYY-MM，同时作为主键
  marketValue: number;
  prepaid: number;
  updatedAt: number;
}

// 基金资金卡在某月向基金注资；同次提交共享 batchId，可整批撤销。
export interface LegacyFundContributionRow {
  id: string;
  batchId: string;
  sourceCardId: string;
  fundCardId: string;
  month: string; // YYYY-MM
  amount: number; // cents（正数）
  createdAt: number;
}

// 基金月末市值快照；同一基金同一月份唯一。
export interface LegacyFundSnapshotRow {
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
  consumptionBudgets!: Table<ConsumptionBudgetRow, string>;
  fundPrincipalLogs!: Table<FundPrincipalLogRow, string>;
  fundMonthSnapshots!: Table<FundMonthSnapshotRow, string>;
  fundSavingsSnapshots!: Table<FundSavingsSnapshotRow, string>;

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
            }) satisfies LegacyFundSnapshotRow,
        );
        if (snapshots.length) await tx.table('fundSnapshots').bulkAdd(snapshots);
      });

    // v13：清理旧版删卡遗留的孤立记录，历史统计会从有效原始数据实时重算。
    this.version(13).upgrade(async (tx) => {
      const [
        cards,
        budgetSnapshots,
        budgetLines,
        transactions,
        budgetDetails,
        savingsActuals,
        savingsEntries,
        savingsLogs,
        initialBalanceLogs,
        consumptionBudgets,
        fundContributions,
        fundSnapshots,
      ] = await Promise.all([
        tx.table('cards').toArray() as Promise<CardRow[]>,
        tx.table('budgetSnapshots').toArray() as Promise<BudgetSnapshotRow[]>,
        tx.table('budgetLines').toArray() as Promise<BudgetLineRow[]>,
        tx.table('transactions').toArray() as Promise<TransactionRow[]>,
        tx.table('budgetDetails').toArray() as Promise<BudgetDetailRow[]>,
        tx.table('savingsActuals').toArray() as Promise<SavingsActualRow[]>,
        tx.table('savingsEntries').toArray() as Promise<SavingsEntryRow[]>,
        tx.table('savingsLogs').toArray() as Promise<SavingsLogRow[]>,
        tx.table('initialBalanceLogs').toArray() as Promise<InitialBalanceLogRow[]>,
        tx.table('consumptionBudgets').toArray() as Promise<ConsumptionBudgetRow[]>,
        tx.table('fundContributions').toArray() as Promise<LegacyFundContributionRow[]>,
        tx.table('fundSnapshots').toArray() as Promise<LegacyFundSnapshotRow[]>,
      ]);
      const plan = buildOrphanCleanupPlan({
        cards,
        budgetSnapshots,
        budgetLines,
        transactions,
        budgetDetails,
        savingsActuals,
        savingsEntries,
        savingsLogs,
        initialBalanceLogs,
        consumptionBudgets,
        fundContributions,
        fundSnapshots,
      });
      const remove = (tableName: string, ids: string[]) =>
        ids.length ? tx.table(tableName).bulkDelete(ids) : Promise.resolve();
      await Promise.all([
        remove('budgetLines', plan.budgetLineIds),
        remove('transactions', plan.transactionIds),
        remove('budgetDetails', plan.budgetDetailIds),
        remove('savingsActuals', plan.savingsActualIds),
        remove('savingsEntries', plan.savingsEntryIds),
        remove('savingsLogs', plan.savingsLogIds),
        remove('initialBalanceLogs', plan.initialBalanceLogIds),
        remove('consumptionBudgets', plan.consumptionBudgetIds),
        remove('fundContributions', plan.fundContributionIds),
        remove('fundSnapshots', plan.fundSnapshotIds),
      ]);
    });

    // v14：回退基金月度会计前，先把增量本金和最新市值固化回基金卡。
    this.version(14)
      .stores({
        cards: 'id, sortOrder, isDefault, type, savingsPurpose',
        fundContributions:
          'id, batchId, sourceCardId, fundCardId, month, [sourceCardId+month], [fundCardId+month]',
        fundSnapshots: 'id, &[fundCardId+month], fundCardId, month',
      })
      .upgrade(async (tx) => {
        type LegacyCardRow = CardRow & { savingsPurpose?: 'FUND_POOL' };
        const [contributions, snapshots] = await Promise.all([
          tx.table('fundContributions').toArray() as Promise<LegacyFundContributionRow[]>,
          tx.table('fundSnapshots').toArray() as Promise<LegacyFundSnapshotRow[]>,
        ]);
        const contributionsByFund = new Map<string, number>();
        for (const row of contributions) {
          contributionsByFund.set(
            row.fundCardId,
            (contributionsByFund.get(row.fundCardId) ?? 0) + row.amount,
          );
        }
        const latestSnapshotByFund = new Map<string, LegacyFundSnapshotRow>();
        for (const row of snapshots) {
          const current = latestSnapshotByFund.get(row.fundCardId);
          if (
            !current ||
            row.month > current.month ||
            (row.month === current.month && row.updatedAt > current.updatedAt)
          ) {
            latestSnapshotByFund.set(row.fundCardId, row);
          }
        }
        await tx
          .table('cards')
          .toCollection()
          .modify((card: LegacyCardRow) => {
            if (card.type === 'FUND') {
              card.fundPrincipal =
                (card.fundPrincipal ?? card.initialBalance) +
                (contributionsByFund.get(card.id) ?? 0);
              const latest = latestSnapshotByFund.get(card.id);
              if (latest) card.fundValue = latest.value;
            }
            delete card.savingsPurpose;
          });
      });

    // v15：月度基金数据已折叠为卡片最终值，移除专用索引和两张旧表。
    this.version(15).stores({
      cards: 'id, sortOrder, isDefault, type',
      fundContributions: null,
      fundSnapshots: null,
    });

    // v16：通用资产划转与基金本金人工校准审计。
    this.version(16).stores({
      assetTransfers:
        'id, date, sourceCardId, targetCardId, targetKind, [sourceCardId+date], [targetCardId+date]',
      fundPrincipalLogs: 'id, fundCardId, [fundCardId+createdAt], createdAt',
    });

    // v17：兼容旧资产划转记录的储蓄余额应用标记。
    // 新安装或从 v16 直接升级到当前版本时不再执行曾发布过的余额联动；
    // 已经运行过旧 v17 的数据库会保留 savingsApplied=1，交由 v18 恢复来源余额。
    this.version(17)
      .stores({
        assetTransfers:
          'id, date, sourceCardId, targetCardId, targetKind, [sourceCardId+date], [targetCardId+date]',
      })
      .upgrade(async (tx) => {
        const transferTable = tx.table('assetTransfers');
        await transferTable.toCollection().modify((row: LegacyAssetTransferRow) => {
          if (row.savingsApplied === undefined) row.savingsApplied = 0;
        });
      });

    // v18：月度储蓄金额是用户填写的真实快照，撤销 v17 对来源卡造成的重复扣减。
    // 接收卡现有金额保持不变，避免覆盖用户升级后已经确认或继续使用的数据。
    this.version(18)
      .stores({
        assetTransfers:
          'id, date, sourceCardId, targetCardId, targetKind, [sourceCardId+date], [targetCardId+date]',
      })
      .upgrade(async (tx) => {
        const transferTable = tx.table('assetTransfers');
        const actualTable = tx.table('savingsActuals');
        const applied = ((await transferTable.toArray()) as LegacyAssetTransferRow[]).filter(
          (row) => row.savingsApplied === 1,
        );
        for (const row of applied) {
          const month = row.date.slice(0, 7);
          const actual = (await actualTable
            .where('[cardId+month]')
            .equals([row.sourceCardId, month])
            .first()) as SavingsActualRow | undefined;
          if (actual) {
            await actualTable.update(actual.id, {
              amount: actual.amount + row.amount,
              updatedAt: Date.now(),
            });
          }
          await transferTable.update(row.id, { savingsApplied: 0 });
        }
      });

    // v19：基金本金/市值按月留存；迁移时只为当前月保存现有最终值。
    this.version(19)
      .stores({
        fundMonthSnapshots: 'id, &[fundCardId+month], fundCardId, month',
      })
      .upgrade(async (tx) => {
        const cards = (await tx.table('cards').toArray()) as CardRow[];
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const snapshots: FundMonthSnapshotRow[] = cards
          .filter((card) => card.type === 'FUND')
          .map((card) => ({
            id: crypto.randomUUID(),
            fundCardId: card.id,
            month,
            principal: card.fundPrincipal ?? card.initialBalance,
            value: card.fundValue ?? card.initialBalance,
            updatedAt: Date.now(),
          }));
        if (snapshots.length) await tx.table('fundMonthSnapshots').bulkAdd(snapshots);
      });

    // v20：真实月度余额和基金快照成为唯一事实来源，移除通用资产划转台账。
    // 已确认的储蓄余额、基金本金/市值与月度快照全部保持不变。
    this.version(20).stores({
      assetTransfers: null,
    });

    // v21：把逐只基金聚合为全局的市值和预充金额，并清理基金卡关联数据。
    this.version(21)
      .stores({
        fundSavingsSnapshots: '&month',
      })
      .upgrade(async (tx) => {
        const cards = (await tx.table('cards').toArray()) as CardRow[];
        const funds = cards.filter((card) => card.type === 'FUND');
        const oldSnapshots = (await tx
          .table('fundMonthSnapshots')
          .toArray()) as FundMonthSnapshotRow[];
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const aggregated = aggregateLegacyFundSavings(funds, oldSnapshots, month, Date.now());
        if (aggregated.length) await tx.table('fundSavingsSnapshots').bulkPut(aggregated);

        const fundIds = new Set(funds.map((card) => card.id));
        if (!fundIds.size) return;
        const transactions = (await tx.table('transactions').toArray()) as TransactionRow[];
        const affectedGroups = new Set(
          transactions
            .filter((row) => fundIds.has(row.cardId) || (!!row.peerCardId && fundIds.has(row.peerCardId)))
            .map((row) => row.transferGroupId)
            .filter((group): group is string => !!group),
        );
        const transactionIds = transactions
          .filter(
            (row) =>
              fundIds.has(row.cardId) ||
              (!!row.peerCardId && fundIds.has(row.peerCardId)) ||
              (!!row.transferGroupId && affectedGroups.has(row.transferGroupId)),
          )
          .map((row) => row.id);
        const budgetDetails = (await tx.table('budgetDetails').toArray()) as BudgetDetailRow[];
        const budgetDetailIds = budgetDetails
          .filter(
            (row) => fundIds.has(row.cardId) || (!!row.peerCardId && fundIds.has(row.peerCardId)),
          )
          .map((row) => row.id);
        const deleteByCardId = async (tableName: string) => {
          for (const id of fundIds) await tx.table(tableName).where('cardId').equals(id).delete();
        };
        await Promise.all([
          transactionIds.length
            ? tx.table('transactions').bulkDelete(transactionIds)
            : Promise.resolve(),
          budgetDetailIds.length
            ? tx.table('budgetDetails').bulkDelete(budgetDetailIds)
            : Promise.resolve(),
          deleteByCardId('budgetLines'),
          deleteByCardId('savingsActuals'),
          deleteByCardId('savingsEntries'),
          deleteByCardId('savingsLogs'),
          deleteByCardId('initialBalanceLogs'),
          ...[...fundIds].map((id) =>
            tx.table('consumptionBudgets').where('savingsCardId').equals(id).delete(),
          ),
        ]);
        await tx.table('cards').bulkDelete([...fundIds]);
      });

    // v22：聚合完成后移除旧本金审计与逐只基金月度快照。
    this.version(22).stores({
      fundPrincipalLogs: null,
      fundMonthSnapshots: null,
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
