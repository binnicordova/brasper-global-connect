export async function mac(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
export async function signSession(s: { id: string; expires_at: string }, secret: string) {
  if (secret.length < 32) throw Error("Session secret required");
  const stamp = Math.floor(new Date(s.expires_at).getTime() / 1000);
  const data = s.id + "." + stamp;
  return data + "." + (await mac(secret, data));
}
export async function verifySession(token: string, secret: string, now = Date.now()) {
  const parts = token.split(".");
  const [id = "", stamp = "", signature = ""] = parts;
  if (
    parts.length !== 3 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) ||
    !/^\d{10}$/.test(stamp) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Number(stamp) * 1000 <= now ||
    secret.length < 32
  )
    throw Error("Invalid link");
  const expected = await mac(secret, id + "." + stamp);
  if (!equal(signature, expected)) throw Error("Invalid link");
  return id;
}
