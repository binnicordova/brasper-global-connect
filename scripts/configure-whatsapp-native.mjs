// Run after Lovable deploy. Registers the draft and checks the encrypted endpoint; never publishes it.
import { readFileSync } from "node:fs";
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
const aes = randomBytes(16),
  iv = randomBytes(16),
  cipher = createCipheriv("aes-128-gcm", aes, iv);
const clear = JSON.stringify({ version: "3.0", action: "ping" });
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
const ping = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-hub-signature-256":
      "sha256=" + createHmac("sha256", env.META_APP_SECRET).update(body).digest("hex"),
  },
  body,
  signal: AbortSignal.timeout(15000),
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
if (decoded.data?.status !== "active")
  throw Error("El endpoint no respondió al protocolo de Meta.");
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
await graph(flow, { method: "POST", body: new URLSearchParams({ endpoint_uri: endpoint }) });
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
