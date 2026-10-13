/** Meta Flow envelope and media protocol. Uses Web Crypto in Edge and tests. */
export function from64(value: string) {
  if (
    typeof value !== "string" ||
    value.length > 8_000_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw Error("Invalid encoding");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function to64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}
export async function openEnvelope(body: Record<string, string>, privatePem: string) {
  const der = from64(privatePem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
  const rsa = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const aesBytes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsa,
    from64(body["encrypted_aes_key"]!),
  );
  if (aesBytes.byteLength !== 16) throw Error("Invalid AES key");
  const key = await crypto.subtle.importKey("raw", aesBytes, "AES-GCM", false, [
    "decrypt",
    "encrypt",
  ]);
  const iv = from64(body["initial_vector"]!);
  if (iv.length !== 16) throw Error("Invalid IV");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    from64(body["encrypted_flow_data"]!),
  );
  return { payload: JSON.parse(new TextDecoder().decode(plain)), key, iv };
}
export async function sealResponse(payload: unknown, key: CryptoKey, iv: Uint8Array) {
  const flipped = iv.map((b) => b ^ 255);
  return to64(
    new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new Uint8Array(flipped) },
        key,
        new TextEncoder().encode(JSON.stringify(payload)),
      ),
    ),
  );
}
async function stateKey(secret: string) {
  if (secret.length < 32) throw Error("Session secret required");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("brasper-native-flow-auth:" + secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealGuest(value: unknown, secret: string, sessionId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(sessionId) },
    await stateKey(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return to64(iv) + "." + to64(new Uint8Array(body));
}
export async function openGuest(value: string, secret: string, sessionId: string) {
  const [iv, body] = value.split(".");
  if (!iv || !body) throw Error("Invalid guest state");
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: from64(iv), additionalData: new TextEncoder().encode(sessionId) },
        await stateKey(secret),
        from64(body),
      ),
    ),
  );
}
export type FlowMedia = {
  cdn_url: string;
  encryption_metadata: {
    encrypted_hash: string;
    plaintext_hash: string;
    encryption_key: string;
    hmac_key: string;
    iv: string;
  };
};
export function trustedMediaUrl(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !["mmg.whatsapp.net", "lookaside.fbsbx.com", "cdn.fbsbx.com"].some(
      (host) => u.hostname === host || u.hostname.endsWith("." + host),
    )
  )
    throw Error("Untrusted media host");
  return u;
}
export async function decryptMedia(file: Uint8Array, meta: FlowMedia["encryption_metadata"]) {
  if (file.length < 26 || file.length > 5 * 1024 * 1024 + 1024)
    throw Error("File too large or empty");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(file)));
  if (!same(digest, from64(meta.encrypted_hash))) throw Error("Encrypted media hash mismatch");
  const ciphertext = file.subarray(0, file.length - 10),
    mac = file.subarray(file.length - 10),
    iv = from64(meta.iv);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    from64(meta.hmac_key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(iv.length + ciphertext.length);
  signed.set(iv);
  signed.set(ciphertext, iv.length);
  if (!same(mac, new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, signed)).subarray(0, 10)))
    throw Error("Media authentication failed");
  const key = await crypto.subtle.importKey("raw", from64(meta.encryption_key), "AES-CBC", false, [
    "decrypt",
  ]);
  // Web Crypto validates and removes PKCS#7 padding.
  const clear = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, new Uint8Array(ciphertext)),
  );
  if (
    !same(new Uint8Array(await crypto.subtle.digest("SHA-256", clear)), from64(meta.plaintext_hash))
  )
    throw Error("Plain media hash mismatch");
  const signature = Array.from(clear.subarray(0, 8));
  const type =
    signature[0] === 255 && signature[1] === 216 && signature[2] === 255
      ? "image/jpeg"
      : signature.join(",") === "137,80,78,71,13,10,26,10"
        ? "image/png"
        : new TextDecoder().decode(clear.subarray(0, 5)) === "%PDF-"
          ? "application/pdf"
          : null;
  if (!type || clear.length > 5 * 1024 * 1024) throw Error("Adjunta JPG, PNG o PDF de hasta 5 MB.");
  return {
    bytes: clear,
    type,
    extension: type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg",
    hash: Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", clear)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  };
}
export async function boundedBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error("Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
