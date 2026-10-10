// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";
function worker(vars: Record<string, string>, db: unknown, fetchMock = vi.fn()) {
  let handler: (r: Request) => Promise<Response> = async () => new Response();
  const source = readFileSync("supabase/functions/process-invoices/index.ts", "utf8").replace(
    /import \{ createClient \} from [^;]+;/,
    "",
  );
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
  it("rejects requests without scheduler authorization", async () => {
    const rpc = vi.fn();
    const handle = worker({ BILLING_WORKER_SECRET: "secret" }, { rpc });
    expect((await handle(new Request("https://local.test", { method: "POST" }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks a job before contacting a provider when configuration is absent", async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const rpc = vi.fn(async () => ({
      data: [{ id: "invoice", transfer_id: "transfer" }],
      error: null,
    }));
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
      rpc: async () => ({ data: [{ id: "invoice", transfer_id: "transfer" }], error: null }),
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
    const rpc = vi.fn(async () => ({
      data: [{ id: "invoice", transfer_id: "transfer" }],
      error: null,
    }));
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
