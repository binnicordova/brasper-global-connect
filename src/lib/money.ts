import type { ApiCurrency } from "@/lib/api/types";

export const CURRENCY_SYMBOL: Record<ApiCurrency, string> = { BRL: "R$", PEN: "S/", USD: "US$" };

/** Round to cents, half away from zero, immune to 1.005-style float noise. */
export const roundMoney = (value: number) =>
  Math.sign(value) * (Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100);

export const roundRate = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

/** Fixed, locale-independent formatting (`1,234.50`) so every browser prints the same. */
export function formatNumber(value: number, fractionDigits = 2): string {
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}${fraction ? `${grouped}.${fraction}` : grouped}`;
}

export const formatMoney = (value: number, currency: ApiCurrency) =>
  `${CURRENCY_SYMBOL[currency]} ${formatNumber(value)}`;

export const formatRate = (value: number) => formatNumber(value, 4);

/** Parses what a person typed: tolerates "1.234,50", "1,234.50" and "500". `null` if unusable. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const decimalAt = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let normalized: string;
  if (decimalAt === -1) normalized = cleaned;
  else {
    const decimals = cleaned.length - decimalAt - 1;
    const singleSeparator = cleaned.indexOf(cleaned.charAt(decimalAt)) === decimalAt;
    // "1,234" with one separator and three trailing digits is a thousands group.
    normalized =
      singleSeparator && decimals === 3
        ? cleaned.replace(/[.,]/g, "")
        : `${cleaned.slice(0, decimalAt).replace(/[.,]/g, "")}.${cleaned.slice(decimalAt + 1)}`;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
