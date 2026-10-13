// Run after Lovable deploy. Registers the draft and checks the encrypted endpoint; never publishes it.
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import {
  createHmac,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  constants,
} from "node:crypto";
const env = { ...process.env };
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
}
const token = env.WHATSAPP_ACCESS_TOKEN,
  phone = env.WHATSAPP_PHONE_NUMBER_ID,
  flow = env.WHATSAPP_FLOW_ID;
if (!token || !phone || !flow || !env.META_APP_SECRET)
  throw Error("Configura el acceso vigente de Meta, el número y el Flow existentes en .env.local.");
if (!/^\d+$/.test(phone) || !/^\d+$/.test(flow)) throw Error("IDs no válidos");
const endpoint =
  env.WHATSAPP_FLOW_ENDPOINT ||
  "https://lfjnywpvunfrvkgcfobl.supabase.co/functions/v1/whatsapp-flow";
const u = new URL(endpoint);
if (
  u.protocol !== "https:" ||
  u.hostname !== "lfjnywpvunfrvkgcfobl.supabase.co" ||
  u.pathname !== "/functions/v1/whatsapp-flow"
)
  throw Error("Comprueba el endpoint del mismo backend.");
const privatePem = readFileSync("artifacts/whatsapp-beta/native-flow-private.pem", "utf8");
const publicPem = createPublicKey(privatePem).export({ type: "spki", format: "pem" }).toString();
async function graph(path, init = {}) {
  const r = await fetch("https://graph.facebook.com/v25.0/" + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, ...init.headers },
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json();
  if (!r.ok || d.error)
    throw Error(`Meta ${d.error?.code || r.status}: ${d.error?.message || "Solicitud rechazada"}`);
  return d;
}
const before = await graph(flow + "?fields=id,status");
if (before.status !== "DRAFT") throw Error("Este comando solo modifica un Flow borrador.");
async function validateDraftJson() {
  const form = new FormData();
  form.set("name", "flow.json");
  form.set("asset_type", "FLOW_JSON");
  form.set(
    "file",
    new Blob([readFileSync("public/whatsapp-flows/brasper-native.json")], {
      type: "application/json",
    }),
    "flow.json",
  );
  const asset = await graph(flow + "/assets", { method: "POST", body: form });
  if (asset.validation_errors?.length) {
    console.log(JSON.stringify({ validation_errors: asset.validation_errors }, null, 2));
    throw Error("Corrige los errores de JSON antes de activar.");
  }
  return asset;
}
if (process.argv.includes("--validate-json")) {
  const asset = await validateDraftJson();
  console.log(
    JSON.stringify(
      {
        flow_id: flow,
        status: before.status,
        jsonValidated: true,
        validation_errors: asset.validation_errors || [],
      },
      null,
      2,
    ),
  );
  console.log(
    "JSON guardado en el borrador; el endpoint todavía requiere su comprobación cifrada.",
  );
  process.exit(0);
}
const aes = randomBytes(16),
  iv = randomBytes(16),
  cipher = createCipheriv("aes-128-gcm", aes, iv);
const checkOnly = process.argv.includes("--check-endpoint");
const clear = JSON.stringify(
  checkOnly
    ? { version: "3.0", action: "INIT", flow_token: "invalid-readonly-diagnostic" }
    : { version: "3.0", action: "ping" },
);
const encrypted = Buffer.concat([
  cipher.update(clear, "utf8"),
  cipher.final(),
  cipher.getAuthTag(),
]);
const body = JSON.stringify({
  encrypted_flow_data: encrypted.toString("base64"),
  encrypted_aes_key: publicEncrypt(
    { key: publicPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aes,
  ).toString("base64"),
  initial_vector: iv.toString("base64"),
});
// An early Edge rejection can confuse Node 25 fetch's body writer. Send a bounded HTTP/1 body.
const ping = await new Promise((resolve, reject) => {
  const bytes = Buffer.from(body, "utf8");
  const req = httpsRequest(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(bytes.length),
        "x-hub-signature-256":
          "sha256=" + createHmac("sha256", env.META_APP_SECRET).update(bytes).digest("hex"),
      },
    },
    (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > 256 * 1024) {
          req.destroy(Error("Respuesta demasiado grande"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () =>
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => Buffer.concat(chunks).toString("utf8"),
        }),
      );
      res.on("error", reject);
    },
  );
  req.setTimeout(15000, () => req.destroy(Error("El endpoint tardó demasiado")));
  req.on("error", reject);
  req.end(bytes);
});
if (!ping.ok)
  throw Error(
    `Despliega whatsapp-flow y configura la clave privada/app secret antes de registrar: HTTP ${ping.status}`,
  );
const result = Buffer.from(await ping.text(), "base64"),
  decipher = createDecipheriv("aes-128-gcm", aes, Buffer.from(iv.map((b) => b ^ 255)));
decipher.setAuthTag(result.subarray(result.length - 16));
const decoded = JSON.parse(
  Buffer.concat([
    decipher.update(result.subarray(0, result.length - 16)),
    decipher.final(),
  ]).toString("utf8"),
);
if (checkOnly) {
  const compatible =
    decoded.screen === "QUOTE" &&
    typeof decoded.data?.amount === "number" &&
    !!decoded.data?.error_message;
  console.log(
    JSON.stringify({
      status: ping.status,
      screen: decoded.screen,
      amountType: typeof decoded.data?.amount,
      invalidSessionRejected: !!decoded.data?.error_message,
      compatible,
    }),
  );
  if (!compatible)
    throw Error(
      "Vuelve a desplegar whatsapp-flow con el modelo actualizado: amount debe ser numérico.",
    );
  process.exit(0);
}
if (decoded.data?.status !== "active")
  throw Error("El endpoint no respondió al protocolo de Meta.");
await validateDraftJson();
await graph(flow, {
  method: "POST",
  body: new URLSearchParams({
    endpoint_uri: endpoint,
    application_id: env.WHATSAPP_APP_ID || "2190725181540988",
  }),
});
await graph(phone + "/whatsapp_business_encryption", {
  method: "POST",
  body: new URLSearchParams({ business_public_key: publicPem }),
});
const verified = await graph(
  flow + "?fields=id,status,validation_errors,endpoint_uri,health_status",
);
console.log(
  JSON.stringify(
    {
      flow_id: verified.id,
      status: verified.status,
      endpoint: verified.endpoint_uri,
      validation_errors: verified.validation_errors,
      health_status: verified.health_status,
    },
    null,
    2,
  ),
);
console.log(
  "Borrador registrado. Mantén WHATSAPP_FLOW_STATUS=draft. Activa WHATSAPP_FLOW_MODE=native solo cuando la validación y la prueba móvil pasen.",
);
