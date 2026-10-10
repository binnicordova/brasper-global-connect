import { describe, it, expect } from "vitest";
import { quoteAmounts, validateProof, transferInput } from "@/lib/transfers";
describe("Transfer validations", () => {
  it("separates paid amount, fee and recipient amount", () => {
    expect(quoteAmounts(300, 1.475, 5)).toEqual({ commission: 15, received: 420.38 });
  });
  it("rejects oversized and unsupported evidence", () => {
    expect(() => validateProof({ type: "text/html", size: 100 })).toThrow();
    expect(() => validateProof({ type: "application/pdf", size: 5242881 })).toThrow();
    expect(() => validateProof({ type: "image/png", size: 0 })).toThrow();
  });
  it("rejects fractional cents and nonfinite amounts", () => {
    const input = {
      rateId: "00000000-0000-4000-8000-000000000001",
      amount: 12.001,
      customerName: "Test",
      customerDocument: "123",
      recipientName: "Test",
      recipientDocument: "456",
      recipientBank: "Bank",
      recipientAccount: "789",
    };
    expect(transferInput.safeParse(input).success).toBe(false);
    expect(transferInput.safeParse({ ...input, amount: Infinity }).success).toBe(false);
  });
});
