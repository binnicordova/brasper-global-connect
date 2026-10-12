import { firstInvoice, billingTypeLabels, type Transfer, type Invoice } from "./transfers";
const LEGACY_INVOICE_FIELDS =
  "id,status,number,pdf_path,xml_path,cdr_path,environment,document_type,error,email_attempted_at,created_at";
export const INVOICE_LIST_FIELDS = `${LEGACY_INVOICE_FIELDS},email_status,email_error,email_sent_at,email_next_attempt_at`;
// Git sync can precede the manual database update. Only retry missing delivery columns.
export async function readBillingCompatible<
  T extends { error: { code?: string; message: string } | null },
>(query: (fields: string, legacy: boolean) => PromiseLike<T>): Promise<T> {
  const result = await query(INVOICE_LIST_FIELDS, false);
  if (
    result.error &&
    ["42703", "PGRST204"].includes(result.error.code || "") &&
    /email_(status|error|sent_at|next_attempt_at)/.test(result.error.message)
  )
    return await query(LEGACY_INVOICE_FIELDS, true);
  return result;
}
export const billingCountry = (currency: string): "PE" | "BR" => (currency === "BRL" ? "BR" : "PE");
export function billingIdentity(t: Transfer) {
  const invoice = firstInvoice(t.invoices);
  const type = t.billing_type || "factura";
  const country = invoice?.issuer_country || t.billing_country || (type === "nfse" ? "BR" : "PE");
  return { type, country, label: billingTypeLabels[type] || type };
}
export function billingState(invoice: Invoice | null) {
  if (!invoice)
    return {
      tone: "neutral",
      label: "No solicitado",
      delivery: "Sin envío de correo",
      hint: "Se genera después de registrar el envío del dinero",
    };
  const s = invoice.status;
  const test = invoice.environment === "beta" || invoice.environment === "demo";
  if (invoice.email_status === "sent")
    return {
      tone: "success",
      label: test ? "Documento de pruebas enviado" : "Emitido y enviado",
      delivery: "Correo enviado",
      hint: "MailerSend confirmó el envío; no confirma lectura.",
    };
  if (["blocked", "reconciliation_required"].includes(invoice.email_status || ""))
    return {
      tone: "danger",
      label: "Documento generado · revisar correo",
      delivery: "Correo requiere revisión",
      hint: invoice.email_error || "Revisar en MailerSend antes de reenviar.",
    };
  if (invoice.email_status === "retry")
    return {
      tone: "warning",
      label: "Documento generado · reintentar correo",
      delivery: "Reintento de correo",
      hint: invoice.email_error || "Esperando el próximo intento.",
    };
  if (invoice.email_status === "submitted")
    return {
      tone: "working",
      label: "Documento generado",
      delivery: "En cola en MailerSend",
      hint: invoice.email_error || "El proveedor aceptó el mensaje; pendiente de confirmar envío.",
    };
  if (invoice.email_status === "sending")
    return {
      tone: "working",
      label: "Documento generado",
      delivery: "Enviando correo",
      hint: "Envío reservado por el worker.",
    };
  if (s === "delivered")
    return {
      tone: "success",
      label: "Emitido y enviado",
      delivery: "Correo enviado",
      hint: "El servicio de correo aceptó el envío",
    };
  if (s === "demo_delivered")
    return {
      tone: "demo",
      label: "Comprobante preparado",
      delivery: "Entrega preparada",
      hint: "No se envió un correo real",
    };
  if (
    [
      "blocked",
      "reconciliation_required",
      "beta_rejected",
      "beta_reconciliation_required",
    ].includes(s)
  )
    return {
      tone: "danger",
      label: "Requiere revisión",
      delivery: "Correo pendiente",
      hint: invoice.error || "Revisar el diagnóstico antes de reintentar",
    };
  if (s === "queued" && (invoice.error || invoice.next_attempt_at))
    return {
      tone: "warning",
      label: "Reintento pendiente",
      delivery: "Correo pendiente",
      hint: invoice.next_attempt_at
        ? `Próximo intento: ${new Date(invoice.next_attempt_at).toLocaleString("es-PE")}`
        : invoice.error || "Esperando el próximo intento",
    };
  if (s === "sending")
    return {
      tone: "working",
      label: "Enviando correo",
      delivery: "En proceso",
      hint: "El comprobante ya fue generado",
    };
  if (s === "accepted" && invoice.error)
    return {
      tone: "warning",
      label: "Documento generado · reintentar correo",
      delivery: "Reintento de correo",
      hint: invoice.error,
    };
  if (["accepted", "beta_accepted", "demo_generated"].includes(s))
    return {
      tone: s === "demo_generated" ? "demo" : "generated",
      label:
        s === "beta_accepted"
          ? "Aceptado en SUNAT beta"
          : s === "demo_generated"
            ? "Comprobante preparado"
            : "Comprobante generado",
      delivery: "Correo pendiente",
      hint:
        s === "beta_accepted"
          ? "Aceptado en SUNAT beta; pendiente de entrega"
          : "Documento disponible; aún no consta envío por correo",
    };
  return {
    tone: s === "processing" ? "working" : "neutral",
    label: s === "processing" ? "Generando comprobante" : "En cola",
    delivery: "Correo pendiente",
    hint: "Esperando el procesamiento de facturación",
  };
}
