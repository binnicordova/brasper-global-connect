import { roundMoney, roundRate } from "@/lib/money";
import type { ApiCurrency, MarketRates, Pricing, QuoteAmounts } from "@/lib/api/types";

/**
 * ESTIMATE ONLY. It mirrors the server's formula (`createQuote`) over the public market reference
 * so the calculator can show a close figure while typing. The binding rate, fees and total are
 * always those of the quote returned by the server, which freezes them for a few minutes.
 */
export function estimateQuote(
  market: MarketRates,
  pricing: Pricing,
  input: { sendCurrency: ApiCurrency; receiveCurrency: ApiCurrency; sendAmount: number },
): QuoteAmounts | null {
  const { sendCurrency, receiveCurrency, sendAmount } = input;
  const fromPerUsd = market.rates[sendCurrency];
  const toPerUsd = market.rates[receiveCurrency];
  if (sendCurrency === receiveCurrency || !(fromPerUsd > 0) || !(toPerUsd > 0)) return null;
  if (!Number.isFinite(sendAmount) || sendAmount <= 0) return null;

  const marketRate = toPerUsd / fromPerUsd;
  const rate = roundRate(marketRate * (1 - pricing.spreadBps / 10000));
  const send = roundMoney(sendAmount);
  const commission = roundMoney((send * pricing.commissionBps) / 10000);
  const tax = roundMoney((commission * pricing.taxBps) / 10000);
  return {
    sendCurrency,
    receiveCurrency,
    sendAmount: send,
    receiveAmount: roundMoney(send * rate),
    marketRate: roundRate(marketRate),
    rate,
    commission,
    tax,
    total: roundMoney(send + commission + tax),
    requiresHuman: send / fromPerUsd > pricing.largeAmountUsd,
  };
}

/** Smallest amount worth quoting, in the currency being sent. */
export const minimumSend = (market: MarketRates, pricing: Pricing, currency: ApiCurrency) =>
  roundMoney(pricing.minSendUsd * market.rates[currency]);
