export interface LegacyFundCardValue {
  id: string;
  initialBalance: number;
  fundValue?: number;
}

export interface LegacyFundMonthValue {
  fundCardId: string;
  month: string;
  value: number;
  updatedAt: number;
}

export interface FundSavingsValue {
  month: string;
  marketValue: number;
  prepaid: number;
  updatedAt: number;
}

export const isValidMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

/** Collapse legacy per-fund market values into the new global monthly savings pool. */
export function aggregateLegacyFundSavings(
  cards: readonly LegacyFundCardValue[],
  snapshots: readonly LegacyFundMonthValue[],
  fallbackMonth: string,
  fallbackUpdatedAt: number,
): FundSavingsValue[] {
  if (!cards.length || !isValidMonth(fallbackMonth)) return [];
  const cardIds = new Set(cards.map((card) => card.id));
  const latestByFundMonth = new Map<string, LegacyFundMonthValue>();
  for (const row of snapshots) {
    if (
      !cardIds.has(row.fundCardId) ||
      !isValidMonth(row.month) ||
      !Number.isSafeInteger(row.value) ||
      row.value < 0
    ) {
      continue;
    }
    const key = `${row.fundCardId}|${row.month}`;
    const found = latestByFundMonth.get(key);
    if (!found || row.updatedAt >= found.updatedAt) latestByFundMonth.set(key, row);
  }

  const validSnapshots = [...latestByFundMonth.values()];
  const months = new Set(validSnapshots.map((row) => row.month));
  months.add(fallbackMonth);
  return [...months]
    .sort()
    .map((month) => {
      let marketValue = 0;
      let updatedAt = fallbackUpdatedAt;
      for (const card of cards) {
        if (month === fallbackMonth) {
          marketValue += card.fundValue ?? card.initialBalance;
          continue;
        }
        const latest = validSnapshots
          .filter((row) => row.fundCardId === card.id && row.month <= month)
          .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)[0];
        marketValue += latest?.value ?? card.initialBalance;
        if (latest) updatedAt = Math.max(updatedAt, latest.updatedAt);
      }
      return { month, marketValue, prepaid: 0, updatedAt };
    });
}
