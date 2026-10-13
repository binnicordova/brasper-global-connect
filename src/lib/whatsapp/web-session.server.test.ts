// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { State } from "./store.server";
const fake = vi.hoisted(() => ({ s: { channels: {}, jobs: [], events: [] } as State }));
vi.mock("./store.server", () => ({
  state: () => fake.s,
  persist: vi.fn(),
  record: vi.fn(),
  channel: (p: string) =>
    (fake.s.channels[p] ||= { cookie: "", mode: "assistant", lastInbound: 0, history: [] }),
}));
vi.mock("node:fs", () => ({ writeFileSync: vi.fn(), mkdirSync: vi.fn() }));
vi.mock("../assistant/local-config.server", () => ({
  localSetting: () => "https://owned-beta.test/api/whatsapp/webhook",
  isLocalRequest: () => true,
}));
vi.mock("./bridge.server", () => ({ notifyWebCompletion: vi.fn() }));
import { createWebSession, webSession } from "./web-session.server";
const data = {
  rateId: "00000000-0000-4000-8000-000000000904",
  amount: 500,
  customerName: "Ana Ribeiro",
  customerDocument: "12345678",
  recipientName: "Luis Almeida",
  recipientDocument: "87654321",
  recipientBank: "BCP",
  recipientAccount: "1910000000000",
  recipientAccountType: "bank_account",
  recipientAccountHolder: "Luis Almeida",
  recipientAccountHolderDocument: "87654321",
  recipientBankBranch: "",
  customerPhone: "+51900000000",
  recipientPhone: "",
  transferNote: "",
  customerDocumentType: "1",
  sourceCountry: "BR",
  destinationCountry: "PE",
  originBank: "Banco de prueba",
  fundsOrigin: "savings",
  fundsDetail: "Ahorros",
  transferPurpose: "Ayuda familiar",
  recipientRelationship: "Familiar",
  billingType: "boleta",
  billingEmail: "test@example.test",
  billingLegalName: "",
  billingRuc: "",
  billingDocumentType: "1",
};
function submission(token: string, payload: unknown = data, file = "%PDF-1.7\n%%EOF") {
  const f = new FormData();
  f.set("token", token);
  f.set("payload", JSON.stringify(payload));
  f.set("declaration", "yes");
  f.set("bankReference", "550001");
  f.set("proof", new File([file], "comprobante.pdf", { type: "application/pdf" }));
  return new Request("http://127.0.0.1/api/whatsapp-web", { method: "POST", body: f });
}
describe("misma web vinculada al chat", () => {
  beforeEach(() => {
    fake.s = { channels: {}, jobs: [], events: [] };
    vi.clearAllMocks();
  });
  it("enlace aleatorio caduca y no revela el teléfono", () => {
    const url = createWebSession("51999999999");
    expect(url).not.toContain("51999999999");
    expect(url.split("/").at(-1)).toHaveLength(43);
  });
  it("pedir empezar de nuevo conserva el enlace vigente sin invalidarlo", () => {
    const first = createWebSession("51999999999");
    expect(createWebSession("51999999999")).toBe(first);
  });
  it("rechaza enlace inválido o caducado", async () => {
    expect(
      (await webSession(new Request("http://127.0.0.1/api/whatsapp-web?token=invalid"))).status,
    ).toBe(401);
    const token = createWebSession("51999999999").split("/").at(-1)!;
    fake.s.channels["51999999999"]!.web!.expires = 0;
    expect((await webSession(submission(token))).status).toBe(401);
  });
  it("valida y registra datos, cálculo y comprobante en servidor", async () => {
    const token = createWebSession("51999999999").split("/").at(-1)!;
    const r = await webSession(submission(token));
    expect(r.status).toBe(200);
    expect(fake.s.channels["51999999999"]!.draft?.status).toBe("pending_review");
    expect(fake.s.channels["51999999999"]!.web!.data?.["quote"]).toEqual({
      commission: 15,
      received: 334.65,
    });
  });
  it("reenvío no crea otra operación", async () => {
    const token = createWebSession("51999999999").split("/").at(-1)!;
    const a = await (await webSession(submission(token))).json();
    const b = await (await webSession(submission(token))).json();
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
  });
  it("no acepta archivo con mime que no corresponde al contenido", async () => {
    const token = createWebSession("51999999999").split("/").at(-1)!;
    expect((await webSession(submission(token, data, "not a PDF"))).status).toBe(400);
    expect(fake.s.channels["51999999999"]!.draft).toBeUndefined();
  });
  it("no acepta ruta manipulada ni impuestos inventados por el cliente", async () => {
    const token = createWebSession("51999999999").split("/").at(-1)!;
    expect(
      (await webSession(submission(token, { ...data, destinationCountry: "BR" }))).status,
    ).toBe(400);
  });
});
