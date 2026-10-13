// Keep provider diagnostics numeric: never persist raw bodies, tokens or customer data.
export class MetaSendError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  constructor(status: number, payload: unknown) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error: unknown }).error
        : null;
    const value = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
    const code =
      Number.isSafeInteger(value.code) && Number(value.code) > 0 ? Number(value.code) : null;
    const subcode =
      Number.isSafeInteger(value.error_subcode) && Number(value.error_subcode) > 0
        ? Number(value.error_subcode)
        : null;
    super(`Meta send failed (HTTP ${status}, code ${code ?? "unknown"})`);
    this.name = "MetaSendError";
    this.code = code;
    this.subcode = subcode;
  }
}
export function whatsappErrorCode(error: unknown) {
  return error instanceof MetaSendError && error.code
    ? `meta_${error.code}${error.subcode ? "_" + error.subcode : ""}`
    : "processing_failed";
}
export async function deliverNativeFlow(
  deliver: () => Promise<unknown>,
  notify: (message: string) => Promise<unknown>,
) {
  try {
    await deliver();
  } catch (error) {
    const message =
      error instanceof MetaSendError && error.code === 139000
        ? "Meta está bloqueando temporalmente el formulario dentro de WhatsApp. Puedes seguir consultando conmigo; si prefieres completar el cambio en la web, escribe abrir web."
        : "No pude enviar el formulario dentro de WhatsApp en este momento. Puedes seguir consultando conmigo o escribir abrir web para continuar por ese canal.";
    // If Meta also rejects the notice, preserve the original diagnostic for staff.
    try {
      await notify(message);
    } catch {
      /* Original send failure remains authoritative. */
    }
    throw error;
  }
}
