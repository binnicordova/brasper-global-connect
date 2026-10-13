// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
const fake = vi.hoisted(() => ({
  s: { channels: {}, jobs: [], events: [] } as import("./store.server").State,
}));
vi.mock("./config.server", () => ({
  betaConfig: () => ({
    token: "test-meta-token",
    secret: "test-app-secret",
    verify: "verify-test",
    phoneId: "123456789",
    flowId: "987654321",
    recipient: "51999999999",
    enabled: true,
    version: "v25.0",
  }),
}));
vi.mock("./store.server", () => ({
  state: () => fake.s,
  persist: vi.fn(),
  record: vi.fn(),
  saveText: vi.fn(),
  channel: (phone: string) =>
    (fake.s.channels[phone] ||= { cookie: "", mode: "assistant", lastInbound: 0, history: [] }),
}));
vi.mock("../assistant/chat.server", () => ({
  handleAssistant: vi.fn(async (req: Request) => {
    const d = await req.json();
    return Response.json(
      {
        answer: "Respuesta del asistente",
        mode: d.action === "human" ? "human" : "assistant",
        source: "ai",
      },
      { headers: { "set-cookie": "brasper_local_assistant=test; HttpOnly" } },
    );
  }),
}));
import {
  whatsappWebhook,
  processMessage,
  drain,
  validSignature,
  flowMessage,
} from "./bridge.server";
import { handleAssistant } from "../assistant/chat.server";
const from = "51999999999";
const incoming = (id: string, text: string) => ({
  id,
  from,
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: "text",
  text: { body: text },
});
const event = (m: unknown) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: { metadata: { phone_number_id: "123456789" }, messages: [m] },
          },
        ],
      },
    ],
  });
const webhook = (
  raw: string,
  signature = createHmac("sha256", "test-app-secret").update(raw).digest("hex"),
) =>
  new Request("https://callback.test/api/whatsapp/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": "sha256=" + signature },
    body: raw,
  });
describe("WhatsApp IA + Flow nativo", () => {
  beforeEach(() => {
    fake.s = { channels: {}, jobs: [], events: [] };
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (url) =>
          String(url).endsWith("/healthz")
            ? Response.json({ ok: true })
            : Response.json({ messages: [{ id: "wamid.out" }] }),
        ),
    );
  });
  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("valida firma sobre cuerpo original", () => {
    const raw = '{"test":1}';
    expect(
      validSignature(
        raw,
        "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex"),
        "secret",
      ),
    ).toBe(true);
    expect(validSignature(raw, "sha256=" + "0".repeat(64), "secret")).toBe(false);
  });
  it("solo valida challenge con token correcto", async () => {
    expect(
      (
        await whatsappWebhook(
          new Request(
            "https://callback.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123",
          ),
        )
      ).status,
    ).toBe(403);
    const r = await whatsappWebhook(
      new Request(
        "https://callback.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123",
      ),
    );
    expect(await r.text()).toBe("123");
  });
  it("firma inválida no produce respuestas", async () => {
    const r = await whatsappWebhook(webhook(event(incoming("1", "hola")), "0".repeat(64)));
    expect(r.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("deduplica mensajes recibidos antes de procesar", async () => {
    const raw = event(incoming("2", "hola"));
    await whatsappWebhook(webhook(raw));
    await whatsappWebhook(webhook(raw));
    await drain();
    expect(fake.s.jobs).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rechaza un remitente no autorizado", async () => {
    await whatsappWebhook(webhook(event({ ...incoming("3", "hola"), from: "51988888888" })));
    await drain();
    expect(fake.s.jobs).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("el cambio principal envía la misma web con enlace privado", async () => {
    await processMessage(incoming("web", "empezar cambio"));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string);
    expect(body.interactive.type).toBe("cta_url");
    expect(body.interactive.action.parameters.url).toContain("/cambio/");
    expect(fake.s.channels[from]!.web?.token).toHaveLength(43);
  });
  it("envía botón Flow draft sin HTML ni iframe", async () => {
    await processMessage(incoming("4", "native_flow"));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(body.interactive.type).toBe("flow");
    expect(body.interactive.action.parameters.mode).toBe("draft");
    expect(body.interactive.action.parameters.flow_action).toBe("navigate");
    expect(body.interactive.action.parameters.flow_token).toBe(fake.s.channels[from]!.flow!.token);
  });
  it("mensaje abierto usa IA del servidor", async () => {
    await processMessage(incoming("5", "Explícame qué es una remesa"));
    expect(handleAssistant).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("humano pausa IA y requiere reanudación explícita", async () => {
    await processMessage(incoming("6", "quiero hablar con un humano"));
    vi.mocked(handleAssistant).mockClear();
    await processMessage(incoming("7", "Tengo una pregunta"));
    expect(handleAssistant).not.toHaveBeenCalled();
    await processMessage(incoming("8", "volver al asistente"));
    expect(fake.s.channels[from]!.mode).toBe("assistant");
  });
  it("valida respuesta Flow vinculada al mismo teléfono", async () => {
    await processMessage(incoming("9", "native_flow"));
    const token = fake.s.channels[from]!.flow!.token;
    const result = {
      flow_token: token,
      attention: "ai",
      route: "PEN_BRL",
      amount: "300",
      billing_type: "boleta",
      customer_name: "Cliente de prueba",
      billing_email: "test@example.test",
      funds_origin: "savings",
      purpose: "Ayuda de prueba",
      recipient: "demo_a",
      account_type: "bank_account",
      account: "DEMO_NO_TRANSFERIR",
      demo: true,
      proof: [],
    };
    await processMessage({
      id: "10",
      from,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: { type: "nfm_reply", nfm_reply: { response_json: JSON.stringify(result) } },
    });
    expect(fake.s.channels[from]!.draft!.status).toBe("pending_review");
    expect(fake.s.channels[from]!.flow).toBeUndefined();
  });
  it("rechaza un Flow que no corresponde al chat", async () => {
    await processMessage(incoming("11", "native_flow"));
    await processMessage({
      id: "12",
      from,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "nfm_reply",
        nfm_reply: { response_json: JSON.stringify({ flow_token: "inventado", demo: true }) },
      },
    });
    expect(fake.s.channels[from]!.draft).toBeUndefined();
  });
  it("no revela tokens en payload de mensaje", () => {
    expect(JSON.stringify(flowMessage("987654321", "session"))).not.toContain("test-meta-token");
  });
});
