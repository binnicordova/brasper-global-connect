import type { DocType, FundsSource, Order, Quote } from "@/lib/api/types";
import { readJson, removeKey, writeJson } from "@/lib/local-store";

/**
 * What this browser remembers. Orders live in the backend; here we keep only a light summary
 * (no document, email or account numbers) so the list opens instantly and offline. The profile is
 * saved only when the client ticks "remember my data", and can be forgotten at any time.
 */
export type OrderSummary = Pick<
  Order,
  | "orderId"
  | "status"
  | "invoiceStatus"
  | "createdAt"
  | "updatedAt"
  | "sendAmount"
  | "sendCurrency"
  | "receiveAmount"
  | "receiveCurrency"
  | "total"
  | "rate"
  | "rateLockedUntil"
  | "rejectionReason"
>;

export type SavedProfile = {
  clientName: string;
  docType: DocType;
  docNumber: string;
  email: string;
  fundsSource: FundsSource;
  sourceBank: string;
  sourceAccount: string;
  destinationBank: string;
  destinationAccount: string;
};

const ORDERS_KEY = "brasper.orders.v1";
const PROFILE_KEY = "brasper.profile.v1";
const QUOTE_KEY = "brasper.quote.v1";
const MAX_ORDERS = 50;

export const summarize = (o: Order): OrderSummary => ({
  orderId: o.orderId,
  status: o.status,
  invoiceStatus: o.invoiceStatus ?? null,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
  sendAmount: o.sendAmount,
  sendCurrency: o.sendCurrency,
  receiveAmount: o.receiveAmount,
  receiveCurrency: o.receiveCurrency,
  total: o.total,
  rate: o.rate,
  rateLockedUntil: o.rateLockedUntil,
  rejectionReason: o.rejectionReason ?? null,
});

type OrderCache = Record<string, OrderSummary[]>; // by uid, so a new session never shows old ones

export const cachedOrders = (uid: string): OrderSummary[] =>
  readJson<OrderCache>(ORDERS_KEY, {})[uid] ?? [];

export function cacheOrders(uid: string, orders: Order[] | OrderSummary[]): OrderSummary[] {
  const incoming = orders.map((o) => ("uid" in o ? summarize(o as Order) : (o as OrderSummary)));
  const byId = new Map(cachedOrders(uid).map((o) => [o.orderId, o]));
  for (const o of incoming) byId.set(o.orderId, o);
  const merged = [...byId.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ORDERS);
  writeJson(ORDERS_KEY, { ...readJson<OrderCache>(ORDERS_KEY, {}), [uid]: merged });
  return merged;
}

export const savedProfile = (): SavedProfile | null =>
  readJson<SavedProfile | null>(PROFILE_KEY, null);
export const saveProfile = (profile: SavedProfile) => writeJson(PROFILE_KEY, profile);
export const forgetProfile = () => removeKey(PROFILE_KEY);

/** The quote in progress, so a reload within its short validity does not lose the rate. */
export function activeQuote(now = Date.now()): Quote | null {
  const quote = readJson<Quote | null>(QUOTE_KEY, null);
  if (!quote || Date.parse(quote.expiresAt) <= now) {
    if (quote) removeKey(QUOTE_KEY);
    return null;
  }
  return quote;
}
export const rememberQuote = (quote: Quote) => writeJson(QUOTE_KEY, quote);
export const forgetQuote = () => removeKey(QUOTE_KEY);
