import { db, type BookkeepingStartRow, type TransactionRow } from '../db/db';

/** A missing start is the legacy ledger, whose calculations must remain unchanged. */
export async function getBookkeepingStart(): Promise<BookkeepingStartRow | null> {
  return (await db.bookkeepingStart.get('active')) ?? null;
}

/** Consumption history survives a manual asset restart only after it was preserved or restored. */
export function hasConsumptionHistory(start: BookkeepingStartRow | null): boolean {
  return start?.manualOpening === true && start.consumptionHistory === true;
}

export function isActiveConsumption(
  row: TransactionRow,
  start: BookkeepingStartRow | null,
): boolean {
  if (!start) return true;
  if (hasConsumptionHistory(start)) return true;
  if (start.manualOpening) return row.date >= start.startDate;
  return !row.archivedForReconciliation && row.date >= start.startDate;
}

/** Consumption funding may still be maintained before the new asset ledger's start. */
export async function assertConsumptionMonth(month: string): Promise<void> {
  if (hasConsumptionHistory(await getBookkeepingStart())) return;
  await assertActiveMonth(month);
}

/** Asset fields cannot re-open deleted historical months. */
export async function assertActiveMonth(month: string): Promise<void> {
  const start = await getBookkeepingStart();
  if (start && month < start.startDate.slice(0, 7)) {
    throw new Error(`新账从 ${start.startDate} 起记录；此前资产账本已${start.manualOpening ? '删除' : '归档'}，${hasConsumptionHistory(start) ? '仅可维护历史消费资金，不能恢复旧资产记录' : '仅可查询历史消费'}。`);
  }
}
