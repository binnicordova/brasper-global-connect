import { z } from "zod";
export const transferInput = z.object({
  rateId: z.string().uuid(),
  amount: z.coerce
    .number()
    .positive()
    .finite()
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Usa como máximo dos decimales"),
  customerName: z.string().trim().min(2).max(200),
  customerDocument: z.string().trim().min(2).max(200),
  recipientName: z.string().trim().min(2).max(200),
  recipientDocument: z.string().trim().min(2).max(200),
  recipientBank: z.string().trim().min(2).max(200),
  recipientAccount: z.string().trim().min(2).max(200),
});
export const statusLabels: Record<string, string> = {
  awaiting_payment: "Esperando tu pago",
  proof_submitted: "Pago en revisión",
  verified: "Ingreso confirmado",
  paid_out: "Dinero enviado",
  completed: "Comprobante enviado",
  cancelled: "Cancelada",
};
export const invoiceLabels: Record<string, string> = {
  queued: "Facturación pendiente",
  processing: "Procesando comprobante",
  sending: "Enviando comprobante",
  accepted: "Aceptado por SUNAT · entrega pendiente",
  delivered: "Comprobante enviado",
  blocked: "Facturación pendiente de configuración",
  reconciliation_required: "Revisión de facturación requerida",
};
export function quoteAmounts(amount: number, rate: number, percent: number) {
  const commission = Math.round(((amount * percent) / 100 + Number.EPSILON) * 100) / 100;
  return {
    commission,
    received: Math.round(((amount - commission) * rate + Number.EPSILON) * 100) / 100,
  };
}
export function validateProof(file: Pick<File, "size" | "type">) {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
    throw new Error("Adjunta un PDF, JPG o PNG.");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw new Error("El archivo debe pesar entre 1 byte y 5 MB.");
}
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
  id: string;
  amount: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  commission: number;
  recipient_amount: number;
  customer_name: string;
  customer_email: string;
  customer_document: string;
  recipient_name: string;
  recipient_document: string;
  recipient_bank: string;
  recipient_account: string;
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
  invoices: {
    status: string;
    number: string | null;
    pdf_path: string | null;
    xml_path: string | null;
    cdr_path: string | null;
    error: string | null;
  }[];
};
