import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createDemoClient, isDemoEnabled } from "@/lib/demo-supabase";
const RATE = "00000000-0000-4000-8000-000000000903";
const params = {
  p_rate_id: RATE,
  p_amount: 300,
  p_customer_name: "Cliente nuevo demo",
  p_customer_document: "12345678",
  p_customer_document_type: "1",
  p_customer_phone: "+51900000000",
  p_recipient_name: "Familia demo",
  p_recipient_document: "87654321",
  p_recipient_bank: "Banco Demo",
  p_recipient_account: "123456789",
  p_recipient_account_type: "bank_account",
  p_recipient_account_holder: "Familia demo",
  p_recipient_account_holder_document: "87654321",
  p_recipient_bank_branch: "",
  p_recipient_phone: "",
  p_transfer_note: "",
  p_source_country: "PE",
  p_destination_country: "BR",
  p_origin_bank: "Banco Demo",
  p_funds_origin: "savings",
  p_funds_detail: "",
  p_transfer_purpose: "Apoyo familiar",
  p_recipient_relationship: "Familia",
  p_billing_type: "boleta",
  p_billing_email: "nuevo@example.test",
  p_billing_name: "Cliente nuevo demo",
  p_billing_document: "12345678",
  p_billing_document_type: "1",
  p_declaration_accepted: true,
};
beforeEach(() => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  window.history.replaceState(null, "", "/transferencias");
  const files = new Map<string, Blob>();
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request: { result: unknown; onsuccess?: () => void; onupgradeneeded?: () => void } = {
        result: null,
      };
      request.result = {
        createObjectStore: () => {},
        close: () => {},
        transaction: () => {
          const tx: { oncomplete?: () => void; objectStore: () => unknown } = {
            objectStore: () => ({
              get: (key: string) => operation(key),
              put: (file: Blob, key: string) => operation(key, file),
            }),
          };
          function operation(key: string, file?: Blob) {
            const op: { result?: Blob | undefined; onsuccess?: () => void } = {};
            queueMicrotask(() => {
              if (file) files.set(key, file);
              op.result = files.get(key);
              op.onsuccess?.();
              tx.oncomplete?.();
            });
            return op;
          }
          return tx;
        },
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });
  URL.createObjectURL = vi.fn(() => "blob:demo-file");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
describe("Explicit synthetic demo", () => {
  it("requires opting in and persists only its own data", async () => {
    expect(isDemoEnabled()).toBe(false);
    window.history.replaceState(null, "", "/transferencias?demo=1");
    expect(isDemoEnabled()).toBe(true);
    const db = createDemoClient();
    const created = await db.rpc("create_validated_transfer", params);
    expect(created.error).toBeNull();
    expect(
      (await createDemoClient().from("transfers").select("*").eq("id", created.data)).data?.[0],
    ).toMatchObject({
      amount: 300,
      status: "awaiting_payment",
      billing_type: "boleta",
      billing_email: "nuevo@example.test",
      funds_origin: "savings",
    });
    expect(localStorage.getItem("brasper-synthetic-demo-v1")).toContain("Cliente nuevo demo");
    expect((await db.rpc("staff_dashboard_summary")).error).toBeTruthy();
  });
  it("preserves the real registration requirements inside the demo", async () => {
    const db = createDemoClient();
    const before = await db.from("transfers").select("*");
    expect(
      (await db.rpc("create_validated_transfer", { ...params, p_funds_origin: "" })).error,
    ).toBeTruthy();
    expect(
      (await db.rpc("create_validated_transfer", { ...params, p_declaration_accepted: false }))
        .error,
    ).toBeTruthy();
    expect((await db.from("transfers").select("*")).data).toHaveLength(before.data!.length);
  });
  it("opens the seeded completed invoice as a PDF and rejects unknown invoices", async () => {
    const db = createDemoClient();
    const { data } = await db.from("transfers").select("*").eq("status", "completed");
    const path = data![0].invoices[0].pdf_path;
    const result = await db.storage.from("invoice-documents").createSignedUrl(path, 60);
    expect(result.error).toBeNull();
    const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(
      (await db.storage.from("invoice-documents").createSignedUrl("unknown.pdf", 60)).error,
    ).toBeTruthy();
  });
  it("runs registration, evidence, staff approval and demo invoice/email once, with no network", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const customer = createDemoClient();
    const created = await customer.rpc("create_validated_transfer", params);
    const id = created.data;
    const deposit = `demo/${id}/deposit/photo.jpg`;
    const file = new File(["example"], "photo.jpg", { type: "image/jpeg" });
    await customer.storage.from("transfer-proofs").upload(deposit, file);
    expect(
      (
        await customer.rpc("submit_transfer_proof", {
          p_transfer_id: id,
          p_path: deposit,
          p_bank_reference: "DEMO-123",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await customer.rpc("review_transfer", {
          p_transfer_id: id,
          p_action: "verify",
          p_note: "Checked",
        })
      ).error,
    ).toBeTruthy();
    window.history.replaceState(null, "", "/dashboard?demo=1");
    const staff = createDemoClient();
    expect(
      (
        await staff.rpc("review_transfer", {
          p_transfer_id: id,
          p_action: "verify",
          p_note: "Checked",
        })
      ).error,
    ).toBeNull();
    const payout = `demo/${id}/payout/sent.jpg`;
    await staff.storage.from("transfer-proofs").upload(payout, file);
    const input = {
      p_transfer_id: id,
      p_action: "payout",
      p_note: "Sent demo",
      p_reference: "DEMO-SENT",
      p_payout_path: payout,
    };
    expect((await staff.rpc("review_transfer", input)).error).toBeNull();
    const t = (await staff.from("transfers").select("*").eq("id", id)).data?.[0];
    expect(t).toMatchObject({
      status: "completed",
      invoices: [
        { status: "demo_delivered", environment: "demo", demo_email: "nuevo@example.test" },
      ],
    });
    expect(
      JSON.parse(localStorage.getItem("brasper-synthetic-demo-v1")!)
        .events.filter((e: { transfer_id: string; action: string }) => e.transfer_id === id)
        .map((e: { action: string }) => e.action),
    ).toContain("Correo demo registrado");
    expect(t.invoices[0].pdf_path).toBeTruthy();
    expect(
      (await staff.storage.from("invoice-documents").createSignedUrl(t.invoices[0].pdf_path, 60))
        .data?.signedUrl,
    ).toBe("blob:demo-file");
    expect((await staff.rpc("review_transfer", input)).error).toBeTruthy();
    expect(network).not.toHaveBeenCalled();
  });
});
