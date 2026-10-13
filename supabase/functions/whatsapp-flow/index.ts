import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, env, mac, equal, tokenId } from "../_shared/whatsapp-cloud.ts";
import {
  openEnvelope,
  sealResponse,
  sealGuest,
  openGuest,
  trustedMediaUrl,
  decryptMedia,
  boundedBytes,
  type FlowMedia,
} from "../_shared/whatsapp-flow-crypto.ts";
import {
  flowSteps,
  collectStage,
  renderFlow,
  quoteFor,
  nativeTransferInput,
  transferArgs,
  oneProof,
  type FlowStep,
} from "../_shared/whatsapp-flow-model.ts";
import { validIdentityDocument } from "../_shared/transfer-input.ts";
const headers = { "Content-Type": "text/plain", "Cache-Control": "no-store" };
const fail = (s: number) => new Response("Flow unavailable", { status: s, headers });
const next = (s: FlowStep) => flowSteps[flowSteps.indexOf(s) + 1] || "PAYMENT";
function userError(e: unknown) {
  const err = e as { issues?: { message: string }[]; message?: string };
  return (
    err.issues?.[0]?.message ||
    (/^(Ingresa|Revisa|Adjunta|Completa|Indica|El monto|La cotización|Tipo de cuenta|Solicitud en curso)/.test(
      err.message || "",
    )
      ? err.message!
      : "No pudimos completar este paso. Intenta de nuevo; tu operación no se duplicará.")
  );
}
async function guest(db: ReturnType<typeof admin>, state: any, s: any) {
  const key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw Error("Guest configuration missing");
  const client = createClient(env("SUPABASE_URL"), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let credentials: any;
  if (state.auth_cipher) {
    credentials = await openGuest(state.auth_cipher, env("WHATSAPP_SESSION_SECRET"), s.id);
    const refreshed = await client.auth.setSession(credentials);
    if (refreshed.error || !refreshed.data.session) throw Error("Guest access expired");
    credentials = {
      access_token: refreshed.data.session.access_token,
      refresh_token: refreshed.data.session.refresh_token,
    };
  } else {
    // A real anonymous Supabase session, never a service-role financial mutation.
    if (s.claimed_by) throw Error("This link is already claimed");
    const auth = await client.auth.signInAnonymously();
    if (auth.error || !auth.data.session) throw Error("Guest access unavailable");
    credentials = {
      access_token: auth.data.session.access_token,
      refresh_token: auth.data.session.refresh_token,
    };
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || user.is_anonymous !== true || (s.claimed_by && s.claimed_by !== user.id))
    throw Error("Guest identity mismatch");
  // Persist encrypted credentials before claiming, so a retry recovers the same user.
  const saved = await db
    .from("whatsapp_flow_states")
    .update({ auth_cipher: await sealGuest(credentials, env("WHATSAPP_SESSION_SECRET"), s.id) })
    .eq("session_id", s.id)
    .eq("processing_id", state.processing_id);
  if (saved.error) throw Error("Cannot save guest identity");
  const claim = await db.rpc("claim_whatsapp_session", { p_id: s.id, p_user: user.id });
  if (claim.error) throw Error("Cannot claim flow");
  return { client, user };
}
async function finish(
  db: ReturnType<typeof admin>,
  state: any,
  s: any,
  d: Record<string, any>,
  input: Record<string, unknown>,
) {
  if (input.declaration !== true) throw Error("Completa la confirmación de los datos.");
  if (
    typeof input.bank_reference !== "string" ||
    input.bank_reference.trim().length < 2 ||
    input.bank_reference.length > 100
  )
    throw Error("Indica el número de operación bancaria.");
  const valid = nativeTransferInput(d, s.phone);
  const media = oneProof(input) as FlowMedia;
  if (!media || !media.encryption_metadata || typeof media.cdn_url !== "string")
    throw Error("Adjunta nuevamente el comprobante.");
  const url = trustedMediaUrl(media.cdn_url);
  const download = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!download.ok) throw Error("Adjunta nuevamente el comprobante.");
  const proof = await decryptMedia(
    await boundedBytes(download as unknown as Request, 5 * 1024 * 1024 + 1024),
    media.encryption_metadata,
  );
  const { client, user } = await guest(db, state, s);
  const created = await client.rpc("create_whatsapp_native_transfer", {
    p_session_id: s.id,
    p_data: transferArgs(valid),
    p_expected_rate: d.rate_value,
    p_expected_commission: d.commission_percent,
  });
  if (created.error || !created.data)
    throw new Error(created.error?.message || "Cannot create transfer");
  const id = String(created.data);
  const { data: t, error: lookup } = await client
    .from("transfers")
    .select("id,status,proof_path")
    .eq("id", id)
    .single();
  if (lookup || !t) throw Error("Cannot read transfer");
  if (t.status === "awaiting_payment") {
    const path = `${user.id}/${id}/deposit/wa-${proof.hash}.${proof.extension}`;
    const upload = await client.storage
      .from("transfer-proofs")
      .upload(path, proof.bytes, { contentType: proof.type, upsert: false });
    // A content-addressed retry can reuse the exact same upload; never overwrite it.
    if (upload.error) {
      const exists = await client.storage.from("transfer-proofs").download(path);
      if (exists.error || !exists.data) throw Error("Adjunta nuevamente el comprobante.");
    }
    const attached = await client.rpc("submit_transfer_proof", {
      p_transfer_id: id,
      p_path: path,
      p_bank_reference: input.bank_reference.trim(),
    });
    if (attached.error) throw Error("Cannot attach proof");
  } else if (
    !["proof_submitted", "verified", "paid_out", "completed"].includes(t.status) ||
    !t.proof_path
  )
    throw Error("Revisa esta operación con una persona.");
  return id;
}
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return fail(405);
  if (
    !env("WHATSAPP_FLOW_PRIVATE_KEY") ||
    !env("META_APP_SECRET") ||
    env("WHATSAPP_SESSION_SECRET").length < 32
  )
    return fail(503);
  let envelope: Awaited<ReturnType<typeof openEnvelope>>;
  try {
    const raw = new TextDecoder().decode(await boundedBytes(request, 256 * 1024));
    if (
      !equal(
        request.headers.get("x-hub-signature-256") || "",
        "sha256=" + (await mac(env("META_APP_SECRET"), raw)),
      )
    )
      return fail(432);
    try {
      envelope = await openEnvelope(
        JSON.parse(raw),
        env("WHATSAPP_FLOW_PRIVATE_KEY").replace(/\\n/g, "\n"),
      );
    } catch {
      return fail(421);
    }
  } catch {
    return fail(400);
  }
  const respond = async (payload: Record<string, unknown>) =>
    new Response(await sealResponse({ version: "3.0", ...payload }, envelope.key, envelope.iv), {
      headers,
    });
  const p = envelope.payload;
  if (p.version !== "3.0") return respond({ error: "Unsupported version" });
  if (p.action === "ping") return respond({ data: { status: "active" } });
  let lease: string | undefined,
    id: string | undefined,
    screen: FlowStep = "QUOTE",
    d: Record<string, any> = {};
  const db = admin();
  try {
    if (p.data?.error) return respond({ data: { acknowledged: true } });
    id = await tokenId(p.flow_token || "");
    const { data: s, error: sessionError } = await db
      .from("whatsapp_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (sessionError || !s || s.entry_mode !== "native" || Date.parse(s.expires_at) <= Date.now())
      throw Error("Invalid Flow session");
    const locked = await db.rpc("claim_whatsapp_flow", { p_session_id: id });
    if (locked.error || !locked.data) throw Error("Solicitud en curso. Intenta de nuevo.");
    const state = locked.data;
    lease = state.processing_id;
    d = state.data;
    const success = (transferId: string) => ({
      screen: "SUCCESS",
      data: {
        extension_message_response: {
          params: { flow_token: p.flow_token, transfer_id: transferId, status: "proof_submitted" },
        },
      },
    });
    if (state.completed_at && s.transfer_id) return respond(success(s.transfer_id));
    if (p.action === "INIT") return respond(renderFlow(s.transfer_id ? "PAYMENT" : "QUOTE", d));
    if (!flowSteps.includes(p.screen)) throw Error("Invalid screen");
    screen = p.screen;
    if (s.transfer_id && screen !== "PAYMENT")
      return respond(
        renderFlow(
          "PAYMENT",
          d,
          "La solicitud está guardada. Completa su comprobante; no crees otra operación.",
        ),
      );
    if (p.action === "BACK") return respond(renderFlow(screen, d));
    if (p.action !== "data_exchange") throw Error("Invalid action");
    if (!p.data || typeof p.data !== "object" || Array.isArray(p.data)) throw Error("Invalid data");
    const values = collectStage(screen, p.data);
    d = { ...d, ...values };
    if (screen === "QUOTE") {
      if (!["PEN_BRL", "BRL_PEN"].includes(d.route)) throw Error("Revisa las monedas del cambio.");
      const br = d.route === "PEN_BRL";
      const rate = await db
        .from("fx_rates")
        .select("id,rate,commission_percent,min_amount,max_amount,valid_until")
        .eq("active", true)
        .eq("from_currency", br ? "PEN" : "BRL")
        .eq("to_currency", br ? "BRL" : "PEN")
        .gt("valid_until", new Date().toISOString())
        .order("valid_until", { ascending: false })
        .limit(1)
        .single();
      if (rate.error || !rate.data)
        throw Error("La cotización no está disponible. Pide ayuda al equipo.");
      const q = quoteFor(d.amount, rate.data);
      const accounts = await db
        .from("deposit_accounts")
        .select("bank,holder,account_number,instructions")
        .eq("active", true)
        .eq("currency", br ? "PEN" : "BRL")
        .eq("country", br ? "PE" : "BR")
        .order("bank")
        .limit(3);
      if (accounts.error || !accounts.data?.length)
        throw Error("Revisa con el equipo la cuenta de ingreso.");
      const money = (n: number, c: string) => `${Number(n).toFixed(2)} ${c}`;
      d = {
        ...d,
        rate_id: rate.data.id,
        amount: q.amount,
        rate_value: Number(rate.data.rate),
        commission_percent: Number(rate.data.commission_percent),
        billing_type: br ? "nfse" : "boleta",
        quote_summary: `Envías ${money(q.amount, br ? "PEN" : "BRL")}\nComisión ${money(q.commission, br ? "PEN" : "BRL")}\nRecibe ${money(q.received, br ? "BRL" : "PEN")}\nTasa: ${rate.data.rate}\nVálida hasta ${new Date(rate.data.valid_until).toLocaleString("es-PE", { timeZone: "America/Lima" })}`,
        payment_instructions: accounts.data
          .map(
            (a) =>
              `${a.bank}\nTitular: ${a.holder}\nCuenta: ${a.account_number}\n${a.instructions || ""}`,
          )
          .join("\n\n"),
      };
    } else if (screen === "CUSTOMER") {
      if (
        String(d.customer_name).length < 2 ||
        !validIdentityDocument(d.customer_document_type, d.customer_document) ||
        !/^\S+@\S+\.\S+$/.test(d.billing_email)
      )
        throw Error("Revisa tu nombre, documento y correo.");
    } else if (screen === "FUNDS") {
      if (
        String(d.origin_bank).length < 2 ||
        !["salary", "savings", "business", "sale", "loan", "family", "other"].includes(
          d.funds_origin,
        ) ||
        String(d.transfer_purpose).length < 5 ||
        String(d.recipient_relationship).length < 2 ||
        (d.funds_origin === "other" && String(d.funds_detail).length < 5)
      )
        throw Error("Completa el banco, origen, motivo y relación con el destinatario.");
    } else if (screen === "DESTINATION") {
      if (
        [
          "recipient_name",
          "recipient_document",
          "recipient_bank",
          "recipient_account",
          "recipient_account_holder",
          "recipient_account_holder_document",
        ].some((k) => String(d[k] || "").length < 2)
      )
        throw Error("Completa los datos del destinatario y titular.");
      if (d.recipient_account_type === "cci" && !/^\d{20}$/.test(d.recipient_account))
        throw Error("Revisa el CCI: debe tener 20 dígitos.");
    } else if (screen === "BILLING") {
      if (d.route === "PEN_BRL") d.billing_type = "nfse";
      nativeTransferInput(d, s.phone);
    } else if (screen === "REVIEW") {
      nativeTransferInput(d, s.phone);
    }
    const saved = await db
      .from("whatsapp_flow_states")
      .update({ data: d, updated_at: new Date().toISOString() })
      .eq("session_id", id)
      .eq("processing_id", lease);
    if (saved.error) throw Error("Cannot save Flow");
    if (screen === "PAYMENT") {
      const transferId = await finish(db, state, s, d, p.data);
      const completed = await db
        .from("whatsapp_flow_states")
        .update({ completed_at: new Date().toISOString() })
        .eq("session_id", id)
        .eq("processing_id", lease);
      if (completed.error) throw Error("Cannot save completion");
      return respond(success(transferId));
    }
    return respond(renderFlow(next(screen), d));
  } catch (e) {
    return respond(renderFlow(screen, d, userError(e)));
  } finally {
    if (id && lease)
      await db
        .from("whatsapp_flow_states")
        .update({ processing_until: null, processing_id: null })
        .eq("session_id", id)
        .eq("processing_id", lease);
  }
});
