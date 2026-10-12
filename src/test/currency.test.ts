import { describe, expect, it } from "vitest";
import { convertCurrency } from "@/lib/currency";
describe("Illustrative currency calculation", () => {
  it("converts 1000 soles using the displayed reference rates", () => {
    expect(convertCurrency(1000, "PEN", "BRL")).toBeCloseTo(1386.6667, 4);
  });
  it("keeps the amount for matching currencies", () => {
    expect(convertCurrency(125, "PEN", "PEN")).toBe(125);
  });
  it("reverses a conversion consistently", () => {
    expect(convertCurrency(convertCurrency(1000, "PEN", "BRL"), "BRL", "PEN")).toBeCloseTo(1000);
  });
  it("rejects invalid amounts", () => {
    expect(convertCurrency(-1, "PEN", "BRL")).toBe(0);
    expect(convertCurrency(NaN, "PEN", "BRL")).toBe(0);
  });
});
