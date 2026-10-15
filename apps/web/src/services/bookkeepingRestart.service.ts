import { db, nowTs, type BookkeepingStartRow } from '../db/db';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { todayStr } from '../lib/format';
import { getBookkeepingStart } from './bookkeepingScope';

export const bookkeepingRestartService = {
  current: getBookkeepingStart,

  /** Explicitly confirmed reset only; new balances and budgets are entered manually afterwards. */
  async restart(): Promise<BookkeepingStartRow> {
    return db.transaction('rw', db.tables, async () => {
      const startDate = `${todayStr().slice(0, 7)}-01`;
      const start: BookkeepingStartRow = {
        id: 'active',
        // Asset month boundary, not a claim about balances on that month's first day.
        startDate,
        createdAt: nowTs(),
        manualOpening: true,
        consumptionHistory: true,
        fundOpeningConfirmed: false,
        openingFundPrepaid: 0,
        openingFundMarketValue: 0,
        openingSavings: [],
      };
      const keptTables = new Set([
        'cards', 'categories', 'transactions', 'bookkeepingStart', 'consumptionBudgets', 'savingsEntries',
      ]);
      // The downloaded file is the only recovery of the old asset ledger; no local archive.
      await Promise.all(db.tables.filter((table) => !keptTables.has(table.name)).map((table) => table.clear()));
      const startMonth = startDate.slice(0, 7);
      // These are consumption funding, not old asset balances or income. Future plans still clear.
      await db.consumptionBudgets.filter((row) => row.month > startMonth).delete();
      await db.savingsEntries.filter((row) => row.kind !== 'EXCESS' || row.month > startMonth).delete();
      await db.cards.toCollection().modify((card) => {
        card.initialBalance = 0;
        delete card.fundPrincipal;
        delete card.fundValue;
      });
      await db.transactions.filter((row) => row.type !== 'OUT').delete();
      await db.transactions.toCollection().modify((row) => {
        delete row.archivedForReconciliation;
        row.cardId = VIRTUAL_CONSUMPTION_CARD_ID;
        row.peerCardId = null;
        row.transferGroupId = null;
      });
      await db.bookkeepingStart.put(start);
      return start;
    });
  },
};
