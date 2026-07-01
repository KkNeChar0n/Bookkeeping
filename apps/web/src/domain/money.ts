// 金额一律以“分”(整数)在内部运算，避免浮点误差。
export type Cents = number;

export function toCents(value: string | number): Cents {
  if (typeof value === 'number') return Math.round(value * 100);
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`Invalid money value: ${value}`);
  return Math.round(n * 100);
}

export function fromCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return `${sign}${yuan}.${fen.toString().padStart(2, '0')}`;
}
