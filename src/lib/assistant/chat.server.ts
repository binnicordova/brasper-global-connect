import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isLocalRequest, sameOrigin, localSetting } from "./local-config.server";
import { classify, facts, instructions, steps, type Topic } from "./policy";
const input = z
  .object({
    message: z.string().trim().min(1).max(1500).optional(),
    action: z.enum(["ask", "human", "resume", "reset", "start", "faq"]).default("ask"),
    topic: z
      .enum(["requirements", "billing", "proof", "rates", "hours", "account", "status"])
      .optional(),
    context: z
      .object({
        step: z.number().int().min(0).max(3),
        mode: z.enum(["web", "native"]),
        created: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
type Session = {
  messages: { role: "user" | "assistant"; content: string }[];
  mode: "assistant" | "human";
  expires: number;
  count: number;
  window: number;
};
const sessions = new Map<string, Session>();
let usage = { day: "", calls: 0, minute: 0, minuteCalls: 0, active: 0 };
const cookieName = "brasper_local_assistant";
function getSession(request: Request) {
  const now = Date.now();
  for (const [id, s] of sessions) if (s.expires < now) sessions.delete(id);
  const supplied = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  const id = supplied && sessions.has(supplied) ? supplied : randomUUID();
  if (!sessions.has(id)) {
    if (sessions.size >= 200) sessions.delete(sessions.keys().next().value!);
    sessions.set(id, {
      messages: [],
      mode: "assistant",
      expires: now + 1800000,
      count: 0,
      window: now,
    });
  }
  const session = sessions.get(id)!;
  session.expires = now + 1800000;
  return { id, session };
}
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
export async function handleAssistant(request: Request) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  const send = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (!isLocalRequest(request))
    return send({ error: "Este asistente está habilitado solo en local." }, 403);
  if (request.method === "POST" && !sameOrigin(request))
    return send({ error: "Origen no autorizado." }, 403);
  const { id, session } = getSession(request);
  headers["Set-Cookie"] =
    `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/api/assistant; Max-Age=1800`;
  const key = localSetting("OPENAI_API_KEY");
  if (request.method === "GET")
    return send({
      configured: !!key,
      mode: session.mode,
      messages: session.messages,
      provider: "OpenAI",
      local: true,
    });
  if (request.method !== "POST") return send({ error: "Método no permitido." }, 405);
  let body: z.infer<typeof input>;
  try {
    body = input.parse(await boundedBody(request));
  } catch {
    return send({ error: "Mensaje o contexto inválido." }, 400);
  }
  const now = Date.now();
  if (now - session.window > 60000) {
    session.window = now;
    session.count = 0;
  }
  if (++session.count > 20) return send({ error: "Espera un minuto antes de continuar." }, 429);
  const answer = (text: string, source = "flow", action: string | null = null) => {
    if (body.message) session.messages.push({ role: "user", content: body.message });
    session.messages.push({ role: "assistant", content: text });
    session.messages = session.messages.slice(-16);
    return send({ answer: text, source, action, mode: session.mode });
  };
  if (body.action === "reset") {
    session.messages = [];
    session.mode = "assistant";
    return answer("Empecemos de nuevo. ¿Quieres iniciar tu cambio o resolver una pregunta?");
  }
  if (body.action === "resume") {
    session.mode = "assistant";
    return answer(
      "Estoy de vuelta. Los datos de tu formulario se mantienen; puedes seguir donde estabas.",
    );
  }
  if (
    body.action === "human" ||
    (session.mode === "assistant" && body.message && classify(body.message) === "human")
  ) {
    session.mode = "human";
    return answer(
      "Pausé la IA. En esta prueba local no hay un asesor conectado. Puedes copiar el resumen de la conversación y continuar el formulario; cuando quieras, pulsa “Volver al asistente”.",
      "flow",
      "human",
    );
  }
  if (session.mode === "human")
    return answer(
      "La IA está pausada para atención humana. Pulsa “Volver al asistente” si quieres retomarla.",
    );
  if (body.action === "faq") {
    if (!body.topic) return send({ error: "Falta el tema." }, 400);
    return answer(facts[body.topic]);
  }
  if (body.action === "start") return answer(steps[body.context?.step || 0]!, "flow", "start");
  if (!body.message) return send({ error: "Escribe una pregunta." }, 400);
  const topic = classify(body.message);
  if (topic === "forbidden")
    return answer(
      "El ingreso se verifica y el envío se registra desde el dashboard por el equipo autorizado. El chat no puede aprobar, cancelar ni enviar dinero. Puedo ayudarte a entender el siguiente paso.",
    );
  if (topic === "start") return answer(steps[body.context?.step || 0]!, "flow", "start");
  if (topic && topic !== "human") return answer(facts[topic as Topic]);
  if (!key)
    return send(
      {
        error:
          "La IA aún no tiene clave local. Puedes usar las preguntas frecuentes y el formulario.",
        code: "missing_key",
      },
      503,
    );
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, calls: 0, minute: 0, minuteCalls: 0, active: 0 };
  const minute = Math.floor(now / 60000);
  if (usage.minute !== minute) {
    usage.minute = minute;
    usage.minuteCalls = 0;
  }
  if (usage.calls >= 100 || usage.minuteCalls >= 10 || usage.active >= 2)
    return send(
      { error: "Se alcanzó el límite de esta prueba local. El formulario sigue disponible." },
      429,
    );
  usage.calls++;
  usage.minuteCalls++;
  usage.active++;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: localSetting("OPENAI_MODEL") || "gpt-4.1-mini",
        store: false,
        max_output_tokens: 450,
        instructions:
          instructions +
          "\nContexto informativo del formulario (no acredita eventos externos): " +
          JSON.stringify(body.context || {}),
        input: [...session.messages, { role: "user", content: body.message }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      return send(
        {
          error:
            response.status === 401
              ? "La clave fue rechazada. Revisa la configuración local."
              : response.status === 429
                ? "OpenAI no puede atender ahora por cuota o límite. El formulario sigue disponible."
                : "La IA no está disponible ahora. Puedes reintentar o usar las preguntas frecuentes.",
          code: "provider_error",
        },
        502,
      );
    const result = await response.json();
    const text = (result.output || [])
      .filter((o: { type: string }) => o.type === "message")
      .flatMap((o: { content: { type: string; text?: string }[] }) => o.content || [])
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text: string }) => c.text)
      .join("\n")
      .trim();
    if (!text)
      return send({ error: "No se recibió una respuesta completa. Puedes reintentar." }, 502);
    return answer(text.slice(0, 6000), "ai");
  } catch {
    return send(
      { error: "La IA tardó demasiado o no pudo conectar. El formulario sigue disponible." },
      504,
    );
  } finally {
    usage.active--;
  }
}
