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
export const recipientDetailsInput = transferInput
  .extend({
    recipientAccountType: z.enum(["bank_account", "cci", "pix"]),
    recipientAccountHolder: z.string().trim().min(2).max(200),
    recipientAccountHolderDocument: z.string().trim().min(2).max(200),
    recipientBankBranch: z.string().trim().max(50),
    customerPhone: z.string().trim().min(6).max(40),
    recipientPhone: z.string().trim().max(40),
    transferNote: z.string().trim().max(500),
    customerDocumentType: z.enum(["1", "6", "4", "7", "cpf", "cnpj", "0"]),
    sourceCountry: z.enum(["PE", "BR"]),
    destinationCountry: z.enum(["PE", "BR"]),
    originBank: z.string().trim().min(2, "Indica el banco de origen").max(200),
    fundsOrigin: z
      .enum(["", "salary", "savings", "business", "sale", "loan", "family", "other"])
      .default(""),
    fundsDetail: z.string().trim().max(500).default(""),
    transferPurpose: z.string().trim().max(500).default(""),
    recipientRelationship: z.string().trim().max(200).default(""),
    billingType: z.enum(["factura", "boleta"]),
    billingEmail: z.string().trim().email("Escribe un correo válido para el comprobante").max(254),
    billingLegalName: z.string().trim().max(200).default(""),
    billingRuc: z.string().trim().max(11).default(""),
    billingDocumentType: z.enum(["1", "6", "4", "7", "0"]).default("1"),
  })
  .superRefine((v, ctx) => {
    if (!validIdentityDocument(v.customerDocumentType, v.customerDocument))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerDocument"],
        message: "Revisa el tipo y número de tu documento",
      });
    if (!/^\+[1-9]\d{7,14}$/.test(v.customerPhone))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerPhone"],
        message: "Escribe tu teléfono con +, código de país y entre 8 y 15 dígitos",
      });
    if (v.sourceCountry === "PE" || v.destinationCountry === "PE") {
      if (!v.fundsOrigin)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fundsOrigin"],
          message: "Indica el origen de los fondos para esta operación con Perú",
        });
      if (v.fundsOrigin === "other" && v.fundsDetail.length < 5)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fundsDetail"],
          message: "Describe el origen de tus fondos",
        });
      if (v.transferPurpose.length < 5)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferPurpose"],
          message: "Indica el motivo del cambio (mínimo 5 caracteres)",
        });
    }
    if (
      (v.customerDocument !== v.recipientDocument ||
        v.customerDocument !== v.recipientAccountHolderDocument) &&
      v.recipientRelationship.length < 2
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientRelationship"],
        message: "Indica tu relación con el destinatario y el titular de la cuenta",
      });
    if (v.recipientAccountType === "cci" && !/^\d{20}$/.test(v.recipientAccount))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientAccount"],
        message: "El CCI debe tener 20 dígitos",
      });
    if (v.billingType === "factura") {
      if (!/^\d{11}$/.test(v.billingRuc))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["billingRuc"],
          message: "El RUC para la factura debe tener 11 dígitos",
        });
      if (v.billingLegalName.length < 2)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["billingLegalName"],
          message: "Completa la razón social para la factura",
        });
    } else {
      const valid =
        v.billingDocumentType === "1"
          ? /^\d{8}$/.test(v.customerDocument)
          : v.billingDocumentType === "6"
            ? /^\d{11}$/.test(v.customerDocument)
            : v.customerDocument.length <= 20;
      if (!valid)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customerDocument"],
          message: "Revisa el documento y su tipo para la boleta",
        });
    }
  });
// Format checks only: identity and bank ownership remain subject to staff review.
export function validIdentityDocument(type: string, document: string) {
  const lengths: Record<string, number> = { "1": 8, "6": 11, cpf: 11, cnpj: 14 };
  return type in lengths
    ? new RegExp(`^\\d{${lengths[type]}}$`).test(document)
    : /^[A-Za-z0-9-]{2,20}$/.test(document);
}
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
export const billingTypeLabels: Record<string, string> = { factura: "Factura", boleta: "Boleta" };
export const billingDocumentLabels: Record<string, string> = {
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
  billing_type?: "factura" | "boleta";
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
  invoices: {
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
