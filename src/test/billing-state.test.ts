import { it, expect } from "vitest";
import { billingState, INVOICE_LIST_FIELDS } from "@/lib/billing";
import type { Invoice } from "@/lib/transfers";
const invoice = (status: string, extra: Partial<Invoice> = {}): Invoice => ({
  status,
  number: "DEMO-1",
  pdf_path: "private.pdf",
  xml_path: null,
  cdr_path: null,
  error: null,
  ...extra,
});
it("never equates a generated PDF or demo delivery with a real sent invoice", () => {
  expect(billingState(invoice("accepted"))).toMatchObject({
    tone: "generated",
    delivery: "Correo pendiente",
  });
  expect(billingState(invoice("delivered"))).toMatchObject({
    tone: "success",
    delivery: "Correo enviado",
  });
  expect(billingState(invoice("demo_delivered"))).toMatchObject({
    tone: "demo",
    delivery: "Envío demo registrado",
  });
  expect(billingState(invoice("beta_accepted"))).toMatchObject({ delivery: "Correo pendiente" });
});
it("distinguishes invoice retries from email retries and fiscal rejection", () => {
  expect(billingState(invoice("queued", { error: "Temporary" }))).toMatchObject({
    tone: "warning",
    label: "Reintento pendiente",
  });
  expect(billingState(invoice("accepted", { error: "Email failed" }))).toMatchObject({
    tone: "warning",
    delivery: "Reintento de correo",
  });
  expect(billingState(invoice("beta_rejected"))).toMatchObject({ tone: "danger" });
});
it("excludes fiscal binary payloads from operational lists", () => {
  expect(INVOICE_LIST_FIELDS).not.toMatch(/beta_prepared|beta_result|base64/);
  expect(INVOICE_LIST_FIELDS).toContain("pdf_path");
});
