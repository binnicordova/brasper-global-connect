import { describe, expect, it } from "vitest";
import type { MarketRates, Pricing } from "@/lib/api/types";
import { formatMoney, formatNumber, parseAmount } from "@/lib/money";
import { estimateQuote, minimumSend } from "@/lib/pricing";

const pricing: Pricing = {
  spreadBps: 200,
  commissionBps: 240,
  taxBps: 1800,
  quoteTtlMinutes: 15,
  rateLockMinutes: 30,
  ratesRefreshMinutes: 60,
  largeAmountUsd: 3000,
  minSendUsd: 10,
};
const market = (rates: MarketRates["rates"]): MarketRates => ({
  base: "USD",
  rates,
  source: "test",
  fetchedAt: "2026-10-14T00:00:00Z",
  nextUpdateAt: "2026-10-14T01:00:00Z",
  providerUpdatedAt: null,
});

describe("Estimate that mirrors the server quote formula", () => {
  // 1 BRL buys 0.68727 PEN on the market, the example priced in the backend documentation.
  const rates = market({ BRL: 1, PEN: 0.68727, USD: 0.2 });

  it("reproduces the documented BRL → PEN quote for 800", () => {
    expect(
      estimateQuote(rates, pricing, {
        sendCurrency: "BRL",
        receiveCurrency: "PEN",
        sendAmount: 800,
      }),
    ).toMatchObject({
      rate: 0.6735,
      receiveAmount: 538.8,
      commission: 19.2,
      tax: 3.46,
      total: 822.66,
      requiresHuman: false,
    });
  });

  it("flags large amounts that a person must negotiate", () => {
    expect(
      estimateQuote(rates, pricing, {
        sendCurrency: "BRL",
        receiveCurrency: "PEN",
        sendAmount: 20000,
      })?.requiresHuman,
    ).toBe(true);
  });

  it("returns nothing for invalid input rather than a made-up figure", () => {
    const base = { sendCurrency: "BRL", receiveCurrency: "PEN", sendAmount: 100 } as const;
    expect(estimateQuote(rates, pricing, { ...base, sendAmount: 0 })).toBeNull();
    expect(estimateQuote(rates, pricing, { ...base, sendAmount: Number.NaN })).toBeNull();
    expect(estimateQuote(rates, pricing, { ...base, receiveCurrency: "BRL" })).toBeNull();
    expect(estimateQuote(market({ BRL: 0, PEN: 1, USD: 1 }), pricing, base)).toBeNull();
  });

  it("derives the minimum send from the USD minimum", () => {
    expect(minimumSend(market({ BRL: 5, PEN: 3.5, USD: 1 }), pricing, "BRL")).toBe(50);
  });
});

describe("Money formatting and typed amounts", () => {
  it("formats the same everywhere", () => {
    expect(formatNumber(1234567.5)).toBe("1,234,567.50");
    expect(formatMoney(822.66, "PEN")).toBe("S/ 822.66");
    expect(formatMoney(-5, "BRL")).toBe("R$ -5.00");
  });

  it("understands how people type amounts", () => {
    expect(parseAmount("500")).toBe(500);
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("S/ 99.9")).toBe(99.9);
    expect(parseAmount("abc")).toBeNull();
  });
});
