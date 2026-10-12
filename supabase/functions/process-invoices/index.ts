// Deploy with verify_jwt=false: the scheduler must supply BILLING_WORKER_SECRET.
// The fiscal gateway is a supported provider adapter, not an invented SUNAT API.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildDemoReceipt } from "../_shared/demo-receipt.ts";
const env = (key: string) => Deno.env.get(key) ?? "";
const json = (body: unknown, status = 200) => Response.json(body, { status });
Deno.serve(async (request: Request) => {
  const secret = env("BILLING_WORKER_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`)
    return json({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const beta = env("BILLING_ENVIRONMENT") === "beta";
  // In beta only boletas are simulated; an explicit demo environment also simulates facturas.
  const demo = env("BILLING_ENVIRONMENT") === "demo";
  // MailerSend uses a separate queue: never reissue SUNAT documents to send email.
  const mailerKey = env("MAILERSEND_API_KEY");
  const mailerFrom =
    env("BILLING_FROM_EMAIL") || (beta || demo ? "noreply@test-vz9dlemdwjp4kj50.mlsender.net" : "");
  if (mailerKey) {
    if (!mailerFrom)
      return json(
        { error: "Configura BILLING_FROM_EMAIL con un remitente verificado en MailerSend." },
        503,
      );
    const { data: deliveryJobs, error: deliveryError } = await db.rpc("claim_mailersend_delivery", {
      p_environment: beta ? "beta" : demo ? "demo" : "production",
    });
    if (deliveryError) return json({ error: deliveryError.message }, 500);
    const delivery = deliveryJobs?.[0];
    if (delivery) {
      let state = "retry";
      let messageId: string | null = null;
      let delay = Math.min(3600, 60 * 2 ** (delivery.email_attempts - 1));
      const save = async (result: string, error: string | null) => {
        const saved = await db.rpc("record_mailersend_result", {
          p_invoice_id: delivery.id,
          p_attempt: delivery.email_attempts,
          p_state: result,
          p_message_id: messageId,
          p_error: error,
          p_delay: delay,
        });
        if (saved.error || saved.data !== true)
          throw new Error(
            "No se pudo persistir el resultado del correo; conciliar antes de reenviar.",
          );
      };
      try {
        const { data: transfer, error } = await db
          .from("transfers")
          .select("*")
          .eq("id", delivery.transfer_id)
          .single();
        if (error) throw new Error("No se pudo consultar la transferencia.");
        if (!transfer || transfer.status !== "paid_out") {
          state = "blocked";
          throw new Error("Envío bancario no confirmado.");
        }
        const to = String(transfer.billing_email || transfer.customer_email || "").trim();
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
          /@(example\.(test|com|net|org)|[^@]+\.invalid)$/i.test(to)
        ) {
          state = "blocked";
          throw new Error(
            "Configura un correo de destino real; no se envía al catálogo sintético.",
          );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailerFrom)) {
          state = "blocked";
          throw new Error("Remitente no válido.");
        }
        const stored = await db.storage.from("invoice-documents").download(delivery.pdf_path);
        if (stored.error || !stored.data) throw new Error("No se pudo descargar el PDF privado.");
        const bytes = new Uint8Array(await stored.data.arrayBuffer());
        if (bytes.length > 10_000_000 || new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") {
          state = "blocked";
          throw new Error("PDF no válido o demasiado grande.");
        }
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        const escape = (value: unknown) =>
          String(value ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
          );
        const kind =
          delivery.document_type === "NFSE"
            ? "NFS-e"
            : delivery.document_type === "03"
              ? "Boleta"
              : "Factura";
        const testNote =
          delivery.environment !== "production"
            ? "Documento del entorno de pruebas, sin validez fiscal de producción."
            : "";
        const text = `Hola ${transfer.customer_name}. Tu transferencia fue registrada como enviada. ${kind} ${delivery.number}. Envías ${transfer.amount} ${transfer.from_currency}; recibe ${transfer.recipient_amount} ${transfer.to_currency}. Destinatario: ${transfer.recipient_name}. Referencia: ${transfer.payout_reference || "registrada"}. Adjuntamos tu comprobante. ${testNote}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#142638"><div style="background:#142638;padding:28px;color:white;font-size:30px">brasper<span style="color:#36c7c7">.</span></div><div style="padding:28px"><h2>Tu transferencia fue enviada</h2><p>Hola ${escape(transfer.customer_name)}, adjuntamos tu ${escape(kind.toLowerCase())} <strong>${escape(delivery.number)}</strong>.</p><p>Envías: <strong>${escape(transfer.amount)} ${escape(transfer.from_currency)}</strong><br>El destinatario recibe: <strong>${escape(transfer.recipient_amount)} ${escape(transfer.to_currency)}</strong></p><p>Destinatario: ${escape(transfer.recipient_name)}<br>Referencia: ${escape(transfer.payout_reference || "registrada")}</p><p style="font-size:12px;color:#65758a">${escape(testNote)}</p></div></div>`;
        const reserved = await db.rpc("start_mailersend_request", {
          p_invoice_id: delivery.id,
          p_attempt: delivery.email_attempts,
          p_recipient: to,
        });
        if (reserved.error || reserved.data !== true) {
          state = "reconciliation_required";
          throw new Error("No se pudo reservar el envío; revisar antes de continuar.");
        }

        state = "reconciliation_required";
        const result = await fetch("https://api.mailersend.com/v1/email", {
          method: "POST",
          headers: { Authorization: `Bearer ${mailerKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: { email: mailerFrom, name: env("BILLING_FROM_NAME") || "Brasper" },
            to: [{ email: to }],
            subject: `${kind} Brasper ${delivery.number}`,
            text,
            html,
            tags: ["brasper-comprobante"],
            attachments: [
              {
                filename: `comprobante-${String(delivery.number).replace(/[^a-z0-9-]/gi, "")}.pdf`,
                content: btoa(binary),
                disposition: "attachment",
              },
            ],
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (result.status !== 202) {
          state =
            result.status === 429
              ? "retry"
              : result.status >= 400 && result.status < 500
                ? "blocked"
                : "reconciliation_required";
          const retryAfter = Number(result.headers.get("Retry-After"));
          if (Number.isFinite(retryAfter)) delay = Math.max(delay, retryAfter);
          throw new Error(`MailerSend HTTP ${result.status}.`);
        }
        messageId = result.headers.get("x-message-id");
        if (!messageId || !/^[a-z0-9_-]{1,200}$/i.test(messageId))
          throw new Error(
            "MailerSend no devolvió identificador; comprobar supresión o resultado incierto.",
          );
        await save(
          "submitted",
          result.headers.get("x-send-paused") === "true"
            ? "MailerSend tiene el envío pausado; no reenviar."
            : null,
        );
        return json({ status: "email_submitted", id: delivery.id });
      } catch (cause) {
        const note = cause instanceof Error ? cause.message : "No se pudo procesar el correo.";
        // A network failure after starting the POST is uncertain, never blindly retry.
        try {
          await save(state, note);
        } catch {
          return json(
            { status: "email_reconciliation_required", id: delivery.id, message_id: messageId },
            502,
          );
        }
        return json({ status: `email_${state}`, id: delivery.id }, 502);
      }
    }
    const checked = await db.rpc("claim_mailersend_status");
    if (checked.error) return json({ error: checked.error.message }, 500);
    const pending = checked.data?.[0];
    if (pending) {
      try {
        const domainId =
          env("MAILERSEND_DOMAIN_ID") ||
          (mailerFrom.endsWith("@test-vz9dlemdwjp4kj50.mlsender.net") ? "yxj6ljnoyk0gdo2r" : "");
        if (!domainId)
          return json(
            {
              status: "email_submitted",
              error: "Configura MAILERSEND_DOMAIN_ID para consultar el envío.",
            },
            503,
          );
        const params = new URLSearchParams({
          domain_id: domainId,
          message_id: pending.email_provider_id,
          recipient_email: pending.email_recipient,
          date_from: String(Math.floor(Date.parse(pending.email_request_started_at) / 1000) - 60),
          date_to: String(Math.floor(Date.now() / 1000)),
          limit: "10",
        });
        const response = await fetch(`https://api.mailersend.com/v1/emails?${params}`, {
          headers: { Authorization: `Bearer ${mailerKey}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          return json(
            {
              status: "email_submitted",
              error: `Consulta MailerSend HTTP ${response.status}; comprobar permiso activity_read.`,
            },
            502,
          );
        const info = await response.json();
        const email = info.data?.find(
          (row: { message_id: string; to: string }) =>
            row.message_id === pending.email_provider_id &&
            row.to?.toLowerCase() === pending.email_recipient?.toLowerCase(),
        );
        const confirmed =
          email && ["sent", "delivered"].includes(email.status)
            ? "sent"
            : email?.status === "rejected"
              ? "blocked"
              : "submitted";
        const saved = await db.rpc("confirm_mailersend_status", {
          p_invoice_id: pending.id,
          p_message_id: pending.email_provider_id,
          p_state: confirmed,
          p_error:
            confirmed === "blocked"
              ? "MailerSend rechazó el destinatario; revisar en el proveedor."
              : null,
        });
        if (saved.error || saved.data !== true) throw new Error("Resultado no guardado.");
        return json({ status: `email_${confirmed}`, id: pending.id });
      } catch {
        return json(
          { status: "email_submitted", error: "No se pudo consultar el envío; no se reenvió." },
          502,
        );
      }
    }
  }

  if (beta || demo) {
    const { data: demoJobs, error: demoClaimError } = await db.rpc("claim_demo_invoice", {
      p_boleta_only: beta,
    });
    if (demoClaimError) return json({ error: demoClaimError.message }, 500);
    const job = demoJobs?.[0];
    if (job) {
      try {
        const { data: transfer, error } = await db
          .from("transfers")
          .select("*")
          .eq("id", job.transfer_id)
          .single();
        if (error || !transfer || transfer.status !== "paid_out")
          throw new Error("Envío no confirmado");
        const bytes = await buildDemoReceipt(transfer, job.number, job.created_at);
        const path = `${transfer.user_id}/${job.id}/demo.pdf`;
        const { error: uploadError } = await db.storage
          .from("invoice-documents")
          .upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (uploadError) throw uploadError;
        const { error: saveError } = await db
          .from("invoices")
          .update({ status: "demo_generated", pdf_path: path, error: null })
          .eq("id", job.id);
        if (saveError) throw saveError;
        return json({ status: "demo_generated", id: job.id });
      } catch (error) {
        // PDF generation is safe to retry with the reserved number and deterministic path.
        await db
          .from("invoices")
          .update({ status: "queued", error: String(error).slice(0, 500) })
          .eq("id", job.id);
        return json({ status: "demo_retry_required", id: job.id }, 502);
      }
    }
    if (demo) return json({ status: "idle" });
  }
  // Email retries never reissue the fiscal document.
  let accepted = null;
  if (!mailerKey && !beta && env("RESEND_API_KEY") && env("BILLING_FROM_EMAIL")) {
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
  if (!beta && !demo) {
    const { data: brazilJobs, error } = await db.rpc("claim_brazil_invoice");
    if (error) return json({ error: error.message }, 500);
    if (brazilJobs?.[0]) return json({ status: "blocked", id: brazilJobs[0].id });
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
      if (status === "beta_reconciliation_required") {
        const { data: retry } = await db.rpc("schedule_beta_retry", { p_invoice_id: job.id });
        if (retry) return json({ status: "queued", id: job.id });
      }
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
        .upload(path, decoded, { contentType: mime, upsert: beta });
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
    if (beta) {
      const { data: retry } = await db.rpc("schedule_beta_retry", { p_invoice_id: job.id });
      if (retry) return json({ status: "queued", id: job.id }, 502);
    }
    return json(
      { status: beta ? "beta_reconciliation_required" : "reconciliation_required", id: job.id },
      502,
    );
  }
});
