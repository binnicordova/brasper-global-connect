import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { channel, state, persist, record } from "./store.server";
import { localSetting, isLocalRequest } from "../assistant/local-config.server";
import { recipientDetailsInput, quoteAmounts, validateProof } from "../transfers";
import { demoRates } from "../demo-fixtures";
export function createWebSession(phone: string) {
  const c = channel(phone);
  const base = localSetting("WHATSAPP_CALLBACK_URL").replace(/\/api\/whatsapp\/webhook$/, "");
  if (!/^https:\/\//.test(base)) throw Error("Public URL unavailable");
  if (c.web && c.web.expires > Date.now() && !c.web.operationId)
    return base + "/cambio/" + c.web.token;
  const token = randomBytes(32).toString("base64url");
  c.web = { token, expires: Date.now() + 7200000 };
  persist();
  return base + "/cambio/" + token;
}
function owner(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return Object.entries(state().channels).find(
    ([, c]) => c.web?.token === token && c.web.expires > Date.now(),
  );
}
export async function webSession(request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const reply = (d: unknown, status = 200) => Response.json(d, { status, headers });
  if (!isLocalRequest(request)) return reply({ error: "Local adapter only" }, 403);
  if (request.method === "GET") {
    const token = new URL(request.url).searchParams.get("token") || "";
    const found = owner(token);
    return found
      ? reply({ valid: true, completed: !!found[1].web?.operationId })
      : reply({ error: "El enlace no existe o caducó." }, 401);
  }
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (Number(request.headers.get("content-length") || 0) > 5500000)
    return reply({ error: "El archivo supera el límite." }, 413);
  try {
    const form = await request.formData();
    const token = String(form.get("token") || "");
    const found = owner(token);
    if (!found) return reply({ error: "El enlace no existe o caducó." }, 401);
    const [phone, c] = found;
    if (c.web?.operationId) return reply({ id: c.web.operationId, duplicate: true });
    if (form.get("declaration") !== "yes")
      return reply({ error: "Confirma la declaración antes de continuar." }, 400);
    const raw = String(form.get("payload") || "");
    if (raw.length > 15000) return reply({ error: "Datos demasiado grandes." }, 413);
    const parsed = recipientDetailsInput.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return reply({ error: parsed.error.issues[0]?.message || "Revisa los datos." }, 400);
    const v = parsed.data;
    const rate = demoRates().find((r) => r.id === v.rateId);
    if (
      !rate ||
      v.amount < rate.min_amount ||
      v.amount > rate.max_amount ||
      v.sourceCountry !== (rate.from_currency === "PEN" ? "PE" : "BR") ||
      v.destinationCountry !== (rate.to_currency === "PEN" ? "PE" : "BR") ||
      (rate.to_currency === "BRL" ? v.billingType !== "nfse" : v.billingType === "nfse")
    )
      return reply({ error: "La ruta y los datos fiscales no corresponden." }, 400);
    const proof = form.get("proof");
    if (!proof || typeof proof === "string")
      return reply(
        { error: "Adjunta el comprobante para registrar esta solicitud de WhatsApp." },
        400,
      );
    validateProof(proof);
    const bankReference = String(form.get("bankReference") || "");
    if (!/^[A-Za-z0-9-]{2,60}$/.test(bankReference))
      return reply({ error: "Revisa el número de operación bancaria." }, 400);
    const bytes = Buffer.from(await proof.arrayBuffer());
    const pdf = bytes.subarray(0, 5).toString() === "%PDF-",
      png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!(
      (proof.type === "application/pdf" && pdf) ||
      (proof.type === "image/png" && png) ||
      (proof.type === "image/jpeg" && jpg)
    ))
      return reply({ error: "El contenido del archivo no coincide con su formato." }, 400);
    const id = randomUUID(),
      ext = pdf ? "pdf" : png ? "png" : "jpg",
      dir = resolve(process.cwd(), "artifacts/whatsapp-beta/proofs");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = resolve(dir, id + "." + ext);
    writeFileSync(file, bytes, { mode: 0o600 });
    const quote = quoteAmounts(v.amount, rate.rate, rate.commission_percent);
    c.web!.operationId = id;
    c.web!.data = { ...v, bankReference, quote, proofPath: file };
    c.draft = {
      id,
      route: rate.from_currency + "_" + rate.to_currency,
      amount: String(v.amount),
      billingType: v.billingType,
      customer: v.customerName,
      email: v.billingEmail,
      purpose: v.transferPurpose,
      recipient: v.recipientName,
      accountType: v.recipientAccountType,
      proofCount: 1,
      receivedAt: new Date().toISOString(),
      status: "pending_review",
    };
    persist();
    record("web_form_received");
    const { notifyWebCompletion } = await import("./bridge.server");
    try {
      await notifyWebCompletion(phone, id);
    } catch {
      record("web_confirmation_pending");
    }
    return reply({ id });
  } catch {
    return reply(
      { error: "No se pudo registrar la solicitud. Revisa los campos o vuelve a intentar." },
      400,
    );
  }
}
