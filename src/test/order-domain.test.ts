import { beforeEach, describe, expect, it } from "vitest";
import { checkProofFile, MAX_PROOF_BYTES, proofPathFor } from "@/lib/api/proof";
import type { Order, Quote } from "@/lib/api/types";
import { receiptBlob, maskAccount } from "@/lib/download";
import { formatLimaDateTime, isSupportOpen, nextVerificationSlot } from "@/lib/hours";
import {
  activeQuote,
  cacheOrders,
  cachedOrders,
  forgetProfile,
  rememberQuote,
  saveProfile,
  savedProfile,
  summarize,
} from "@/lib/local-data";
import { isSettled, timelineFor } from "@/lib/orders";
import {
  isValidCpf,
  isValidDocNumber,
  isValidEmail,
  isValidName,
  isValidOperationNo,
  isValidRuc,
  normalizeDocNumber,
} from "@/lib/validators";

beforeEach(() => localStorage.clear());

describe("Client-side checks match the backend rules", () => {
  it("validates documents by type", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidRuc("20100070970")).toBe(true);
    expect(isValidRuc("20100070971")).toBe(false);
    expect(isValidDocNumber("DNI", "12345678")).toBe(true);
    expect(isValidDocNumber("DNI", "1234567")).toBe(false);
    expect(isValidDocNumber("CE", "ab1234567")).toBe(true);
    expect(normalizeDocNumber("CPF", "529.982.247-25")).toBe("52998224725");
    expect(normalizeDocNumber("CE", " ab1234567 ")).toBe("AB1234567");
  });

  it("validates name, email and bank operation number", () => {
    expect(isValidName("Ana Souza")).toBe(true);
    expect(isValidName("Ana")).toBe(false);
    expect(isValidEmail("ana@example.com")).toBe(true);
    expect(isValidEmail("ana@example")).toBe(false);
    expect(isValidOperationNo("OP-12345")).toBe(true);
    expect(isValidOperationNo("12")).toBe(false);
    expect(isValidOperationNo("con espacio")).toBe(false);
  });

  it("accepts images and PDFs under 8 MB only, like the storage rules", () => {
    expect(checkProofFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkProofFile({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(checkProofFile({ type: "text/plain", size: 1000 })?.code).toBe("invalid-proof-file");
    expect(checkProofFile({ type: "image/png", size: MAX_PROOF_BYTES })?.code).toBe(
      "proof-too-large",
    );
    expect(checkProofFile({ type: "image/png", size: 0 })?.code).toBe("invalid-proof-file");
  });

  it("uploads proofs under proofs/<uid>/<orderId>/", () => {
    expect(proofPathFor("uid-1", "BR-0012", { type: "image/png" })).toMatch(
      /^proofs\/uid-1\/BR-0012\/proof-\d+\.png$/,
    );
  });
});

describe("Order progress shown to the client", () => {
  const steps = (status: Order["status"], invoiceStatus: Order["invoiceStatus"] = null) =>
    timelineFor({ status, invoiceStatus }).map((s) => s.state);

  it("follows pending → validating → approved → exported → receipt", () => {
    expect(steps("pending")).toEqual(["done", "todo", "todo", "todo"]);
    expect(steps("validating")).toEqual(["done", "active", "todo", "todo"]);
    expect(steps("approved")).toEqual(["done", "done", "active", "todo"]);
    expect(steps("exported")).toEqual(["done", "done", "done", "active"]);
    expect(steps("exported", "accepted")).toEqual(["done", "done", "done", "done"]);
  });

  it("marks rejected and cancelled orders as failed and stops polling", () => {
    expect(steps("rejected")[1]).toBe("failed");
    expect(steps("cancelled")[1]).toBe("failed");
    expect(isSettled({ status: "rejected", invoiceStatus: null })).toBe(true);
    expect(isSettled({ status: "exported", invoiceStatus: null })).toBe(false);
    expect(isSettled({ status: "exported", invoiceStatus: "sent" })).toBe(true);
    expect(isSettled({ status: "validating", invoiceStatus: null })).toBe(false);
  });
});

describe("Verification hours (Lima time)", () => {
  it("is open on a weekday morning and closed on Sunday afternoon", () => {
    expect(isSupportOpen(new Date("2026-10-14T15:00:00Z"))).toBe(true); // Wed 10:00 Lima
    expect(isSupportOpen(new Date("2026-10-18T20:00:00Z"))).toBe(false); // Sun 15:00 Lima
  });

  it("points to the next opening and prints Lima wall-clock time", () => {
    const next = nextVerificationSlot(new Date("2026-10-18T20:00:00Z"));
    expect(next.toISOString()).toBe("2026-10-19T12:00:00.000Z"); // Mon 07:00 Lima
    expect(formatLimaDateTime(next)).toBe("19/10/2026 7:00 a. m.");
  });
});

describe("What this browser remembers", () => {
  const order = {
    orderId: "BR-0001",
    uid: "uid-1",
    status: "pending",
    invoiceStatus: null,
    createdAt: "2026-10-14T10:00:00Z",
    updatedAt: "2026-10-14T10:00:00Z",
    sendAmount: 800,
    sendCurrency: "BRL",
    receiveAmount: 538.8,
    receiveCurrency: "PEN",
    total: 822.66,
    rate: 0.6735,
    rateLockedUntil: "2026-10-14T10:30:00Z",
    rejectionReason: null,
    clientName: "Ana Paula Souza",
    docNumber: "52998224725",
    email: "ana@example.com",
    sourceAccount: "0001-12345678-9",
    destinationAccount: "191-1234567890",
  } as unknown as Order;

  it("caches an order summary without personal data", () => {
    cacheOrders("uid-1", [order]);
    const raw = localStorage.getItem("brasper.orders.v1") ?? "";
    expect(cachedOrders("uid-1")).toEqual([summarize(order)]);
    for (const secret of [
      "Ana Paula",
      "52998224725",
      "ana@example.com",
      "0001-12345678",
      "191-1234567890",
    ])
      expect(raw).not.toContain(secret);
    expect(cachedOrders("another-session")).toEqual([]);
  });

  it("keeps newest first and updates an order instead of duplicating it", () => {
    cacheOrders("uid-1", [
      order,
      { ...order, orderId: "BR-0002", createdAt: "2026-10-15T10:00:00Z" },
    ]);
    cacheOrders("uid-1", [{ ...order, status: "validating" }]);
    expect(cachedOrders("uid-1").map((o) => [o.orderId, o.status])).toEqual([
      ["BR-0002", "pending"],
      ["BR-0001", "validating"],
    ]);
  });

  it("restores the quote in progress only while its rate is still guaranteed", () => {
    const quote = { id: "q1", expiresAt: "2026-10-14T10:15:00Z" } as Quote;
    rememberQuote(quote);
    expect(activeQuote(Date.parse("2026-10-14T10:10:00Z"))?.id).toBe("q1");
    expect(activeQuote(Date.parse("2026-10-14T10:16:00Z"))).toBeNull();
    expect(activeQuote(Date.parse("2026-10-14T10:10:00Z"))).toBeNull(); // expired quote was dropped
  });

  it("saves the profile only on request and forgets it on demand", () => {
    expect(savedProfile()).toBeNull();
    saveProfile({
      clientName: "Ana Paula Souza",
      docType: "CPF",
      docNumber: "52998224725",
      email: "ana@example.com",
      fundsSource: "salary",
      sourceBank: "Nubank",
      sourceAccount: "0001",
      destinationBank: "BCP",
      destinationAccount: "191-1",
    });
    expect(savedProfile()?.email).toBe("ana@example.com");
    forgetProfile();
    expect(savedProfile()).toBeNull();
  });
});

describe("Receipts", () => {
  it("decodes the base64 PDF returned by getReceipt", async () => {
    const blob = receiptBlob({
      filename: "B001-00000001.pdf",
      contentType: "application/pdf",
      base64: btoa("%PDF-1.4"),
    });
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(8);
  });

  it("masks account numbers in summaries", () => {
    expect(maskAccount("191-1234567890")).toBe("•••7890");
    expect(maskAccount("123")).toBe("123");
  });
});
