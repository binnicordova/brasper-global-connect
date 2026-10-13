import { admin, webOrigin, tokenId, text } from "../_shared/whatsapp-cloud.ts";
Deno.serve(async (request: Request) => {
  let origin: string;
  try {
    origin = webOrigin();
  } catch {
    return Response.json({ error: "Configure WHATSAPP_WEB_URL" }, { status: 503 });
  }
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const json = (d: unknown, status = 200) => Response.json(d, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST" || request.headers.get("origin") !== origin)
    return json({ error: "Origen no autorizado" }, 403);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Invalid request" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4000) {
        await reader.cancel();
        return json({ error: "Invalid request" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder().decode(bytes);
    const body = JSON.parse(raw);
    const id = await tokenId(body.token || "");
    const db = admin();
    const jwt = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const {
      data: { user },
      error,
    } = await db.auth.getUser(jwt);
    if (error || !user) return json({ error: "Abre tu acceso de invitado para continuar." }, 401);
    const { data: s, error: claim } = await db.rpc("claim_whatsapp_session", {
      p_id: id,
      p_user: user.id,
    });
    if (claim || !s) return json({ error: "Este enlace caducó o pertenece a otro acceso." }, 403);
    if (body.action === "claim") return json({ sessionId: s.id, transferId: s.transfer_id });
    if (body.action !== "complete" || !s.transfer_id || s.transfer_id !== body.transferId)
      return json({ error: "Solicitud no vinculada" }, 400);
    const { data: t } = await db
      .from("transfers")
      .select("id,user_id,status,proof_path")
      .eq("id", s.transfer_id)
      .single();
    if (
      !t ||
      t.user_id !== user.id ||
      !t.proof_path ||
      !["proof_submitted", "verified", "paid_out", "completed"].includes(t.status)
    )
      return json(
        { error: "La operación está guardada; falta enviar el comprobante a revisión." },
        409,
      );
    if (s.notification_state === "accepted") return json({ ok: true, notified: true });
    // Reserve the attempt; no blind duplicate send on uncertain provider timeout.
    const { data: reserved } = await db
      .from("whatsapp_sessions")
      .update({ notification_state: "failed" })
      .eq("id", s.id)
      .eq("notification_state", "pending")
      .select("id");
    if (!reserved?.length) return json({ ok: true, notified: false, reviewRequired: true });
    try {
      await text(
        s.phone,
        `Recibí tu solicitud ${s.transfer_id.slice(0, 8)} y su comprobante desde la web de Brasper. El equipo verificará el ingreso antes de continuar. Puedes seguir conversando aquí.`,
      );
      await db.from("whatsapp_sessions").update({ notification_state: "accepted" }).eq("id", s.id);
      return json({ ok: true, notified: true });
    } catch {
      return json({ ok: true, notified: false, reviewRequired: true });
    }
  } catch {
    return json({ error: "Enlace o solicitud no válidos." }, 400);
  }
});
