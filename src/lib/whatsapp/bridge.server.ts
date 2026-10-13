import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { betaConfig } from "./config.server";
import { channel, persist, record, saveText, state, type Inbound, type Job } from "./store.server";
import { handleAssistant } from "../assistant/chat.server";
import { isLocalRequest, sameOrigin } from "../assistant/local-config.server";
const flowResult = z.object({
  flow_token: z.string().max(100),
  attention: z.enum(["ai", "human"]),
  route: z.enum(["PEN_BRL", "BRL_PEN"]),
  amount: z.enum(["200", "300", "500"]),
  billing_type: z.enum(["boleta", "factura"]),
  customer_name: z.string().trim().min(1).max(120),
  billing_email: z.string().email().max(160),
  funds_origin: z.enum(["salary", "savings", "business"]),
  purpose: z.string().max(200),
  recipient: z.enum(["demo_a", "demo_b"]),
  account_type: z.enum(["bank_account", "pix", "cci"]),
  account: z.literal("DEMO_NO_TRANSFERIR"),
  proof: z.array(z.unknown()).max(1).optional(),
  demo: z.literal(true),
});
export function validSignature(raw: string, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(raw).digest(),
  );
}
export function flowMessage(flowId: string, token: string) {
  return {
    type: "interactive",
    interactive: {
      type: "flow",
      header: { type: "text", text: "Brasper · Tu cambio" },
      body: {
        text: "Completa los datos dentro de WhatsApp. Al terminar retomaremos este chat. Usaremos el formulario de pruebas, sin realizar movimientos de dinero.",
      },
      footer: { text: "Registro → revisión interna → envío" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: flowId,
          flow_token: token,
          flow_cta: "Empezar cambio",
          mode: "draft",
          flow_action: "navigate",
          flow_action_payload: { screen: "START", data: {} },
        },
      },
    },
  };
}
async function send(phone: string, payload: Record<string, unknown>) {
  const c = betaConfig();
  if (!c.enabled || !c.token || phone !== c.recipient) throw Error("channel_unavailable");
  if (Date.now() - channel(phone).lastInbound > 86400000) throw Error("conversation_window_closed");
  const r = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      ...payload,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error(`meta_http_${r.status}`);
  const data = await r.json();
  if (!data.messages?.[0]?.id) throw Error("meta_no_message_id");
  record("message_accepted_by_meta");
  return data.messages[0].id as string;
}
async function text(phone: string, value: string) {
  await send(phone, { type: "text", text: { body: value.slice(0, 4000), preview_url: false } });
  saveText(phone, "out", value);
}
async function buttons(phone: string, value: string, choices: [string, string][]) {
  await send(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: value.slice(0, 1000) },
      action: { buttons: choices.map(([id, title]) => ({ type: "reply", reply: { id, title } })) },
    },
  });
  saveText(phone, "out", value);
}
async function chat(phone: string, payload: Record<string, unknown>) {
  const c = channel(phone);
  const r = await handleAssistant(
    new Request("http://127.0.0.1:8692/api/assistant", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:8692",
        Cookie: c.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, context: { step: 0, mode: "native", created: false } }),
    }),
  );
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  if (cookie) c.cookie = cookie;
  const data = await r.json();
  if (data.mode) c.mode = data.mode;
  persist();
  return { ok: r.ok, ...data } as { ok: boolean; mode?: string; answer?: string; error?: string };
}
async function openNativeFlow(phone: string) {
  const c = channel(phone);
  if (c.mode === "human") {
    await text(
      phone,
      "La IA está pausada. Escribe “volver al asistente” para retomar o continúa con una persona.",
    );
    return;
  }
  const token = randomUUID();
  c.flow = { token, expires: Date.now() + 7200000 };
  persist();
  try {
    await send(phone, flowMessage(betaConfig().flowId, token));
    saveText(phone, "out", "Flow Brasper enviado: Empezar cambio");
  } catch (e) {
    delete c.flow;
    persist();
    throw e;
  }
}
async function openFlow(phone: string) {
  const c = channel(phone);
  if (c.mode === "human") {
    await text(phone, "La IA está pausada. Escribe volver al asistente para retomar.");
    return;
  }
  const { createWebSession } = await import("./web-session.server");
  const url = createWebSession(phone);
  try {
    const check = await fetch(new URL("/healthz", url), {
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!check.ok || (await check.json()).ok !== true) throw Error();
  } catch {
    await text(
      phone,
      "El formulario está temporalmente sin conexión. No voy a enviarte un enlace que no abre. Puedes seguir preguntándome y volver a escribir empezar cambio en un momento.",
    );
    record("web_link_unavailable");
    return;
  }
  await send(phone, {
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: {
        text: "Completa el mismo formulario de Brasper: cotización, tus datos, cuenta de destino y comprobante. Al terminar retomamos este chat. Este enlace privado caduca en dos horas.",
      },
      action: { name: "cta_url", parameters: { display_text: "Empezar mi cambio", url } },
    },
  });
  saveText(phone, "out", "Enlace privado al formulario Brasper enviado");
}
export async function notifyWebCompletion(phone: string, id: string) {
  await text(
    phone,
    `Recibí tu solicitud ${id.slice(0, 8)} y el archivo de pago desde la web. Queda pendiente de revisión interna. Todavía no se ha confirmado ingreso ni enviado dinero. Puedes seguir conversando aquí.`,
  );
}

