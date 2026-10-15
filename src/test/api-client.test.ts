import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, callFunction } from "@/lib/api/client";
import { ApiError, fieldIssues, messageForError } from "@/lib/api/errors";
import { decodeFields, fetchMyOrders, fetchOrder } from "@/lib/api/firestore";
import { SESSION_KEY, storedSession, type Session } from "@/lib/api/session";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const signUp = () =>
  json(200, { idToken: "tok-1", localId: "uid-1", refreshToken: "ref-1", expiresIn: "3600" });
const urlOf = (call: unknown[]) => String(call[0]);
const callsTo = (mock: ReturnType<typeof vi.fn>, part: string) =>
  mock.mock.calls.filter((call) => urlOf(call).includes(part));

const stored = (patch: Partial<Session> = {}): Session => ({
  uid: "uid-1",
  idToken: "tok-1",
  refreshToken: "ref-1",
  expiresAt: Date.now() + 3_600_000,
  ...patch,
});
const seed = (patch?: Partial<Session>) =>
  localStorage.setItem(SESSION_KEY, JSON.stringify(stored(patch)));

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Cloud Functions client", () => {
  it("signs in anonymously once, then reuses the session and wraps the body in {data}", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("accounts:signUp") ? signUp() : json(200, { result: { ok: true } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callFunction("getRates");
    await expect(api.cancelOrder("BR-0001")).resolves.toEqual({ ok: true });

    expect(callsTo(fetchMock, "accounts:signUp")).toHaveLength(1);
    const [url, init] = callsTo(fetchMock, "cancelorder")[0] as [string, RequestInit];
    expect(url).toBe("https://cancelorder-h5wenirx2q-rj.a.run.app");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer tok-1");
    expect(JSON.parse(String(init.body))).toEqual({ data: { orderId: "BR-0001" } });
    expect(storedSession()?.uid).toBe("uid-1");
  });

  it("asks createQuote with the form channel and returns the server quote untouched", async () => {
    seed();
    const quote = { id: "q1", total: 822.66 };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(200, { result: quote }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.createQuote({ sendCurrency: "BRL", receiveCurrency: "PEN", sendAmount: 800 }),
    ).resolves.toEqual(quote);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body)).data).toEqual({
      channel: "form",
      sendCurrency: "BRL",
      receiveCurrency: "PEN",
      sendAmount: 800,
    });
  });

  it("turns the documented error body into a typed ApiError with a Spanish message", async () => {
    seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(400, {
          error: { status: "FAILED_PRECONDITION", message: "quote-expired", details: null },
        }),
      ),
    );
    const error = await callFunction("createOrder", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("quote-expired");
    expect(messageForError(error)).toMatch(/venció/);
  });

  it("exposes field problems of invalid-input errors", () => {
    const error = new ApiError("invalid-input", [
      { path: ["email"], message: "Correo inválido" },
      { path: "docNumber", message: "Documento inválido" },
    ]);
    expect(fieldIssues(error)).toEqual({
      email: "Correo inválido",
      docNumber: "Documento inválido",
    });
    expect(fieldIssues(new Error("x"))).toEqual({});
  });

  it("retries once with a refreshed token after a 401", async () => {
    seed();
    let functionCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("securetoken"))
        return json(200, {
          id_token: "tok-2",
          refresh_token: "ref-2",
          user_id: "uid-1",
          expires_in: "3600",
        });
      functionCalls += 1;
      return functionCalls === 1
        ? json(401, { error: { status: "UNAUTHENTICATED", message: "sign-in-required" } })
        : json(200, { result: { ok: true } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(callFunction("getRates")).resolves.toEqual({ ok: true });
    const second = callsTo(fetchMock, "getrates")[1] as [string, RequestInit];
    expect((second[1].headers as Record<string, string>)["authorization"]).toBe("Bearer tok-2");
  });

  it("never replaces the account when the token service has a hiccup", async () => {
    seed({ expiresAt: Date.now() - 1000 });
    const fetchMock = vi.fn(async () => json(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callFunction("getRates")).rejects.toMatchObject({ code: "network" });
    expect(callsTo(fetchMock, "accounts:signUp")).toHaveLength(0);
    expect(storedSession()?.uid).toBe("uid-1");
  });

  it("creates a new anonymous account only when the refresh token is rejected", async () => {
    seed({ expiresAt: Date.now() - 1000 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("securetoken")
          ? json(400, { error: { message: "TOKEN_EXPIRED" } })
          : url.includes("accounts:signUp")
            ? json(200, {
                idToken: "tok-9",
                localId: "uid-9",
                refreshToken: "ref-9",
                expiresIn: "3600",
              })
            : json(200, { result: {} }),
      ),
    );
    await callFunction("getRates");
    expect(storedSession()?.uid).toBe("uid-9");
  });

  it("reports a dropped connection as a network error", async () => {
    seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(callFunction("getRates")).rejects.toMatchObject({ code: "network" });
  });
});

describe("Firestore reads (own orders only)", () => {
  it("decodes Firestore REST values into plain data", () => {
    expect(
      decodeFields({
        orderId: { stringValue: "BR-0001" },
        total: { doubleValue: 822.66 },
        seq: { integerValue: "1" },
        proofSubmittedAt: { nullValue: null },
        paymentAccount: { mapValue: { fields: { demo: { booleanValue: true } } } },
        tags: { arrayValue: { values: [{ stringValue: "a" }] } },
        createdAt: { timestampValue: "2026-10-14T12:00:00Z" },
      }),
    ).toEqual({
      orderId: "BR-0001",
      total: 822.66,
      seq: 1,
      proofSubmittedAt: null,
      paymentAccount: { demo: true },
      tags: ["a"],
      createdAt: "2026-10-14T12:00:00Z",
    });
  });

  it("returns null for a missing or foreign order instead of throwing", async () => {
    seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(403, { error: { status: "PERMISSION_DENIED" } })),
    );
    await expect(fetchOrder("BR-0001")).resolves.toBeNull();
  });

  it("queries by the session uid and lists the newest order first", async () => {
    seed();
    const doc = (orderId: string, createdAt: string) => ({
      document: {
        fields: { orderId: { stringValue: orderId }, createdAt: { stringValue: createdAt } },
      },
    });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(200, [
        doc("BR-0001", "2026-10-13T10:00:00Z"),
        {},
        doc("BR-0002", "2026-10-14T10:00:00Z"),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const orders = await fetchMyOrders();

    expect(orders.map((o) => o.orderId)).toEqual(["BR-0002", "BR-0001"]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const query = JSON.parse(String(init.body)).structuredQuery;
    expect(query.where.fieldFilter).toMatchObject({
      field: { fieldPath: "uid" },
      op: "EQUAL",
      value: { stringValue: "uid-1" },
    });
  });
});
