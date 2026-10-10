import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { ComponentType } from "react";
const mock = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  upload: vi.fn(),
}));
const user = "00000000-0000-4000-8000-000000000001";
const operation = "00000000-0000-4000-8000-000000000002";
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: "00000000-0000-4000-8000-000000000001", email: "client@example.test" },
          },
        },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    rpc: mock.rpc,
    storage: { from: () => ({ upload: mock.upload }) },
    from: (table: string) => {
      const response = Promise.resolve({
        error: null,
        data:
          table === "fx_rates"
            ? [
                {
                  id: "00000000-0000-4000-8000-000000000003",
                  from_currency: "PEN",
                  to_currency: "BRL",
                  rate: 1.475,
                  commission_percent: 5,
                  min_amount: 10,
                  max_amount: 10000,
                  valid_until: "2099-01-01T00:00:00Z",
                },
              ]
            : table === "transfers"
              ? mock.rows
              : [],
      });
      const q = {
        select: () => q,
        eq: () => q,
        gt: () => q,
        order: () => q,
        limit: () => q,
        then: response.then.bind(response),
      };
      return q;
    },
  },
}));
import { Route } from "@/routes/transferencias";
const Portal = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mock.rows = [];
  URL.createObjectURL = vi.fn(() => "blob:local-preview");
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/transferencias");
  mock.upload.mockResolvedValue({ error: null });
  mock.rpc.mockImplementation(async (name: string, p: Record<string, unknown>) => {
    if (name === "create_transfer_details") {
      const fields = Object.fromEntries(
        Object.entries(p).map(([key, value]) => [key.replace(/^p_/, ""), value]),
      );
      mock.rows = [
        {
          ...fields,
          id: operation,
          customer_email: "client@example.test",
          from_currency: "PEN",
          to_currency: "BRL",
          amount: 300,
          commission: 15,
          rate: 1.475,
          recipient_amount: 420.38,
          status: "awaiting_payment",
          created_at: "2026-10-10T00:00:00Z",
          invoices: [],
          deposit_instructions: [],
        },
      ];
      return { data: operation, error: null };
    }
    if (name === "submit_proof") {
      mock.rows = mock.rows.map((r) => ({
        ...r,
        status: "proof_submitted",
        proof_path: p["p_path"],
      }));
      return { error: null };
    }
    return { data: [], error: null };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function fillAndAttach() {
  const rendered = render(<Portal />);
  await screen.findByText("Cotiza tu envío");
  for (const [label, value] of [
    ["Tu nombre completo", "Cliente de prueba"],
    ["Tu DNI, RUC o documento", "12345678"],
    ["Tu teléfono con código de país", "+51999999999"],
    ["Nombre completo del destinatario", "Destinatario"],
    ["Documento del destinatario", "87654321"],
    ["Titular de la cuenta receptora", "Titular"],
    ["Documento del titular (DNI / CPF / CNPJ u otro)", "12345678901"],
    ["Banco de la cuenta receptora", "Banco de prueba"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  fireEvent.change(screen.getByLabelText("Tipo de cuenta o clave"), { target: { value: "pix" } });
  fireEvent.change(screen.getByLabelText("Clave PIX del titular"), {
    target: { value: "recipient@example.test" },
  });
  const file = new File(["photo"], "comprobante.jpg", { type: "image/jpeg" });
  fireEvent.change(rendered.container.querySelector('input[name="receipt"]')!, {
    target: { files: [file] },
  });
  expect(
    screen.getByRole("img", { name: "Vista previa del comprobante seleccionado" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: /Enviar solicitud y comprobante a revisión/ }),
  );
  return file;
}
describe("Customer transfer submission", () => {
  it("saves recipient details, uploads the photo and submits the same operation for review", async () => {
    const file = await fillAndAttach();
    await screen.findByText(
      "Solicitud y comprobante enviados a revisión. El equipo verificará el ingreso bancario.",
    );
    expect(mock.rpc).toHaveBeenCalledWith(
      "create_transfer_details",
      expect.objectContaining({
        p_recipient_account_type: "pix",
        p_recipient_account: "recipient@example.test",
        p_recipient_account_holder: "Titular",
        p_recipient_account_holder_document: "12345678901",
        p_customer_phone: "+51999999999",
      }),
    );
    expect(mock.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${user}/${operation}/deposit/.*\\.jpg$`)),
      file,
      { contentType: "image/jpeg", upsert: false },
    );
    expect(mock.rpc).toHaveBeenCalledWith(
      "submit_proof",
      expect.objectContaining({
        p_transfer_id: operation,
        p_path: expect.stringContaining(`${operation}/deposit/`),
      }),
    );
    expect(
      screen.getByText("Pago en revisión", { selector: "span.operation-status" }),
    ).toBeInTheDocument();
  });
  it("keeps the recorded operation if upload fails and instructs retry on that operation", async () => {
    mock.upload.mockResolvedValue({ error: { message: "Storage unavailable" } });
    await fillAndAttach();
    await screen.findByText(/Los datos quedaron guardados, pero no se pudo adjuntar/);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "create_transfer_details")).toHaveLength(
      1,
    );
    expect(mock.rpc.mock.calls.filter(([name]) => name === "submit_proof")).toHaveLength(0);
    expect(
      screen.getByText("Esperando tu pago", { selector: "span.operation-status" }),
    ).toBeInTheDocument();
  });
});
