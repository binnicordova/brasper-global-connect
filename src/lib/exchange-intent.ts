import { currencies, type Currency } from "./currency";

export type ExchangeIntent = { from: Currency; to: Currency; amount: string };
// Only a requested amount and route travel in the URL, never customer/account details or a rate.
export function readExchangeIntent(search: string): ExchangeIntent | null {
  const params = new URLSearchParams(search);
  const from = params.get("from"),
    to = params.get("to"),
    amount = params.get("amount");
  if (
    !from ||
    !to ||
    !Object.hasOwn(currencies, from) ||
    !Object.hasOwn(currencies, to) ||
    from === to ||
    !amount ||
    !/^\d{1,9}(\.\d{1,2})?$/.test(amount) ||
    Number(amount) <= 0
  )
    return null;
  return { from: from as Currency, to: to as Currency, amount };
}
export function exchangePath(from: Currency, to: Currency, amount: string) {
  const query = new URLSearchParams({ from, to, amount }).toString();
  return readExchangeIntent("?" + query) ? "/transferencias?" + query : "/transferencias";
}
