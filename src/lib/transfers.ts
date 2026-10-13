export {
  transferInput,
  recipientDetailsInput,
  validIdentityDocument,
  quoteAmounts,
  validateProof,
} from "../../supabase/functions/_shared/transfer-input";
export const countryLabels: Record<string, string> = { PE: "Perú", BR: "Brasil" };
export const fundsOriginLabels: Record<string, string> = {
  salary: "Sueldo o trabajo independiente",
  savings: "Ahorros",
  business: "Ingresos de negocio",
  sale: "Venta de un bien",
  loan: "Préstamo",
  family: "Apoyo familiar",
  other: "Otro origen",
};
export const identityDocumentLabels: Record<string, string> = {
  "1": "DNI",
  "6": "RUC",
  "4": "Carné de extranjería",
  "7": "Pasaporte",
  cpf: "CPF",
  cnpj: "CNPJ",
  "0": "Otro documento",
};
export const billingTypeLabels: Record<string, string> = {
  factura: "Factura",
  boleta: "Boleta",
  nfse: "Nota fiscal de serviço (NFS-e)",
};
export const billingDocumentLabels: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  foreign: "Documento extranjero",
  "1": "DNI",
  "6": "RUC",
  "4": "Carné de extranjería",
  "7": "Pasaporte",
  "0": "Otro documento",
};
export const accountTypeLabels: Record<string, string> = {
  bank_account: "Cuenta bancaria",
  cci: "CCI",
  pix: "Clave PIX",
};
export const statusLabels: Record<string, string> = {
  awaiting_payment: "Esperando tu pago",
  proof_submitted: "Pago en revisión",
  verified: "Ingreso confirmado",
  paid_out: "Dinero enviado",
  completed: "Comprobante enviado",
  cancelled: "Cancelada",
};
export const invoiceLabels: Record<string, string> = {
  demo_generated: "Demo · comprobante generado",
  demo_delivered: "Demo · comprobante y correo demo",
  queued: "Facturación pendiente",
  processing: "Procesando comprobante",
  sending: "Enviando comprobante",
  accepted: "Aceptado por SUNAT · entrega pendiente",
  delivered: "Comprobante enviado",
  blocked: "Facturación pendiente de configuración",
  reconciliation_required: "Revisión de facturación requerida",
  beta_accepted: "Prueba aceptada en SUNAT beta · sin validez tributaria",
  beta_rejected: "Prueba SUNAT beta rechazada",
  beta_reconciliation_required: "Prueba SUNAT beta por conciliar",
};
export type Rate = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  commission_percent: number;
  min_amount: number;
  max_amount: number;
  valid_until: string;
};
export type Transfer = {
  user_id?: string;
  demo_meta?: { code: string; advisor: string; issuer: string };
  id: string;
  amount: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  commission: number;
  recipient_amount: number;
  customer_name: string;
  customer_email: string;
  customer_email_verified?: boolean;
  customer_document: string;
  customer_document_type?: string | null;
  source_country?: string | null;
  destination_country?: string | null;
  origin_bank?: string | null;
  funds_origin?: string | null;
  funds_detail?: string | null;
  transfer_purpose?: string | null;
  recipient_relationship?: string | null;
  deposit_bank_reference?: string | null;
  billing_type?: "factura" | "boleta" | "nfse";
  billing_country?: "PE" | "BR";
  billing_email?: string | null;
  billing_email_verified?: boolean;
  billing_name?: string;
  billing_document?: string;
  billing_document_type?: string;
  recipient_name: string;
  recipient_document: string;
  recipient_bank: string;
  recipient_account: string;
  recipient_account_type?: string;
  recipient_account_holder?: string;
  recipient_account_holder_document?: string;
  recipient_bank_branch?: string;
  customer_phone?: string;
  recipient_phone?: string;
  transfer_note?: string;
  status: string;
  deposit_instructions: {
    bank: string;
    holder: string;
    account_number: string;
    instructions: string;
  }[];
  proof_path: string | null;
  payout_path: string | null;
  payout_reference: string | null;
  created_at: string;
  updated_at?: string;
  verified_at?: string | null;
  payout_at?: string | null;
  invoices: {
    issuer_country?: "PE" | "BR";
    email_status?: string;
    email_error?: string | null;
    email_sent_at?: string | null;
    email_next_attempt_at?: string | null;
    next_attempt_at?: string | null;
    beta_attempts?: number;
    demo_email?: string;
    demo_delivered_at?: string;
    environment?: string;
    document_type?: string;
    status: string;
    number: string | null;
    pdf_path: string | null;
    xml_path: string | null;
    cdr_path: string | null;
    error: string | null;
  }[];
};
export type Invoice = Transfer["invoices"][number];
/**
 * `invoices.transfer_id` is UNIQUE, so the backend returns a single object (or
 * null) rather than a list. Older code and tests use the list shape, so accept
 * both and never crash when a transfer has no invoice yet.
 */
export function firstInvoice(invoices: Invoice[] | Invoice | null | undefined): Invoice | null {
  if (Array.isArray(invoices)) return invoices[0] ?? null;
  if (invoices && typeof invoices === "object") return invoices;
  return null;
}
