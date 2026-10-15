// Shapes of the BRASPER Cloud Functions (iathon-fintech/functions/docs/README.md).
export const CURRENCY_CODES = ["BRL", "PEN", "USD"] as const;
export type ApiCurrency = (typeof CURRENCY_CODES)[number];

export const DOC_TYPES = ["DNI", "CE", "RUC", "CPF"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const FUNDS_SOURCES = [
  "savings",
  "salary",
  "business",
  "asset_sale",
  "donation",
  "other",
] as const;
export type FundsSource = (typeof FUNDS_SOURCES)[number];

export type OrderStatus =
  "pending" | "validating" | "approved" | "exported" | "rejected" | "cancelled";

export type InvoiceStatus = "reserved" | "sent" | "accepted" | "rejected";

export type MarketRates = {
  base: "USD";
  /** Units of each currency per 1 USD. */
  rates: Record<ApiCurrency, number>;
  source: string;
  fetchedAt: string;
  nextUpdateAt: string;
  providerUpdatedAt: string | null;
};

export type Pricing = {
  spreadBps: number;
  commissionBps: number;
  taxBps: number;
  quoteTtlMinutes: number;
  rateLockMinutes: number;
  ratesRefreshMinutes: number;
  largeAmountUsd: number;
  minSendUsd: number;
};

export type RatesPayload = {
  market: MarketRates;
  pricing: Pricing;
  minutesPerQueuedClient: number;
};

export type QuoteAmounts = {
  sendCurrency: ApiCurrency;
  receiveCurrency: ApiCurrency;
  sendAmount: number;
  receiveAmount: number;
  marketRate: number;
  rate: number;
  commission: number;
  tax: number;
  /** sendAmount + commission + tax: what the client actually transfers. */
  total: number;
  requiresHuman: boolean;
};

export type Quote = QuoteAmounts & {
  id: string;
  uid: string;
  channel: string;
  status: "open" | "consumed";
  createdAt: string;
  expiresAt: string;
};

export type QuoteRequest = {
  sendCurrency: ApiCurrency;
  receiveCurrency: ApiCurrency;
  sendAmount: number;
  channel?: "form";
};

export type OrderClientData = {
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

export type CreateOrderRequest = OrderClientData & {
  quoteId: string;
  language: "es" | "pt" | "en";
};

export type PaymentAccount = {
  currency: ApiCurrency;
  holder: string;
  bank: string;
  accountNumber: string;
  pixKey?: string;
  demo?: boolean;
};

export type Order = OrderClientData & {
  orderId: string;
  uid: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  quoteId: string;
  sendAmount: number;
  sendCurrency: ApiCurrency;
  receiveAmount: number;
  receiveCurrency: ApiCurrency;
  rate: number;
  marketRate: number;
  commission: number;
  tax: number;
  total: number;
  rateLockedUntil: string;
  paymentAccount: PaymentAccount;
  operationNo: string | null;
  paymentProofPath: string | null;
  proofSubmittedAt: string | null;
  validatedAt: string | null;
  rejectionReason: string | null;
  exportedAt: string | null;
  invoiceStatus: InvoiceStatus | null;
};

export type ReceiptFile = { filename: string; contentType: string; base64: string };
