import type { ApiCurrency, DocType, FundsSource } from "@/lib/api/types";

/** Suggestions only: the form accepts any bank name. */
const BANKS = {
  BR: ["Nubank", "Itaú", "Bradesco", "Banco do Brasil", "Santander", "Caixa", "Inter", "C6 Bank"],
  PE: ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Pichincha"],
};

export const banksFor = (currency: ApiCurrency): string[] =>
  currency === "BRL" ? BANKS.BR : currency === "PEN" ? BANKS.PE : [...BANKS.PE, ...BANKS.BR];

export const docTypeLabels: Record<DocType, string> = {
  DNI: "DNI (Perú)",
  CE: "Carné de extranjería",
  RUC: "RUC",
  CPF: "CPF (Brasil)",
};

export const fundsSourceLabels: Record<FundsSource, string> = {
  salary: "Sueldo o trabajo independiente",
  savings: "Ahorros",
  business: "Ingresos de negocio",
  asset_sale: "Venta de un bien",
  donation: "Apoyo familiar o donación",
  other: "Otro origen",
};
