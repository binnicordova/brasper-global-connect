// Deploy with verify_jwt=false: the scheduler must supply BILLING_WORKER_SECRET.
// The fiscal gateway is a supported provider adapter, not an invented SUNAT API.
import { createClient } from "npm:@supabase/supabase-js@2";
const env = (key: string) => Deno.env.get(key) ?? "";
const json = (body: unknown, status = 200) => Response.json(body, { status });
Deno.serve(async (request: Request) => {
  const secret = env("BILLING_WORKER_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`)
    return json({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const beta = env("BILLING_ENVIRONMENT") === "beta";
  // Email retries never reissue the fiscal document.
  let accepted = null;
  if (!beta && env("RESEND_API_KEY") && env("BILLING_FROM_EMAIL")) {
    const { data: deliveryJobs, error } = await db.rpc("claim_invoice_delivery");
    if (error) return json({ error: error.message }, 500);
    const delivery = deliveryJobs?.[0];
    if (delivery) {
      const { data: customer, error: customerError } = await db
        .from("transfers")
        .select("customer_email,billing_email")
        .eq("id", delivery.transfer_id)
        .single();
      if (customerError) return json({ error: customerError.message }, 500);
      accepted = { ...delivery, transfers: customer };
    }
  }
  if (accepted) {
    // Resend keys expire after 24h; reconcile rather than resend outside that window.
    if (Date.now() - Date.parse(accepted.email_attempted_at) > 23 * 60 * 60 * 1000) {
      await db
        .from("invoices")
        .update({
          status: "reconciliation_required",
          error: "Email retry window expired: check provider delivery before retry.",
        })
        .eq("id", accepted.id);
      return json({ status: "reconciliation_required" });
    }
    try {
      const { data, error } = await db.storage
        .from("invoice-documents")
        .download(accepted.pdf_path);
      if (error) throw error;
      const bytes = new Uint8Array(await data.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `invoice-${accepted.id}`,
        },
        body: JSON.stringify({
          from: env("BILLING_FROM_EMAIL"),
          to: [accepted.transfers.billing_email || accepted.transfers.customer_email],
          subject: `${accepted.document_type === "03" ? "Boleta" : "Factura"} Brasper ${accepted.number}`,
          text: `Tu transferencia ha sido enviada. Adjuntamos tu comprobante ${accepted.number}. Puedes consultar el seguimiento en el portal de Brasper.`,
          attachments: [{ filename: "comprobante.pdf", content: btoa(binary) }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!result.ok) throw new Error(`Email provider HTTP ${result.status}`);
      const { error: done } = await db.rpc("complete_invoice_delivery", {
        p_invoice_id: accepted.id,
      });
      if (done) throw done;
      return json({ status: "delivered", id: accepted.id });
    } catch (error) {
      await db
        .from("invoices")
        .update({ status: "accepted", error: String(error).slice(0, 500) })
        .eq("id", accepted.id);
      return json({ status: "email_retry_required" }, 502);
    }
  }
  const { data: jobs, error: claimError } = await db.rpc(
    beta ? "claim_beta_invoice" : "claim_invoice",
  );
  if (claimError) return json({ error: claimError.message }, 500);
  const job = jobs?.[0];
  if (!job) return json({ status: "idle" });
  if (job.status === "blocked") return json({ status: "blocked", id: job.id });
  const { data: transfer, error: transferError } = await db
    .from("transfers")
    .select("*")
    .eq("id", job.transfer_id)
    .single();
  const documentType = job.document_type || (transfer?.billing_type === "boleta" ? "03" : "01");
  if (beta && documentType === "03") {
    await db
      .from("invoices")
      .update({
        status: "blocked",
        error:
          "Boleta solicitada: configurar el emisor de boletas; el motor beta actual solo admite facturas.",
      })
      .eq("id", job.id);
    return json({ status: "blocked", id: job.id });
  }
  const routes = env("BILLING_ALLOWED_ROUTES")
    .split(",")
    .map((x) => x.trim());
  const gateway = env("BILLING_GATEWAY_URL"),
    token = env("BILLING_GATEWAY_TOKEN");
  if (
    transferError ||
    !transfer ||
    transfer.status !== "paid_out" ||
    !gateway.startsWith("https://") ||
    !token ||
    (!beta && !routes.includes(`${transfer.from_currency}-${transfer.to_currency}`))
  ) {
    await db
      .from("invoices")
      .update({
        status: "blocked",
        error: "Configurar proveedor fiscal, ruta autorizada y datos de emisión antes de procesar.",
      })
      .eq("id", job.id);
    return json({ status: "blocked", id: job.id });
  }
  try {
    const response = await fetch(gateway, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.id,
      },
      body: JSON.stringify({
        operation_id: transfer.id,
        invoice_request_id: job.id,
        ...(beta
          ? {}
          : {
              transfer,
              document_type: documentType,
              billing: {
                type: transfer.billing_type || "factura",
                email: transfer.billing_email || transfer.customer_email,
                name: transfer.billing_name || transfer.customer_name,
                document: transfer.billing_document || transfer.customer_document,
                document_type: transfer.billing_document_type || "0",
              },
            }),
      }),
      signal: AbortSignal.timeout(beta ? 40000 : 20000),
    });
    if (!response.ok)
      throw new Error(`Fiscal gateway HTTP ${response.status}: reconcile before retry`);
    const document = await response.json();
    if (
      beta &&
      document.authority === "SUNAT" &&
      document.environment === "beta" &&
      document.status !== "accepted"
    ) {
      const status =
        document.status === "rejected" ? "beta_rejected" : "beta_reconciliation_required";
      await db
        .from("invoices")
        .update({
          status,
          error:
            "Prueba SUNAT beta: " +
            String(document.message || document.cdr_code || "Revisión requerida").slice(0, 400),
        })
        .eq("id", job.id);
      return json({ status, id: job.id });
    }
    if (
      document.authority !== "SUNAT" ||
      (beta ? document.environment !== "beta" : document.environment === "beta") ||
      document.status !== "accepted" ||
      document.document_type !== documentType ||
      document.cdr_code !== "0" ||
      typeof document.external_id !== "string" ||
      typeof document.number !== "string"
    )
      throw new Error("No confirmed SUNAT acceptance; reconcile with provider");
    const paths: Record<string, string> = {};
    for (const [field, mime, ext] of [
      ["pdf", "application/pdf", "pdf"],
      ["xml", "application/xml", "xml"],
      ["cdr", "application/xml", "xml"],
    ]) {
      const encoded = document[`${field}_base64`];
      if (typeof encoded !== "string" || !encoded || encoded.length > 7_000_000)
        throw new Error(`Missing or oversized ${field}`);
      const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      if (field === "pdf" && new TextDecoder().decode(decoded.slice(0, 5)) !== "%PDF-")
        throw new Error("Invalid PDF");
      const path = `${transfer.user_id}/${job.id}/${field}.${ext}`;
      const { error } = await db.storage
        .from("invoice-documents")
        .upload(path, decoded, { contentType: mime, upsert: false });
      if (error) throw error;
      paths[field!] = path;
    }
    const { error } = await db
      .from("invoices")
      .update({
        status: beta ? "beta_accepted" : "accepted",
        external_id: document.external_id,
        number: document.number,
        pdf_path: paths["pdf"],
        xml_path: paths["xml"],
        cdr_path: paths["cdr"],
        error: null,
      })
      .eq("id", job.id);
    if (error) throw error;
    return json({ status: beta ? "beta_accepted" : "accepted", id: job.id });
  } catch (error) {
    await db
      .from("invoices")
      .update({
        status: beta ? "beta_reconciliation_required" : "reconciliation_required",
        error: String(error).slice(0, 500),
      })
      .eq("id", job.id);
    return json(
      { status: beta ? "beta_reconciliation_required" : "reconciliation_required", id: job.id },
      502,
    );
  }
});