async function completeFlow(phone: string, raw: string) {
  const c = channel(phone);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await text(
      phone,
      "No pude leer el formulario. Escribe “empezar cambio” para abrirlo otra vez.",
    );
    return;
  }
  const result = flowResult.safeParse(parsed);
  if (
    !result.success ||
    !c.flow ||
    result.data.flow_token !== c.flow.token ||
    c.flow.expires < Date.now()
  ) {
    record("flow_rejected");
    await text(
      phone,
      "El formulario no corresponde a una solicitud vigente o faltan datos válidos. Escribe “empezar cambio” para abrir uno nuevo.",
    );
    return;
  }
  const d = result.data;
  c.draft = {
    id: randomUUID(),
    route: d.route,
    amount: d.amount,
    billingType: d.billing_type,
    customer: d.customer_name,
    email: d.billing_email,
    purpose: d.purpose,
    recipient: d.recipient,
    accountType: d.account_type,
    proofCount: d.proof?.length || 0,
    receivedAt: new Date().toISOString(),
    status: "pending_review",
  };
  delete c.flow;
  persist();
  record("flow_received");
  await text(
    phone,
    `Recibí tu formulario ${c.draft.id.slice(0, 8)}: ${d.amount} ${d.route === "PEN_BRL" ? "PEN → BRL" : "BRL → PEN"}. Queda pendiente de revisión interna en esta beta. El comprobante adjunto no confirma ingreso bancario y no se ha enviado dinero. ${c.draft.proofCount ? "Recibimos la referencia del adjunto del Flow; su descarga todavía requiere integración." : "No hay comprobante adjunto."}`,
  );
  if (d.attention === "human") {
    c.mode = "human";
    persist();
    await chat(phone, { action: "human" });
    await buttons(
      phone,
      "Tu solicitud quedó para atención humana. No hay un asesor asignado automáticamente. La IA está pausada.",
      [["resume_ai", "Volver al asistente"]],
    );
  } else
    await buttons(phone, "Podemos seguir conversando aquí. ¿Necesitas resolver una pregunta?", [
      ["ask_ai", "Hacer una pregunta"],
      ["human", "Hablar con persona"],
    ]);
}
export async function processMessage(m: Inbound) {
  const c = channel(m.from);
  c.lastInbound = Math.max(c.lastInbound, Number(m.timestamp) * 1000);
  persist();
  if (m.type === "interactive" && m.interactive?.type === "nfm_reply") {
    await completeFlow(m.from, m.interactive.nfm_reply?.response_json || "");
    return;
  }
  const raw = m.type === "text" ? m.text?.body || "" : m.interactive?.button_reply?.id || "";
  const q = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  saveText(m.from, "in", raw || `[${m.type}]`);
  if (q === "resume_ai" || /^(volver al asistente|retomar ia)$/.test(q)) {
    await chat(m.from, { action: "resume" });
    await text(
      m.from,
      "Volví al chat. Podemos resolver preguntas o abrir el formulario del cambio.",
    );
    return;
  }
  if (c.mode === "human") {
    record("human_message_received", m.id);
    return;
  }
  if (q === "human" || /(hablar|quiero|prefiero).*(persona|humano|asesor)/.test(q)) {
    c.mode = "human";
    persist();
    await chat(m.from, { action: "human" });
    await buttons(
      m.from,
      "Pausé la IA y dejé el caso en la bandeja interna. En esta beta no hay asesor asignado automáticamente.",
      [["resume_ai", "Volver al asistente"]],
    );
    return;
  }
  if (q === "native_flow") {
    await openNativeFlow(m.from);
    return;
  }
  if (
    q === "start_change" ||
    /^(empezar|iniciar|hacer|quiero hacer|quiero iniciar|quiero cambiar|cambiar)( mi| un| el)?( cambio| dinero| soles| reales)?(?:\s+\d+.*)?[.!?]*$/.test(
      q,
    )
  ) {
    await openFlow(m.from);
    return;
  }
  if (/^(hola|buenas|buenos dias|buenas tardes|menu|inicio)[!. ]*$/.test(q)) {
    await buttons(
      m.from,
      "Hola, soy el asistente virtual de Brasper. Puedo responder tus preguntas o ayudarte a completar el cambio dentro de WhatsApp.",
      [
        ["start_change", "Empezar cambio"],
        ["ask_ai", "Hacer una pregunta"],
        ["human", "Hablar con persona"],
      ],
    );
    return;
  }
  if (q === "ask_ai") {
    await text(
      m.from,
      "Escribe tu pregunta. Para ingresar datos personales, cuentas y comprobantes, usaremos el formulario del cambio.",
    );
    return;
  }
  if (m.type === "image" || m.type === "document") {
    await text(
      m.from,
      "Recibí un mensaje con adjunto. Esta beta todavía no descarga esos archivos del chat: usa el formulario y el adjunto de prueba del Flow. Una imagen no confirma un depósito.",
    );
    record("media_download_pending", m.id);
    return;
  }
  if (!raw) {
    await text(
      m.from,
      "Por ahora puedo leer texto y respuestas del formulario. Escribe tu pregunta o “empezar cambio”.",
    );
    return;
  }
  const r = await chat(m.from, { message: raw.slice(0, 1500) });
  await text(
    m.from,
    r.ok
      ? r.answer || "¿En qué puedo ayudarte?"
      : r.error || "No puedo responder ahora. Escribe “empezar cambio” para usar el formulario.",
  );
}
let running = false;
export async function drain() {
  if (running) return;
  running = true;
  try {
    for (const job of state().jobs.filter((j) => j.status === "pending")) {
      job.status = "processing";
      persist();
      try {
        await processMessage(job.message);
        job.status = "done";
      } catch (e) {
        job.status = "failed";
        job.error =
          e instanceof Error &&
          /^meta_http_\d+$|^channel_unavailable$|^conversation_window_closed$/.test(e.message)
            ? e.message
            : "processing_failed";
      }
      persist();
    }
  } finally {
    running = false;
  }
}
async function rawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 65536) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(r.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
export async function whatsappWebhook(request: Request) {
  const c = betaConfig();
  if (!c.enabled) return Response.json({ error: "WhatsApp beta disabled" }, { status: 503 });
  if (request.method === "GET") {
    const q = new URL(request.url).searchParams;
    const token = q.get("hub.verify_token") || "";
    if (
      c.verify &&
      q.get("hub.mode") === "subscribe" &&
      Buffer.byteLength(token) === Buffer.byteLength(c.verify) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(c.verify))
    )
      return new Response(q.get("hub.challenge") || "", {
        headers: { "Cache-Control": "no-store" },
      });
    return new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let raw: string;
  try {
    raw = await rawBody(request);
  } catch {
    return new Response("Invalid body", { status: 413 });
  }
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), c.secret))
    return new Response("Forbidden", { status: 403 });
  try {
    const body = JSON.parse(raw);
    if (body.object !== "whatsapp_business_account") return new Response("Ignored");
    const s = state();
    for (const entry of body.entry || [])
      for (const change of entry.changes || []) {
        const value = change.value;
        if (change.field !== "messages" || value?.metadata?.phone_number_id !== c.phoneId) continue;
        for (const msg of value.messages || []) {
          if (
            msg.from !== c.recipient ||
            !/^\d{8,15}$/.test(msg.from) ||
            typeof msg.id !== "string" ||
            msg.id.length > 200 ||
            s.jobs.some((j) => j.id === msg.id)
          )
            continue;
          const timestamp = Number(msg.timestamp) * 1000;
          if (
            !Number.isFinite(timestamp) ||
            Date.now() - timestamp > 86400000 ||
            timestamp > Date.now() + 300000
          )
            continue;
          if (
            s.jobs.filter((j) => j.status === "pending" || j.status === "processing").length >= 100
          )
            return new Response("Busy", { status: 503 });
          s.jobs.push({ id: msg.id, message: msg, status: "pending" });
        }
        for (const st of value.statuses || []) {
          if (st.recipient_id === c.recipient)
            record("delivery_" + String(st.status).slice(0, 20), String(st.id).slice(0, 200));
        }
      }
    s.jobs = s.jobs.slice(-1000);
    persist();
    setTimeout(() => {
      void drain();
    }, 0);
    return new Response("EVENT_RECEIVED");
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
}
export async function inbox(request: Request) {
  if (!isLocalRequest(request) || (request.method === "POST" && !sameOrigin(request)))
    return Response.json({ error: "Local only" }, { status: 403 });
  if (request.method === "GET") {
    const proofId = new URL(request.url).searchParams.get("proof");
    if (proofId) {
      const owner = Object.values(state().channels).find((c) => c.web?.operationId === proofId);
      const stored = owner?.web?.data?.["proofPath"];
      const root = resolve(process.cwd(), "artifacts/whatsapp-beta/proofs");
      if (typeof stored !== "string" || !resolve(stored).startsWith(root + sep))
        return new Response("Not found", { status: 404 });
      try {
        return new Response(readFileSync(stored), {
          headers: {
            "Content-Type": stored.endsWith(".pdf")
              ? "application/pdf"
              : stored.endsWith(".png")
                ? "image/png"
                : "image/jpeg",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
    const c = betaConfig();
    return Response.json(
      {
        configured: !!(c.token && c.secret && c.verify),
        recipient: c.recipient,
        channels: Object.fromEntries(
          Object.entries(state().channels).map(([phone, c]) => [
            phone,
            {
              mode: c.mode,
              draft: c.draft,
              history: c.history,
              webData: c.web?.data
                ? Object.fromEntries(Object.entries(c.web.data).filter(([k]) => k !== "proofPath"))
                : null,
            },
          ]),
        ),
        jobs: state().jobs.map(({ id, status, error }) => ({ id, status, error })),
        events: state().events,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const body = await request.json();
    if (body.action === "preview_web") {
      const { createWebSession } = await import("./web-session.server");
      return Response.json(
        { url: createWebSession("00000000000") },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.action !== "send_test")
      return Response.json({ error: "Acción no permitida" }, { status: 400 });
    const c = betaConfig();
    if (!c.enabled || !c.token || !c.recipient)
      return Response.json({ error: "Faltan credenciales" }, { status: 503 });
    const r = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: c.recipient,
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      return Response.json(
        {
          error: `Meta rechazó el saludo (HTTP ${r.status}). Verifica token y destinatario autorizado.`,
        },
        { status: 502 },
      );
    const data = await r.json();
    if (!data.messages?.[0]?.id) throw Error();
    record("test_greeting_accepted");
    return Response.json({
      message:
        "Meta aceptó el saludo. Responde hola desde tu teléfono para abrir la conversación; aceptación no confirma entrega.",
    });
  } catch {
    return Response.json({ error: "No se pudo enviar el saludo." }, { status: 502 });
  }
}
