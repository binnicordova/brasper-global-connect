export const currencies = {
  PEN: { flag: '🇵🇪', name: 'Soles', perUsd: 3.75 },
  BRL: { flag: '🇧🇷', name: 'Reales', perUsd: 5.2 },
  USD: { flag: '🇺🇸', name: 'Dólares', perUsd: 1 },
};
export type Currency = keyof typeof currencies;
// Illustrative rates only, never a binding quote or a live market feed.
export function convertCurrency(amount: number, from: Currency, to: Currency) {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount / currencies[from].perUsd * currencies[to].perUsd;
}
