import type { ReceiptFile } from "@/lib/api/types";

export function receiptBlob(file: ReceiptFile): Blob {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: file.contentType });
}

export function saveReceipt(file: ReceiptFile): void {
  const url = URL.createObjectURL(receiptBlob(file));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shows only the last digits of an account in summaries. */
export function maskAccount(value: string): string {
  const clean = value.replace(/\s/g, "");
  return clean.length <= 4 ? clean : `•••${clean.slice(-4)}`;
}
