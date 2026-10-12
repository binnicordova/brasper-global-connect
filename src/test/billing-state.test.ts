import { it, expect } from "vitest";
import { billingState, INVOICE_LIST_FIELDS, readBillingCompatible } from "@/lib/billing";
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
    delivery: "Entrega preparada",
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
it("shows MailerSend queued separately from confirmed real sending and retains test provenance", () => {
  expect(
    billingState(invoice("beta_accepted", { environment: "beta", email_status: "submitted" })),
  ).toMatchObject({ tone: "working", delivery: "En cola en MailerSend" });
  expect(
    billingState(invoice("beta_accepted", { environment: "beta", email_status: "sent" })),
  ).toMatchObject({
    tone: "success",
    label: "Documento de pruebas enviado",
    delivery: "Correo enviado",
  });
  expect(billingState(invoice("demo_generated", { email_status: "retry" }))).toMatchObject({
    tone: "warning",
    delivery: "Reintento de correo",
  });
  expect(
    billingState(invoice("accepted", { email_status: "reconciliation_required" })),
  ).toMatchObject({ tone: "danger" });
});

it("supports the database before the manual email migration, without hiding other errors", async () => {
  const fields: string[] = [];
  const result = await readBillingCompatible(async (selection) => {
    fields.push(selection);
    return {
      error:
        fields.length === 1
          ? { code: "42703", message: "column invoices.email_status does not exist" }
          : null,
    };
  });
  expect(result.error).toBeNull();
  expect(fields).toHaveLength(2);
  expect(fields[1]).not.toContain("email_status");
  let attempts = 0;
  const denied = await readBillingCompatible(async () => {
    attempts++;
    return { error: { code: "42501", message: "permission denied" } };
  });
  expect(attempts).toBe(1);
  expect(denied.error?.code).toBe("42501");
});
