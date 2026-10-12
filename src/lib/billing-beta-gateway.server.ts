import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import type { BetaPrepared } from "./sunat/brasper-beta.server";
import type { BetaResult } from "./sunat/beta-transport";
import { BrasperBetaEngine } from "./sunat/brasper-beta.server";
const input = z.object({ invoice_request_id: z.string().uuid(), operation_id: z.string().uuid() });
export async function handleBetaBilling(request: Request) {
  const token = process.env["BILLING_GATEWAY_TOKEN"] || process.env["BETA_API_KEY"] || "";
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(supplied))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  if (process.env["BILLING_BETA_ENABLED"] !== "true")
    return Response.json({ error: "Beta disabled" }, { status: 503 });
  const url = process.env["SUPABASE_URL"],
    key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return Response.json({ error: "Configure Brasper backend" }, { status: 503 });
  let body;
  try {
    body = input.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (request.headers.get("Idempotency-Key") !== body.invoice_request_id)
    return Response.json({ error: "Idempotency key required" }, { status: 400 });
  const db = createClient(url, key);
  const { data: job, error } = await db
    .from("invoices")
    .select(
      "id,transfer_id,status,environment,number,beta_sent_at,document_type,beta_prepared,beta_result",
    )
    .eq("id", body.invoice_request_id)
    .single();
  if (
    error ||
    !job ||
    job.transfer_id !== body.operation_id ||
    job.environment !== "beta" ||
    job.status !== "processing" ||
    (job.document_type && job.document_type !== "01") ||
    !/^F902-[1-9]\d{0,7}$/.test(job.number || "")
  )
    return Response.json(
      { error: "Beta job unavailable; reconcile before retry" },
      { status: 409 },
    );
  let prepared: BetaPrepared;
  let result: BetaResult;
  if (job.beta_sent_at) {
    // Recover artifacts after a lost response or Storage failure. Never sendBill again.
    if (!job.beta_prepared || !job.beta_result)
      return Response.json(
        { error: "Submission already sent; reconciliation required" },
        { status: 409 },
      );
    prepared = job.beta_prepared;
    result = job.beta_result;
  } else {
    const engine = new BrasperBetaEngine();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { data: operation, error: operationError } = await db
      .from("transfers")
      .select("*")
      .eq("id", body.operation_id)
      .single();
    if (
      operationError ||
      !operation ||
      operation.status !== "paid_out" ||
      operation.billing_type !== "factura"
    )
      return Response.json(
        { error: "Confirmed payout and factura billing required" },
        { status: 422 },
      );
    prepared = await engine.prepare(Number(job.number.slice(5)), date, "F902", operation);
    const { data: claimed, error: claimError } = await db.rpc("claim_beta_submission", {
      p_invoice_id: job.id,
      p_transfer_id: body.operation_id,
      p_prepared: prepared,
    });
    if (claimError || !claimed)
      return Response.json({ error: "Beta submission already claimed" }, { status: 409 });
    result = await engine.send(prepared);
    const { error: persistError } = await db.rpc("record_beta_result", {
      p_invoice_id: job.id,
      p_result: result,
    });
    if (persistError)
      return Response.json({ error: "Persist beta result failed; reconcile" }, { status: 500 });
  }
  const accepted =
    ["aceptado", "observado"].includes(result.estado) &&
    result.codigo === "0" &&
    Boolean(result.cdrBase64);
  let cdr = "";
  if (accepted) {
    const zip = await JSZip.loadAsync(result.cdrBase64!, { base64: true });
    const file = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith(".xml"),
    )!;
    cdr = Buffer.from(await file.async("uint8array")).toString("base64");
  }
  return Response.json({
    authority: "SUNAT",
    document_type: "01",
    environment: "beta",
    status: accepted
      ? "accepted"
      : result.estado === "rechazado"
        ? "rejected"
        : "reconciliation_required",
    cdr_code: result.codigo,
    external_id: `SUNAT-beta/${prepared.reference}`,
    number: prepared.reference,
    pdf_base64: prepared.pdfBase64,
    xml_base64: Buffer.from(prepared.xml).toString("base64"),
    cdr_base64: cdr,
    message: result.mensaje,
  });
}
