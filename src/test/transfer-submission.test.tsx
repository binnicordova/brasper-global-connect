import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { Order, Quote, RatesPayload } from "@/lib/api/types";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ to, children, ...props }: { to: string; children: import("react").ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const backend = vi.hoisted(() => ({
  getRates: vi.fn(),
  createQuote: vi.fn(),
  createOrder: vi.fn(),
  submitProof: vi.fn(),
  cancelOrder: vi.fn(),
  getReceipt: vi.fn(),
  fetchOrder: vi.fn(),
  fetchMyOrders: vi.fn(),
  uploadProof: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({
  api: {
    getRates: backend.getRates,
    createQuote: backend.createQuote,
    createOrder: backend.createOrder,
    submitProof: backend.submitProof,
    cancelOrder: backend.cancelOrder,
    getReceipt: backend.getReceipt,
  },
}));
vi.mock("@/lib/api/firestore", () => ({
  fetchOrder: backend.fetchOrder,
  fetchMyOrders: backend.fetchMyOrders,
}));
vi.mock("@/lib/api/proof", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  uploadProof: backend.uploadProof,
}));

import { Route } from "@/routes/transferencias";
const Portal = Route.options.component as ComponentType;

const rates: RatesPayload = {
  market: {
    base: "USD",
    rates: { BRL: 5, PEN: 4, USD: 1 },
    source: "test",
    fetchedAt: "2026-10-14T00:00:00Z",
    nextUpdateAt: "2026-10-14T01:00:00Z",
    providerUpdatedAt: null,
  },
  pricing: {
    spreadBps: 200,
    commissionBps: 240,
    taxBps: 1800,
    quoteTtlMinutes: 15,
    rateLockMinutes: 30,
    ratesRefreshMinutes: 60,
    largeAmountUsd: 3000,
    minSendUsd: 10,
  },
  minutesPerQueuedClient: 2.5,
};
const quote: Quote = {
  id: "quote-1",
  uid: "uid-1",
  channel: "form",
  status: "open",
  createdAt: "2026-10-14T10:00:00Z",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  sendCurrency: "PEN",
  receiveCurrency: "BRL",
  sendAmount: 1000,
  receiveAmount: 1225,
  marketRate: 1.25,
  rate: 1.225,
  commission: 24,
  tax: 4.32,
  total: 1028.32,
  requiresHuman: false,
};
const pendingOrder = {
  orderId: "BR-0001",
  uid: "uid-1",
  status: "pending",
  createdAt: "2026-10-14T10:01:00Z",
  updatedAt: "2026-10-14T10:01:00Z",
  quoteId: "quote-1",
  clientName: "Ana Paula Souza",
  docType: "CPF",
  docNumber: "52998224725",
  email: "ana@example.com",
  fundsSource: "salary",
  sourceBank: "Nubank",
  sourceAccount: "0001-12345678-9",
  destinationBank: "BCP",
  destinationAccount: "191-1234567890",
  sendAmount: 1000,
  sendCurrency: "PEN",
  receiveAmount: 1225,
  receiveCurrency: "BRL",
  rate: 1.225,
  marketRate: 1.25,
  commission: 24,
  tax: 4.32,
  total: 1028.32,
  rateLockedUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  paymentAccount: {
    currency: "PEN",
    holder: "INGENITECH S.A.C.",
    bank: "BCP",
    accountNumber: "194-0000000-0-00",
    demo: true,
  },
  operationNo: null,
  paymentProofPath: null,
  proofSubmittedAt: null,
  validatedAt: null,
  rejectionReason: null,
  exportedAt: null,
  invoiceStatus: null,
} as Order;

function renderPortal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Portal />
    </QueryClientProvider>,
  );
}
const type = (container: HTMLElement, name: string, value: string) =>
  fireEvent.change(container.querySelector(`[name="${name}"]`)!, { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/transferencias");
  backend.getRates.mockResolvedValue(rates);
  backend.createQuote.mockResolvedValue(quote);
  backend.createOrder.mockResolvedValue(pendingOrder);
  backend.fetchOrder.mockResolvedValue(pendingOrder);
  backend.fetchMyOrders.mockResolvedValue([]);
  backend.uploadProof.mockResolvedValue("proofs/uid-1/BR-0001/proof-1.png");
  backend.submitProof.mockResolvedValue({ ok: true, orderId: "BR-0001" });
});
afterEach(cleanup);

