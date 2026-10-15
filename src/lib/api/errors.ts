/** Stable reasons raised by the Cloud Functions (`error.message`), plus two client-side ones. */
export type ApiErrorCode =
  | "requires-human"
  | "rates-unavailable"
  | "amount-too-small"
  | "invalid-amount"
  | "same-currency"
  | "quote-expired"
  | "quote-not-found"
  | "quote-already-used"
  | "invalid-input"
  | "invalid-operation-no"
  | "invalid-proof-path"
  | "proof-not-uploaded"
  | "proof-too-large"
  | "invalid-proof-file"
  | "operation-no-duplicate"
  | "order-not-found"
  | "order-not-pending"
  | "receipt-not-ready"
  | "not-your-order"
  | "sign-in-required"
  | "network"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<ApiErrorCode>([
  "requires-human",
  "rates-unavailable",
  "amount-too-small",
  "invalid-amount",
  "same-currency",
  "quote-expired",
  "quote-not-found",
  "quote-already-used",
  "invalid-input",
  "invalid-operation-no",
  "invalid-proof-path",
  "proof-not-uploaded",
  "proof-too-large",
  "operation-no-duplicate",
  "order-not-found",
  "order-not-pending",
  "receipt-not-ready",
  "not-your-order",
  "sign-in-required",
]);

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly details?: unknown,
    readonly status?: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** Builds an ApiError from the `{"error": {status, message, details}}` body of a failed call. */
export function apiErrorFromBody(body: unknown, httpStatus: number): ApiError {
  const error = (body as { error?: { message?: unknown; details?: unknown } } | null)?.error;
  const reason = typeof error?.message === "string" ? error.message : "";
  if (KNOWN.has(reason)) return new ApiError(reason as ApiErrorCode, error?.details, httpStatus);
  if (httpStatus === 401) return new ApiError("sign-in-required", undefined, httpStatus);
  return new ApiError("unknown", error?.details, httpStatus);
}

const MESSAGES: Record<ApiErrorCode, string> = {
  "requires-human":
    "Este monto lo negocia una persona del equipo para darte la mejor tasa. Escríbenos por WhatsApp.",
  "rates-unavailable": "No hay una tasa de mercado reciente. Intenta de nuevo en unos minutos.",
  "amount-too-small": "El monto es menor al mínimo para enviar. Prueba con un monto mayor.",
  "invalid-amount": "Ingresa un monto válido mayor a cero.",
  "same-currency": "Elige monedas distintas para enviar y recibir.",
  "quote-expired": "La cotización venció. Genera una nueva para ver la tasa vigente.",
  "quote-not-found": "No encontramos esa cotización. Genera una nueva.",
  "quote-already-used": "Esa cotización ya se convirtió en una operación.",
  "invalid-input": "Revisa los datos marcados e inténtalo otra vez.",
  "invalid-operation-no":
    "El número de operación debe tener entre 4 y 24 letras, números o guiones.",
  "invalid-proof-path": "No pudimos asociar el comprobante a tu operación. Súbelo de nuevo.",
  "proof-not-uploaded": "No encontramos tu comprobante. Súbelo de nuevo y reintenta.",
  "proof-too-large": "El comprobante supera los 8 MB.",
  "invalid-proof-file": "Adjunta una imagen (JPG, PNG, etc.) o un PDF de hasta 8 MB.",
  "operation-no-duplicate": "Ese número de operación ya se usó en otra operación vigente.",
  "order-not-found": "No encontramos esa operación en este navegador.",
  "order-not-pending": "Esta operación ya avanzó y no admite ese cambio.",
  "receipt-not-ready": "Tu comprobante aún no está listo. Te avisaremos aquí cuando lo esté.",
  "not-your-order": "Esa operación pertenece a otra sesión.",
  "sign-in-required": "Tu sesión venció. Recarga la página e inténtalo otra vez.",
  network: "No pudimos conectar con Brasper. Revisa tu conexión e inténtalo otra vez.",
  unknown: "Algo salió mal de nuestro lado. Inténtalo de nuevo o escríbenos por WhatsApp.",
};

export const messageForError = (error: unknown): string =>
  error instanceof ApiError ? MESSAGES[error.code] : MESSAGES.unknown;

/** Field-level problems of an `invalid-input` error: `[{path, message}]` → { path: message }. */
export function fieldIssues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== "invalid-input") return {};
  const issues: Record<string, string> = {};
  if (Array.isArray(error.details))
    for (const item of error.details as { path?: unknown; message?: unknown }[]) {
      const path = Array.isArray(item.path) ? String(item.path[0]) : String(item.path ?? "");
      if (path && typeof item.message === "string" && !(path in issues))
        issues[path] = item.message;
    }
  return issues;
}
