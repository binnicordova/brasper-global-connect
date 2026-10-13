import { recipientDetailsInput, quoteAmounts } from "./transfer-input.ts";
export const flowSteps = [
  "QUOTE",
  "CUSTOMER",
  "FUNDS",
  "DESTINATION",
  "BILLING",
  "REVIEW",
  "PAYMENT",
] as const;
export type FlowStep = (typeof flowSteps)[number];
export const stepFields: Record<FlowStep, string[]> = {
  QUOTE: ["route", "amount"],
  CUSTOMER: ["customer_name", "customer_document_type", "customer_document", "billing_email"],
  FUNDS: [
    "origin_bank",
    "funds_origin",
    "funds_detail",
    "transfer_purpose",
    "recipient_relationship",
  ],
  DESTINATION: [
    "recipient_name",
    "recipient_document",
    "recipient_bank",
    "recipient_account_type",
    "recipient_account",
    "recipient_account_holder",
    "recipient_account_holder_document",
    "recipient_bank_branch",
    "recipient_phone",
  ],
  BILLING: ["billing_type", "billing_legal_name", "billing_document_type", "billing_document"],
  REVIEW: [],
  PAYMENT: ["bank_reference", "declaration"],
};
export function collectStage(screen: FlowStep, input: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const field of stepFields[screen]) {
    const value = input[field];
    if (field === "amount" && typeof value === "number" && Number.isFinite(value)) {
      out[field] = String(value);
      continue;
    }
    if (field === "declaration") {
      out[field] = value === true ? "yes" : "no";
      continue;
    }
    if (value === undefined) {
      out[field] = "";
      continue;
    }
    if (typeof value !== "string" || value.length > 500)
      throw Error("Revisa los datos ingresados.");
    out[field] = value.trim();
  }
  return out;
}
export function quoteFor(
  amountText: string,
  r: {
    rate: number;
    commission_percent: number;
    min_amount: number;
    max_amount: number;
    valid_until: string;
  },
  now = Date.now(),
) {
  if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(amountText))
    throw Error("Ingresa un monto con hasta dos decimales.");
  const amount = Number(amountText.replace(",", "."));
  if (
    !Number.isFinite(amount) ||
    amount < Number(r.min_amount) ||
    amount > Number(r.max_amount) ||
    Date.parse(r.valid_until) <= now
  )
    throw Error("El monto está fuera del límite o la tasa caducó.");
  return { amount, ...quoteAmounts(amount, Number(r.rate), Number(r.commission_percent)) };
}
export function nativeTransferInput(d: Record<string, unknown>, phone: string) {
  const br = d["route"] === "PEN_BRL";
  const billingType = br ? "nfse" : d["billing_type"];
  const customerDoc = String(d["customer_document"] || "");
  const customerType = String(d["customer_document_type"] || "");
  const billingDocType =
    billingType === "factura"
      ? "6"
      : billingType === "boleta"
        ? ["0", "1", "4", "6", "7"].includes(customerType)
          ? customerType
          : "0"
        : String(d["billing_document_type"] || "");
  const v = recipientDetailsInput.parse({
    rateId: d["rate_id"],
    amount: d["amount"],
    customerName: d["customer_name"],
    customerDocument: customerDoc,
    customerDocumentType: customerType,
    sourceCountry: br ? "PE" : "BR",
    destinationCountry: br ? "BR" : "PE",
    originBank: d["origin_bank"],
    fundsOrigin: d["funds_origin"],
    fundsDetail: d["funds_detail"],
    transferPurpose: d["transfer_purpose"],
    recipientRelationship: d["recipient_relationship"],
    recipientName: d["recipient_name"],
    recipientDocument: d["recipient_document"],
    recipientBank: d["recipient_bank"],
    recipientAccountType: d["recipient_account_type"],
    recipientAccount: d["recipient_account"],
    recipientAccountHolder: d["recipient_account_holder"],
    recipientAccountHolderDocument: d["recipient_account_holder_document"],
    recipientBankBranch: d["recipient_bank_branch"] || "",
    recipientPhone: d["recipient_phone"] || "",
    customerPhone: "+" + phone,
    transferNote: "Registrado en WhatsApp Flow",
    billingType,
    billingEmail: d["billing_email"],
    billingLegalName: billingType === "boleta" ? "" : d["billing_legal_name"],
    billingRuc: billingType === "boleta" ? "" : d["billing_document"],
    billingDocumentType: billingDocType,
  });
  if ((br && v.recipientAccountType === "cci") || (!br && v.recipientAccountType === "pix"))
    throw Error("Tipo de cuenta incompatible con el destino.");
  return v;
}
export function transferArgs(v: ReturnType<typeof nativeTransferInput>) {
  return {
    p_rate_id: v.rateId,
    p_amount: v.amount,
    p_customer_name: v.customerName,
    p_customer_document: v.customerDocument,
    p_recipient_name: v.recipientName,
    p_recipient_document: v.recipientDocument,
    p_recipient_bank: v.recipientBank,
    p_recipient_account: v.recipientAccount,
    p_recipient_account_type: v.recipientAccountType,
    p_recipient_account_holder: v.recipientAccountHolder,
    p_recipient_account_holder_document: v.recipientAccountHolderDocument,
    p_recipient_bank_branch: v.recipientBankBranch,
    p_customer_phone: v.customerPhone,
    p_recipient_phone: v.recipientPhone,
    p_transfer_note: v.transferNote,
    p_billing_type: v.billingType,
    p_billing_email: v.billingEmail,
    p_billing_name: v.billingType === "boleta" ? v.customerName : v.billingLegalName,
    p_billing_document: v.billingType === "boleta" ? v.customerDocument : v.billingRuc,
    p_billing_document_type: v.billingDocumentType,
    p_customer_document_type: v.customerDocumentType,
    p_source_country: v.sourceCountry,
    p_destination_country: v.destinationCountry,
    p_origin_bank: v.originBank,
    p_funds_origin: v.fundsOrigin,
    p_funds_detail: v.fundsDetail,
    p_transfer_purpose: v.transferPurpose,
    p_recipient_relationship: v.recipientRelationship,
    p_declaration_accepted: true,
  };
}
export function oneProof(data: Record<string, unknown>) {
  const photos = data["photo_picker"] ?? [],
    docs = data["document_picker"] ?? [];
  if (!Array.isArray(photos) || !Array.isArray(docs) || photos.length + docs.length !== 1)
    throw Error("Adjunta una foto o un PDF del comprobante.");
  return [...photos, ...docs][0];
}
const option = (id: string, title: string) => ({ id, title });
export function renderFlow(screen: FlowStep, d: Record<string, unknown>, error = "") {
  const br = d["route"] !== "BRL_PEN";
  const defaults: Record<string, string> = {
    route: "PEN_BRL",
    customer_document_type: br ? "1" : "cpf",
    funds_origin: "savings",
    recipient_account_type: br ? "pix" : "cci",
    billing_type: br ? "nfse" : "boleta",
    billing_document_type: br ? "cpf" : "6",
  };
  const fields = Object.fromEntries(
    stepFields[screen]
      .filter((k) => k !== "declaration")
      .map((k) => [k, String(d[k] || defaults[k] || "")]),
  );
  return {
    screen,
    data: {
      ...fields,
      ...(screen === "QUOTE" ? { amount: Number(d["amount"]) || 0 } : {}),
      quote_summary: String(d["quote_summary"] || "Cotiza tu cambio entre soles y reales."),
      customer_summary: `${d["customer_name"] || ""} · ${d["customer_document"] || ""}`,
      recipient_summary: `${d["recipient_name"] || ""}\n${d["recipient_bank"] || ""} · ${d["recipient_account"] || ""}\nTitular: ${d["recipient_account_holder"] || ""}`,
      billing_summary: `${d["billing_type"] === "nfse" ? "Nota fiscal brasileña" : d["billing_type"] === "factura" ? "Factura peruana" : "Boleta peruana"} · ${d["billing_email"] || ""}`,
      payment_instructions: String(
        d["payment_instructions"] ||
          "Las cuentas de ingreso se mostrarán con la cotización vigente.",
      ),
      identity_options: br
        ? [
            option("1", "DNI"),
            option("4", "Carné extranjería"),
            option("7", "Pasaporte"),
            option("6", "RUC"),
            option("0", "Otro documento"),
          ]
        : [
            option("cpf", "CPF"),
            option("cnpj", "CNPJ"),
            option("7", "Pasaporte"),
            option("0", "Otro documento"),
          ],
      account_options: br
        ? [option("pix", "Clave PIX"), option("bank_account", "Cuenta bancaria")]
        : [option("cci", "CCI"), option("bank_account", "Cuenta bancaria")],
      billing_options: br
        ? [option("nfse", "Nota fiscal")]
        : [option("boleta", "Boleta"), option("factura", "Factura")],
      billing_document_options: br
        ? [option("cpf", "CPF"), option("cnpj", "CNPJ"), option("foreign", "Documento extranjero")]
        : [
            option("6", "RUC"),
            option("1", "DNI"),
            option("4", "Carné extranjería"),
            option("7", "Pasaporte"),
            option("0", "Otro documento"),
          ],
      error_message: error.slice(0, 300),
      has_error: !!error,
    },
  };
}