describe("Transfer flow on the Brasper backend", () => {
  it("shows a live estimate, then the server quote, before asking for personal data", async () => {
    renderPortal();
    expect(await screen.findByText(/Recibirían aproximadamente/)).toBeInTheDocument();
    expect(await screen.findByText("R$ 1,225.00")).toBeInTheDocument(); // 1000 PEN · 5/4 · 0.98

    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

    await waitFor(() =>
      expect(backend.createQuote).toHaveBeenCalledWith({
        sendCurrency: "PEN",
        receiveCurrency: "BRL",
        sendAmount: 1000,
      }),
    );
    expect(await screen.findByText("Tu cotización")).toBeInTheDocument();
    expect(screen.getByText("S/ 1,028.32")).toBeInTheDocument(); // total to transfer
    expect(backend.createOrder).not.toHaveBeenCalled();
  });

  it("sends people to a person on WhatsApp when the amount needs negotiation", async () => {
    backend.createQuote.mockRejectedValue(new ApiError("requires-human"));
    renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    const link = await screen.findByRole("link", { name: /Hablar con una persona/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/51966991933\?text=/);
  });

  it("blocks an invalid form locally and submits normalized data to createOrder", async () => {
    const { container } = renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    await screen.findByText("Tu cotización");

    fireEvent.click(screen.getByRole("button", { name: /Crear mi operación/ }));
    expect(await screen.findByText("Escribe tu nombre y apellido.")).toBeInTheDocument();
    expect(backend.createOrder).not.toHaveBeenCalled();

    type(container, "clientName", "  Ana Paula Souza ");
    fireEvent.change(container.querySelector('[name="docType"]')!, { target: { value: "CPF" } });
    type(container, "docNumber", "529.982.247-25");
    type(container, "email", "ANA@Example.com");
    type(container, "sourceBank", "Nubank");
    type(container, "sourceAccount", "0001-12345678-9");
    type(container, "destinationBank", "BCP");
    type(container, "destinationAccount", "191-1234567890");
    fireEvent.click(screen.getByRole("button", { name: /Crear mi operación/ }));

    await waitFor(() =>
      expect(backend.createOrder).toHaveBeenCalledWith({
        quoteId: "quote-1",
        language: "es",
        clientName: "Ana Paula Souza",
        docType: "CPF",
        docNumber: "52998224725",
        email: "ana@example.com",
        fundsSource: "salary",
        sourceBank: "Nubank",
        sourceAccount: "0001-12345678-9",
        destinationBank: "BCP",
        destinationAccount: "191-1234567890",
      }),
    );
    expect(await screen.findByText("BR-0001")).toBeInTheDocument();
    expect(await screen.findByText(/Paga y sube tu comprobante/)).toBeInTheDocument();
    expect(screen.getByText(/cuenta de demostración/)).toBeInTheDocument();
    // The browser keeps a summary of the order but not the client's document or accounts.
    const cache = localStorage.getItem("brasper.orders.v1") ?? "";
    expect(cache).toContain("BR-0001");
    expect(cache).not.toContain("52998224725");
    expect(localStorage.getItem("brasper.profile.v1")).toBeNull();
  });

  it("uploads the proof first, then submits it with the bank operation number", async () => {
    // Come back to an existing order from the cached list.
    localStorage.setItem(
      "brasper.session.v1",
      JSON.stringify({
        uid: "uid-1",
        idToken: "t",
        refreshToken: "r",
        expiresAt: Date.now() + 3_600_000,
      }),
    );
    backend.fetchMyOrders.mockResolvedValue([pendingOrder]);
    renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir BR-0001" }));
    const panel = (await screen.findByText(/Paga y sube tu comprobante/)).closest("section")!;

    fireEvent.click(within(panel).getByRole("button", { name: /Ya pagué/ }));
    expect(await within(panel).findByText(/número de operación debe tener/)).toBeInTheDocument();
    expect(backend.uploadProof).not.toHaveBeenCalled();

    const file = new File(["img"], "pago.png", { type: "image/png" });
    fireEvent.change(panel.querySelector('input[type="text"], input:not([type])')!, {
      target: { value: "op-998877" },
    });
    fireEvent.change(panel.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(within(panel).getByRole("button", { name: /Ya pagué/ }));

    await waitFor(() =>
      expect(backend.submitProof).toHaveBeenCalledWith({
        orderId: "BR-0001",
        operationNo: "op-998877",
        proofPath: "proofs/uid-1/BR-0001/proof-1.png",
      }),
    );
    expect(backend.uploadProof).toHaveBeenCalledWith("BR-0001", file);
  });

  it("offers the receipt only once the invoice is accepted", async () => {
    backend.fetchMyOrders.mockResolvedValue([{ ...pendingOrder, status: "exported" }]);
    backend.fetchOrder.mockResolvedValue({
      ...pendingOrder,
      status: "exported",
      invoiceStatus: "accepted",
    });
    localStorage.setItem(
      "brasper.session.v1",
      JSON.stringify({
        uid: "uid-1",
        idToken: "t",
        refreshToken: "r",
        expiresAt: Date.now() + 3_600_000,
      }),
    );
    renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir BR-0001" }));
    expect(
      await screen.findByRole("button", { name: /Descargar comprobante/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aún no tiene validez tributaria/)).toBeInTheDocument();
  });
});
