import { endpoints } from "./config";
import { ApiError } from "./errors";
import { getSession } from "./session";
import type { Order } from "./types";

/**
 * Clients may read their own `orders/{id}` documents (firestore.rules). We use the REST API so
 * the site needs no Firebase SDK: fetch one order, or query every order owned by this session.
 */
type FsValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FsValue> };
  arrayValue?: { values?: FsValue[] };
};

export function decodeValue(value: FsValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields ?? {});
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  return null;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

const asOrder = (doc: { fields?: Record<string, FsValue> }): Order =>
  decodeFields(doc.fields ?? {}) as unknown as Order;

async function authorized(url: string, init: RequestInit = {}): Promise<Response> {
  const session = await getSession();
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${session.idToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ApiError("network");
  }
}

/** One order of this session, or `null` if it does not exist or belongs to someone else. */
export async function fetchOrder(orderId: string): Promise<Order | null> {
  const response = await authorized(
    `${endpoints.firestore()}/orders/${encodeURIComponent(orderId)}`,
  );
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new ApiError(response.status >= 500 ? "network" : "unknown");
  return asOrder(await response.json());
}

/** Every order owned by this session, newest first. */
export async function fetchMyOrders(): Promise<Order[]> {
  const session = await getSession();
  const response = await authorized(`${endpoints.firestore()}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "uid" },
            op: "EQUAL",
            value: { stringValue: session.uid },
          },
        },
        limit: 50,
      },
    }),
  });
  if (!response.ok) throw new ApiError(response.status >= 500 ? "network" : "unknown");
  const rows = (await response.json()) as { document?: { fields?: Record<string, FsValue> } }[];
  return rows
    .flatMap((row) => (row.document ? [asOrder(row.document)] : []))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
