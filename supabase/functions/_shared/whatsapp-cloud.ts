import { createClient } from "npm:@supabase/supabase-js@2";
export const env = (name: string) => Deno.env.get(name) || "";
export const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
export function webOrigin() {
  const u = new URL(env("WHATSAPP_WEB_URL"));
  if (u.protocol !== "https:") throw Error("HTTPS web required");
  return u.origin;
}
export { mac, equal } from "./whatsapp-token.ts";
import { signSession, verifySession } from "./whatsapp-token.ts";
export const sessionToken = (s: { id: string; expires_at: string }) =>
  signSession(s, env("WHATSAPP_SESSION_SECRET"));
export const tokenId = (token: string) => verifySession(token, env("WHATSAPP_SESSION_SECRET"));
export async function send(phone: string, payload: Record<string, unknown>) {
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw Error("Invalid recipient");
  const db = admin();
  const { data: c } = await db
    .from("whatsapp_channels")
    .select("last_inbound")
    .eq("phone", phone)
    .single();
  if (!c || Date.now() - new Date(c.last_inbound).getTime() > 86400000)
    throw Error("Window closed");
  const version = env("WHATSAPP_GRAPH_VERSION") || "v25.0";
  if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(env("WHATSAPP_PHONE_NUMBER_ID")))
    throw Error("Invalid configuration");
  const r = await fetch(
    `https://graph.facebook.com/${version}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, ...payload }),
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!r.ok) throw Error("Meta request failed");
  const d = await r.json();
  if (!d.messages?.[0]?.id) throw Error("Meta result missing");
  return d.messages[0].id;
}
export const text = (phone: string, body: string) =>
  send(phone, { type: "text", text: { body: body.slice(0, 4000), preview_url: false } });
