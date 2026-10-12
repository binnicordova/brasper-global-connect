// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";
import { buildDemoReceipt } from "../../supabase/functions/_shared/demo-receipt";
function worker(vars: Record<string, string>, db: unknown, fetchMock = vi.fn()) {
  let handler: (r: Request) => Promise<Response> = async () => new Response();
  const source = readFileSync("supabase/functions/process-invoices/index.ts", "utf8")
    .replace(/import \{ createClient \} from [^;]+;/, "")
    .replace(/import \{ buildDemoReceipt \} from [^;]+;/, "");
  const script = ts.transpile(source, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  });
  runInNewContext(script, {
    Deno: {
      env: { get: (k: string) => vars[k] },
      serve: (f: typeof handler) => {
        handler = f;
      },
    },
    createClient: () => db,
    buildDemoReceipt,
    Response,
    Request,
    AbortSignal,
    Date,
    Uint8Array,
    TextDecoder,
    atob,
    btoa,
    fetch: fetchMock,
  });
  return handler;
}
describe("Billing worker integration boundaries", () => {
  it("generates a data-specific demo boleta in beta without fiscal or email calls", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const rpc = vi.fn(async (name: string) =>
      name === "claim_brazil_invoice"
        ? { data: [], error: null }
        : {
            data: [
              {
                id: "demo-invoice",
                transfer_id: "operation",
                number: "DEMO-42",
                created_at: "2026-10-12T12:00:00Z",
              },
            ],
            error: null,
          },
    );
    const transfer = {
      id: "operation",
      user_id: "owner",
      status: "paid_out",
      billing_type: "boleta",
      customer_name: "María Demo",
      customer_document: "12345678",
      customer_email: "maria@example.test",
      from_currency: "PEN",
      to_currency: "BRL",
      amount: 300,
      commission: 15,
      rate: 1.425,
      recipient_amount: 406.13,
      recipient_name: "Ana Demo",
      recipient_bank: "Banco Demo",
      created_at: "2026-10-12T12:00:00Z",
    };
    const network = vi.fn();
    const db = {
      rpc,
      storage: { from: () => ({ upload }) },
      from: (table: string) =>
        table === "transfers"
          ? {
              select: () => ({
                eq: () => ({ single: async () => ({ data: transfer, error: null }) }),
              }),
            }
          : { update },
    };
    const handle = worker(
      { BILLING_WORKER_SECRET: "secret", BILLING_ENVIRONMENT: "beta" },
      db,
      network,
    );
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(await response.json()).toEqual({ status: "demo_generated", id: "demo-invoice" });
    expect(rpc).toHaveBeenCalledWith("claim_demo_invoice", { p_boleta_only: true });
    expect(network).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith("owner/demo-invoice/demo.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: true,
    });
    expect(update).toHaveBeenCalledWith({
      status: "demo_generated",
      pdf_path: "owner/demo-invoice/demo.pdf",
      error: null,
    });
  });

  it("blocks beta boletas before calling the invoice-only gateway", async () => {
    const network = vi.fn();
    const handle = worker(
      { BILLING_WORKER_SECRET: "secret", BILLING_ENVIRONMENT: "beta" },
      {
        rpc: async (name: string) =>
          ["claim_demo_invoice", "claim_brazil_invoice"].includes(name)
            ? { data: [], error: null }
            : {
                data: [{ id: "boleta", status: "blocked", document_type: "03" }],
                error: null,
              },
      },
      network,
    );
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(await response.json()).toMatchObject({ status: "blocked", id: "boleta" });
    expect(network).not.toHaveBeenCalled();
  });
  it("passes the requested boleta and billing recipient to production and rejects a mismatched factura", async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const upload = vi.fn();
    const transfer = {
      id: "transfer",
      user_id: "owner",
      status: "paid_out",
      from_currency: "BRL",
      to_currency: "PEN",
      billing_type: "boleta",
      billing_email: "billing@example.test",
      billing_name: "Cliente",
      billing_document: "12345678",
      billing_document_type: "1",
    };
    const db = {
      rpc: async (name: string) =>
        name === "claim_brazil_invoice"
          ? { data: [], error: null }
          : {
              data: [{ id: "invoice", transfer_id: "transfer", document_type: "03" }],
              error: null,
            },
      storage: { from: () => ({ upload }) },
      from: (table: string) =>
        table === "transfers"
          ? {
              select: () => ({
                eq: () => ({ single: async () => ({ data: transfer, error: null }) }),
              }),
            }
          : { update },
    };
    const network = vi.fn(async () =>
      Response.json({
        authority: "SUNAT",
        document_type: "01",
        status: "accepted",
        cdr_code: "0",
        external_id: "wrong-type",
        number: "F001-1",
      }),
    );
    const handle = worker(
      {
        BILLING_WORKER_SECRET: "secret",
        BILLING_GATEWAY_URL: "https://provider.test",
        BILLING_GATEWAY_TOKEN: "token",
        BILLING_ALLOWED_ROUTES: "BRL-PEN",
      },
      db,
      network,
    );
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(response.status).toBe(502);
    const sent = JSON.parse(
      String((network.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(sent).toMatchObject({
      document_type: "03",
      billing: {
        type: "boleta",
        email: "billing@example.test",
        name: "Cliente",
        document: "12345678",
        document_type: "1",
      },
    });
    expect(upload).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reconciliation_required" }),
    );
  });
  it("sends an accepted production document to its chosen billing email instead of account email", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "claim_brazil_invoice"
        ? { data: [], error: null }
        : {
            data: [
              {
                id: "invoice",
                transfer_id: "transfer",
                document_type: "03",
                pdf_path: "private/doc.pdf",
                number: "B001-1",
                email_attempted_at: new Date().toISOString(),
              },
            ],
            error: null,
          },
    );
    const db = {
      rpc,
      storage: {
        from: () => ({ download: async () => ({ data: new Blob(["%PDF-test"]), error: null }) }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                customer_email: "account@example.test",
                billing_email: "billing@example.test",
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    const network = vi.fn(async () => Response.json({ id: "message" }));
    const handle = worker(
      {
        BILLING_WORKER_SECRET: "secret",
        RESEND_API_KEY: "test-key",
        BILLING_FROM_EMAIL: "sender@example.test",
      },
      db,
      network,
    );
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(await response.json()).toMatchObject({ status: "delivered" });
    const sent = JSON.parse(
      String((network.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(sent.to).toEqual(["billing@example.test"]);
    expect(sent.subject).toBe("Boleta Brasper B001-1");
    expect(rpc).toHaveBeenCalledWith("complete_invoice_delivery", { p_invoice_id: "invoice" });
  });
  it("rejects requests without scheduler authorization", async () => {
    const rpc = vi.fn();
    const handle = worker({ BILLING_WORKER_SECRET: "secret" }, { rpc });
    expect((await handle(new Request("https://local.test", { method: "POST" }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks a job before contacting a provider when configuration is absent", async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const rpc = vi.fn(async (name: string) =>
      ["claim_demo_invoice", "claim_brazil_invoice"].includes(name)
        ? { data: [], error: null }
        : {
            data: [{ id: "invoice", transfer_id: "transfer" }],
            error: null,
          },
    );
    const db = {
      rpc,
      from: (table: string) =>
        table === "transfers"
          ? {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "transfer",
                      status: "paid_out",
                      from_currency: "PEN",
                      to_currency: "BRL",
                    },
                    error: null,
                  }),
                }),
              }),
            }
          : { update },
    };
    const network = vi.fn();
    const handle = worker({ BILLING_WORKER_SECRET: "secret" }, db, network);
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(await response.json()).toMatchObject({ status: "blocked" });
    expect(network).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
  });
  it("requires reconciliation after an ambiguous fiscal timeout without retrying", async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const db = {
      rpc: async (name: string) =>
        name === "claim_brazil_invoice"
          ? { data: [], error: null }
          : { data: [{ id: "invoice", transfer_id: "transfer" }], error: null },
      from: (table: string) =>
        table === "transfers"
          ? {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "transfer",
                      status: "paid_out",
                      from_currency: "PEN",
                      to_currency: "BRL",
                    },
                    error: null,
                  }),
                }),
              }),
            }
          : { update },
    };
    const network = vi.fn(async () => {
      throw new Error("timeout");
    });
    const handle = worker(
      {
        BILLING_WORKER_SECRET: "secret",
        BILLING_GATEWAY_URL: "https://provider.test",
        BILLING_GATEWAY_TOKEN: "token",
        BILLING_ALLOWED_ROUTES: "PEN-BRL",
      },
      db,
      network,
    );
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(response.status).toBe(502);
    expect(network).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reconciliation_required" }),
    );
  });
  it("stores accepted beta artifacts without sending customer data or email", async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const rpc = vi.fn(async (name: string) =>
      ["claim_demo_invoice", "claim_brazil_invoice"].includes(name)
        ? { data: [], error: null }
        : {
            data: [{ id: "invoice", transfer_id: "transfer" }],
            error: null,
          },
    );
    const upload = vi.fn(async () => ({ error: null }));
    const db = {
      rpc,
      storage: { from: () => ({ upload }) },
      from: (table: string) =>
        table === "transfers"
          ? {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "transfer",
                      user_id: "owner",
                      status: "paid_out",
                      customer_email: "private@example.test",
                      recipient_account: "private-account",
                    },
                    error: null,
                  }),
                }),
              }),
            }
          : { update },
    };
    const network = vi.fn(async () =>
      Response.json({
        authority: "SUNAT",
        document_type: "01",
        environment: "beta",
        status: "accepted",
        cdr_code: "0",
        external_id: "SUNAT-beta/F902-1",
        number: "F902-1",
        pdf_base64: btoa("%PDF-test"),
        xml_base64: btoa("<Invoice/>"),
        cdr_base64: btoa("<ApplicationResponse/>"),
      }),
    );
    const handle = worker(
      {
        BILLING_WORKER_SECRET: "secret",
        BILLING_ENVIRONMENT: "beta",
        BILLING_GATEWAY_URL: "https://brasper.test/api/billing-beta",
        BILLING_GATEWAY_TOKEN: "token",
        RESEND_API_KEY: "configured",
        BILLING_FROM_EMAIL: "configured",
      },
      db,
      network,
    );
    const response = await handle(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(await response.json()).toMatchObject({ status: "beta_accepted" });
    expect(rpc).toHaveBeenCalledWith("claim_beta_invoice");
    expect(rpc).not.toHaveBeenCalledWith("claim_invoice_delivery");
    expect(network).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(
      String((network.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(sent).toEqual({ operation_id: "transfer", invoice_request_id: "invoice" });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "beta_accepted" }));
  });
});
