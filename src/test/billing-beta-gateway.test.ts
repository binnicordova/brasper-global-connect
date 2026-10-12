// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), prepare: vi.fn(), send: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("../lib/sunat/brasper-beta.server", () => ({
  BrasperBetaEngine: class {
    prepare = mocks.prepare;
    send = mocks.send;
  },
}));
import { handleBetaBilling } from "../lib/billing-beta-gateway.server";
const invoice = "00000000-0000-4000-8000-000000000001",
  operation = "00000000-0000-4000-8000-000000000002";
function request(token = "test-private-key") {
  return new Request("https://brasper.test/api/billing-beta", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": invoice,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invoice_request_id: invoice, operation_id: operation }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BILLING_GATEWAY_TOKEN", "test-private-key");
  vi.stubEnv("BILLING_BETA_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://brasper.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only");
});
afterEach(() => vi.unstubAllEnvs());
it("denies unauthorized and disabled requests before accessing the database", async () => {
  expect((await handleBetaBilling(request("wrong"))).status).toBe(401);
  vi.stubEnv("BILLING_BETA_ENABLED", "false");
  expect((await handleBetaBilling(request())).status).toBe(503);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("claims submission before sending and persists uncertainty without resending", async () => {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "claim_beta_submission" ? true : null,
    error: null,
  }));
  mocks.client.mockReturnValue({
    from: (table: string) =>
      table === "transfers"
        ? {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { status: "paid_out", billing_type: "factura" },
                  error: null,
                }),
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: invoice,
                    transfer_id: operation,
                    status: "processing",
                    environment: "beta",
                    number: "F902-1",
                    beta_sent_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          },
    rpc,
  });
  mocks.prepare.mockResolvedValue({ xml: "signed", pdfBase64: "PDF", reference: "F902-1" });
  mocks.send.mockResolvedValue({
    estado: "incierto",
    codigo: "TIMEOUT",
    mensaje: "Revisar",
    cdrBase64: null,
  });
  const response = await handleBetaBilling(request());
  expect(await response.json()).toMatchObject({
    environment: "beta",
    status: "reconciliation_required",
  });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls.map((call) => call[0])).toEqual([
    "claim_beta_submission",
    "record_beta_result",
  ]);
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]!);
  expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]!);
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handleBetaBilling(request())).status).toBe(409);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("rejects a boleta job even if it carries an invoice series", async () => {
  mocks.client.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: invoice,
              transfer_id: operation,
              status: "processing",
              environment: "beta",
              number: "F902-1",
              beta_sent_at: null,
              document_type: "03",
            },
            error: null,
          }),
        }),
      }),
    }),
  });
  expect((await handleBetaBilling(request())).status).toBe(409);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it("recovers persisted accepted artifacts without sending a second invoice", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("cdr.xml", "<ApplicationResponse/>");
  const prepared = {
    xml: "signed saved",
    pdfBase64: "saved PDF",
    reference: "F902-7",
    fileName: "saved",
  };
  mocks.client.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: invoice,
              transfer_id: operation,
              status: "processing",
              environment: "beta",
              number: "F902-7",
              document_type: "01",
              beta_sent_at: "2026-10-12T12:00:00Z",
              beta_prepared: prepared,
              beta_result: {
                estado: "aceptado",
                codigo: "0",
                cdrBase64: await zip.generateAsync({ type: "base64" }),
              },
            },
            error: null,
          }),
        }),
      }),
    }),
  });
  const response = await handleBetaBilling(request());
  expect(await response.json()).toMatchObject({
    status: "accepted",
    number: "F902-7",
    pdf_base64: "saved PDF",
  });
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not resend a reserved submission whose response was lost", async () => {
  mocks.client.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: invoice,
              transfer_id: operation,
              status: "processing",
              environment: "beta",
              number: "F902-8",
              document_type: "01",
              beta_sent_at: "2026-10-12T12:00:00Z",
              beta_prepared: { xml: "signed" },
              beta_result: null,
            },
            error: null,
          }),
        }),
      }),
    }),
  });
  expect((await handleBetaBilling(request())).status).toBe(409);
  expect(mocks.send).not.toHaveBeenCalled();
});
