import { describe, expect, it } from "vitest";
import { exchangePath, readExchangeIntent } from "../lib/exchange-intent";

describe("Exchange request from the landing", () => {
  it("carries the requested route and amount without transferring the reference rate", () => {
    const path = exchangePath("BRL", "PEN", "450.50");
    expect(path).toBe("/transferencias?from=BRL&to=PEN&amount=450.50");
    expect(
      readExchangeIntent("?from=BRL&to=PEN&amount=450.50&rate=999&recipientAccount=secret"),
    ).toEqual({ from: "BRL", to: "PEN", amount: "450.50" });
  });
  it("rejects unsupported routes and invalid monetary inputs", () => {
    for (const search of [
      "?from=USD&to=PEN&amount=100",
      "?from=constructor&to=PEN&amount=100",
      "?from=PEN&to=PEN&amount=100",
      "?from=PEN&to=BRL&amount=-100",
      "?from=PEN&to=BRL&amount=10.001",
      "?from=PEN&to=BRL&amount=Infinity",
    ])
      expect(readExchangeIntent(search)).toBeNull();
  });
});
