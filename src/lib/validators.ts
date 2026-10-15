import type { DocType } from "@/lib/api/types";

// Same rules as the Cloud Functions (`createOrder`), so the form catches mistakes before the call.
const onlyDigits = (value: string) => value.replace(/\D/g, "");

export const normalizeDocNumber = (docType: DocType, value: string) =>
  docType === "CE" ? value.trim().toUpperCase() : onlyDigits(value);

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

export function isValidRuc(value: string): boolean {
  const ruc = onlyDigits(value);
  if (ruc.length !== 11 || !/^(10|15|17|20)/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0);
  return (11 - (sum % 11)) % 10 === Number(ruc[10]);
}

export function isValidDocNumber(docType: DocType, value: string): boolean {
  switch (docType) {
    case "DNI":
      return /^\d{8}$/.test(onlyDigits(value));
    case "CE":
      return /^[A-Z0-9]{9,12}$/.test(value.trim().toUpperCase());
    case "RUC":
      return isValidRuc(value);
    case "CPF":
      return isValidCpf(value);
  }
}

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
export const isValidName = (value: string) => value.trim().length >= 3 && /\s/.test(value.trim());
export const isValidOperationNo = (value: string) => /^[A-Za-z0-9-]{4,24}$/.test(value.trim());
export const isValidAccount = (value: string) => value.trim().length >= 4;
