import { endpoints } from "./config";
import { ApiError, apiErrorFromBody } from "./errors";
import { getSession } from "./session";
import type {
  CreateOrderRequest,
  Order,
  Quote,
  QuoteRequest,
  RatesPayload,
  ReceiptFile,
} from "./types";

/**
 * Callable-function protocol over HTTPS: POST `{"data": …}` with the Firebase ID token; success is
 * `{"result": …}`, failure `{"error": {status, message, details}}` (message = stable reason code).
 */
export async function callFunction<Output>(name: string, data: unknown = {}): Promise<Output> {
  for (let attempt = 0; ; attempt += 1) {
    const session = await getSession(attempt > 0);
    let response: Response;
    try {
      response = await fetch(endpoints.fn(name), {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.idToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ data }),
      });
    } catch {
      throw new ApiError("network");
    }
    // The token may have been revoked or aged out between our clock and theirs: retry once.
    if (response.status === 401 && attempt === 0) continue;
    const body = (await response.json().catch(() => null)) as { result?: Output } | null;
    if (response.ok && body && "result" in body) return body.result as Output;
    if (response.status >= 500 && !body) throw new ApiError("network", undefined, response.status);
    throw apiErrorFromBody(body, response.status);
  }
}

export const api = {
  getRates: () => callFunction<RatesPayload>("getRates"),
  createQuote: (input: QuoteRequest) =>
    callFunction<Quote>("createQuote", { channel: "form", ...input }),
  createOrder: (input: CreateOrderRequest) => callFunction<Order>("createOrder", input),
  submitProof: (input: { orderId: string; operationNo: string; proofPath: string }) =>
    callFunction<{ ok: true; orderId: string }>("submitProof", input),
  cancelOrder: (orderId: string) => callFunction<{ ok: true }>("cancelOrder", { orderId }),
  getReceipt: (orderId: string) => callFunction<ReceiptFile>("getReceipt", { orderId }),
};
