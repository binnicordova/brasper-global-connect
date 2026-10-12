import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { ComponentType } from "react";
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({
    to,
    hash,
    children,
    ...props
  }: {
    to: string;
    hash?: string;
    children: import("react").ReactNode;
  }) => (
    <a href={to + (hash ? "#" + hash : "")} {...props}>
      {children}
    </a>
  ),
}));
const mock = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  upload: vi.fn(),
  guest: false,
  signedIn: true,
  staff: false,
  startGuest: vi.fn(),
  saveAccess: vi.fn(),
  emailLogin: vi.fn(),
}));
const user = "00000000-0000-4000-8000-000000000001";
const operation = "00000000-0000-4000-8000-000000000002";
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: mock.signedIn
            ? {
                user: {
                  id: "00000000-0000-4000-8000-000000000001",
                  email: mock.guest ? undefined : "client@example.test",
                  is_anonymous: mock.guest,
                },
              }
            : null,
        },
        error: null,
      }),
      signInAnonymously: mock.startGuest,
      updateUser: mock.saveAccess,
      signInWithOtp: mock.emailLogin,
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
                {
                  id: "00000000-0000-4000-8000-000000000004",
                  from_currency: "BRL",
                  to_currency: "PEN",
                  rate: 0.69,
                  commission_percent: 3,
                  min_amount: 10,
                  max_amount: 10000,
                  valid_until: "2099-01-01T00:00:00Z",
                },
              ]
            : table === "transfers"
              ? mock.rows
              : table === "staff_members" && mock.staff
                ? [{ user_id: user }]
                : [],
      });
      const q = {
        select: () => q,
        returns: () => q,
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
  mock.guest = false;
  mock.signedIn = true;
  mock.staff = false;
  mock.startGuest.mockImplementation(async () => ({
    data: { session: { user: { id: user, is_anonymous: true } } },
    error: null,
  }));
  mock.saveAccess.mockResolvedValue({ error: null });
  mock.emailLogin.mockResolvedValue({ error: null });
  URL.createObjectURL = vi.fn(() => "blob:local-preview");
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/transferencias");
  mock.upload.mockResolvedValue({ error: null });
  mock.rpc.mockImplementation(async (name: string, p: Record<string, unknown>) => {
    if (name === "create_validated_transfer") {
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
    if (name === "submit_transfer_proof") {
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

describe("Staff review integration", () => {
  it("verification cannot silently turn into cancellation after reloading", async () => {
    mock.staff = true;
    window.history.replaceState(null, "", `/transferencias#operacion-${operation}`);
    mock.rows = [
      {
        id: operation,
        status: "proof_submitted",
        amount: 300,
        from_currency: "PEN",
        to_currency: "BRL",
        rate: 1.5,
        commission: 0,
        recipient_amount: 450,
        customer_name: "Test",
        customer_document: "123",
        recipient_name: "Recipient",
        recipient_bank: "Bank",
        recipient_account: "111",
        customer_email: "test@example.test",
        recipient_document: "456",
        invoices: [],
        created_at: "2026-10-10T00:00:00Z",
        deposit_instructions: [],
      },
    ];
    mock.rpc.mockImplementation(async (name: string, p: Record<string, unknown>) => {
      if (name === "review_transfer")
        mock.rows = mock.rows.map((r) => ({ ...r, status: "verified" }));
      if (name === "cancel_transfer")
        mock.rows = mock.rows.map((r) => ({ ...r, status: "cancelled" }));
      if (name === "restore_verified_transfer")
        mock.rows = mock.rows.map((r) => ({ ...r, status: "verified" }));
      return { error: null, data: [] };
    });
    render(<Portal />);
    fireEvent.change(await screen.findByLabelText("Acción"), { target: { value: "verify" } });
    fireEvent.change(screen.getByLabelText("Observación"), { target: { value: "tofo bin" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
    await screen.findByText("Ingreso confirmado");
    expect(screen.getByLabelText("Acción")).toHaveValue("");
    expect(screen.getByLabelText("Observación")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Guardar revisión" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Acción").closest("form")!);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "review_transfer")).toHaveLength(1);
    expect(mock.rpc.mock.calls.some(([name]) => name === "cancel_transfer")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar operación…" }));
    fireEvent.change(screen.getByLabelText("Motivo de cancelación"), {
      target: { value: "Explicit test cancellation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar esta operación" }));
    await screen.findByText("Cancelada");
    expect(mock.rpc).toHaveBeenCalledWith("cancel_transfer", {
      p_transfer_id: operation,
      p_expected_status: "verified",
      p_note: "Explicit test cancellation",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restaurar ingreso confirmado" }));
    fireEvent.change(screen.getByLabelText("Motivo de restauración"), {
      target: { value: "Accidental cancellation correction" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar restauración" }));
    await screen.findByText("Ingreso confirmado");
    expect(mock.rpc).toHaveBeenCalledWith("restore_verified_transfer", {
      p_transfer_id: operation,
      p_note: "Accidental cancellation correction",
    });
  });
});
async function fillAndAttach(submit = true, attach = true, invoice = false) {
  const rendered = render(<Portal />);
  await screen.findByText("Cotiza tu envío");
  if (invoice)
    fireEvent.change(screen.getByLabelText("Ruta"), {
      target: { value: "00000000-0000-4000-8000-000000000004" },
    });
  fireEvent.click(screen.getByRole("button", { name: /^Continuar$/ }));
  if (mock.guest)
    fireEvent.change(screen.getByLabelText("Correo para recibir el comprobante"), {
      target: { value: "guest@example.test" },
    });
  for (const [label, value] of [
    ["Tu nombre completo", "Cliente de prueba"],
    ["Tu DNI, RUC o documento", "12345678"],
    ["Tu teléfono con código de país", "+51999999999"],
    ["Banco desde el que pagarás", "Banco de origen"],
    ["Motivo del cambio", "Apoyo a mi familia"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  fireEvent.change(screen.getByLabelText("Origen de los fondos"), { target: { value: "salary" } });
  if (invoice) {
    fireEvent.change(screen.getByLabelText(/Tipo de comprobante/), {
      target: { value: "factura" },
    });
    fireEvent.change(screen.getByLabelText("RUC para la factura"), {
      target: { value: "20100070970" },
    });
    fireEvent.change(screen.getByLabelText("Razón social para la factura"), {
      target: { value: "Empresa de prueba" },
    });
  }
  if (!invoice) {
    fireEvent.change(screen.getByLabelText("Nombre o razón social del receptor fiscal"), {
      target: { value: "Cliente de prueba" },
    });
    fireEvent.change(screen.getByLabelText("Número del documento fiscal"), {
      target: { value: "12345678" },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
  for (const [label, value] of [
    ["Nombre completo del destinatario", "Destinatario"],
    ["Documento del destinatario", "87654321"],
    ["Titular de la cuenta receptora", "Titular"],
    ["Documento del titular (DNI / CPF / CNPJ u otro)", "12345678901"],
    ["Banco de la cuenta receptora", "Banco de prueba"],
    ["Relación con el destinatario y el titular de la cuenta", "Familia"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  if (invoice) {
    fireEvent.change(screen.getByLabelText("Número de cuenta receptora"), {
      target: { value: "123456789" },
    });
  } else {
    fireEvent.change(screen.getByLabelText("Tipo de cuenta o clave"), { target: { value: "pix" } });
    fireEvent.change(screen.getByLabelText("Clave PIX del titular"), {
      target: { value: "recipient@example.test" },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
  expect(screen.getByText("Resumen de tu solicitud")).toBeVisible();
  const file = new File(["photo"], "comprobante.jpg", { type: "image/jpeg" });
  if (attach) {
    fireEvent.change(rendered.container.querySelector('input[name="receipt"]')!, {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText("Número de operación de tu pago bancario"), {
      target: { value: "OP-12345" },
    });
    expect(
      screen.getByRole("img", { name: "Vista previa del comprobante seleccionado" }),
    ).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("checkbox"));
  if (submit)
    fireEvent.click(
      screen.getByRole("button", {
        name: attach
          ? /Enviar solicitud y comprobante a revisión/
          : /Guardar datos y continuar al pago/,
      }),
    );
  return file;
}
describe("Customer transfer submission", () => {
  it("routes a BRL destination to NFSE with billing email and foreign document", async () => {
    await fillAndAttach(true, false);
    await screen.findByText(/Datos registrados. Paso siguiente/);
    expect(mock.rpc).toHaveBeenCalledWith(
      "create_validated_transfer",
      expect.objectContaining({
        p_source_country: "PE",
        p_destination_country: "BR",
        p_origin_bank: "Banco de origen",
        p_funds_origin: "salary",
        p_transfer_purpose: "Apoyo a mi familia",
        p_recipient_relationship: "Familia",
        p_declaration_accepted: true,
        p_billing_type: "nfse",
        p_billing_email: "client@example.test",
        p_billing_name: "Cliente de prueba",
        p_billing_document: "12345678",
        p_billing_document_type: "foreign",
      }),
    );
    expect(screen.getByText("Datos del comprobante")).toBeInTheDocument();
  });
  it("requires the payment operation number before creating a request with a photo", async () => {
    await fillAndAttach(false);
    fireEvent.change(screen.getByLabelText("Número de operación de tu pago bancario"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar solicitud y comprobante a revisión/ }),
    );
    expect(mock.rpc.mock.calls.some(([name]) => name === "create_validated_transfer")).toBe(false);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("blocks an empty Peru declaration and preserves funds when going back", async () => {
    await fillAndAttach(false, false);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByLabelText("Origen de los fondos")).toHaveValue("salary");
    expect(screen.getByLabelText("Motivo del cambio")).toHaveValue("Apoyo a mi familia");
    fireEvent.change(screen.getByLabelText("Origen de los fondos"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByRole("heading", { name: "Tus datos de contacto" })).toBeVisible();
    expect(mock.rpc.mock.calls.some(([name]) => name === "create_validated_transfer")).toBe(false);
  });
  it("records invoice RUC and legal name instead of the receiving-account holder", async () => {
    await fillAndAttach(true, false, true);
    await screen.findByText(/Datos registrados. Paso siguiente/);
    expect(mock.rpc).toHaveBeenCalledWith(
      "create_validated_transfer",
      expect.objectContaining({
        p_billing_type: "factura",
        p_billing_email: "client@example.test",
        p_billing_name: "Empresa de prueba",
        p_billing_document: "20100070970",
        p_billing_document_type: "6",
        p_recipient_account_holder: "Titular",
      }),
    );
  });
  it("preserves billing choices when going back and refuses an empty invoice email", async () => {
    await fillAndAttach(false, false, true);
    expect(screen.getByText("Empresa de prueba · RUC 20100070970")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByLabelText(/Tipo de comprobante/)).toHaveValue("factura");
    expect(screen.getByLabelText("RUC para la factura")).toHaveValue("20100070970");
    fireEvent.change(screen.getByLabelText("Correo para recibir el comprobante"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByRole("heading", { name: "Tus datos de contacto" })).toBeVisible();
    expect(mock.rpc.mock.calls.some(([name]) => name === "create_validated_transfer")).toBe(false);
  });
  it("saves recipient details, uploads the photo and submits the same operation for review", async () => {
    const file = await fillAndAttach();
    await screen.findByText(
      "Solicitud y comprobante enviados a revisión. El equipo verificará el ingreso bancario.",
    );
    expect(mock.rpc).toHaveBeenCalledWith(
      "create_validated_transfer",
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
      "submit_transfer_proof",
      expect.objectContaining({
        p_transfer_id: operation,
        p_bank_reference: "OP-12345",
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
    expect(
      mock.rpc.mock.calls.filter(([name]) => name === "create_validated_transfer"),
    ).toHaveLength(1);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "submit_transfer_proof")).toHaveLength(
      0,
    );
    expect(
      screen.getByText("Esperando tu pago", { selector: "span.operation-status" }),
    ).toBeInTheDocument();
  });
  it("preserves entered data when correcting the account and requires confirmation", async () => {
    await fillAndAttach(false);
    expect(mock.rpc.mock.calls.filter(([name]) => name !== "verify_transfer_contact")).toHaveLength(
      0,
    );
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByLabelText("Clave PIX del titular")).toHaveValue("recipient@example.test");
    fireEvent.change(screen.getByLabelText("Clave PIX del titular"), {
      target: { value: "corrected@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByText("Banco de prueba · corrected@example.test")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar solicitud y comprobante a revisión/ }),
    );
    expect(mock.rpc.mock.calls.filter(([name]) => name !== "verify_transfer_contact")).toHaveLength(
      0,
    );
  });
  it("retains the requested amount and refuses to silently select another route", async () => {
    window.history.replaceState(null, "", "/transferencias?from=USD&to=PEN&amount=450.50");
    render(<Portal />);
    await screen.findByText(/La ruta elegida no tiene una cotización vigente/);
    expect(screen.getByLabelText("Ruta")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ruta"), {
      target: { value: "00000000-0000-4000-8000-000000000003" },
    });
    expect(screen.getByLabelText("Monto que pagas (PEN)")).toHaveValue(450.5);
  });
  it("blocks invalid quote amounts and incomplete contact details before review", async () => {
    render(<Portal />);
    await screen.findByText("Cotiza tu envío");
    fireEvent.change(screen.getByLabelText("Monto que pagas (PEN)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByRole("heading", { name: "Cotiza tu envío" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Monto que pagas (PEN)"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByRole("heading", { name: "Tus datos de contacto" })).toBeVisible();
    expect(mock.rpc.mock.calls.filter(([name]) => name !== "verify_transfer_contact")).toHaveLength(
      0,
    );
  });
  it("registers an unpaid request and shows payment instructions without claiming payment", async () => {
    await fillAndAttach(true, false);
    await screen.findByText(/Datos registrados. Paso siguiente/);
    expect(mock.upload).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Instrucciones de ingreso" })).toBeVisible();
    expect(
      screen.getByText("Esperando tu pago", { selector: "span.operation-status" }),
    ).toBeVisible();
  });
  it("offers guest access without asking for an email, password or registration", async () => {
    mock.signedIn = false;
    render(<Portal />);
    fireEvent.click(await screen.findByRole("button", { name: /Continuar sin cuenta/ }));
    await screen.findByText("Acceso de invitado · sin registro");
    expect(mock.startGuest).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: "Cotiza tu envío" })).toBeVisible();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
  });
  it("submits guest contact and receipt privately without requiring email confirmation", async () => {
    mock.guest = true;
    await fillAndAttach();
    await screen.findByText(/Solicitud y comprobante enviados a revisión/);
    expect(mock.rpc).toHaveBeenCalledWith(
      "create_validated_transfer",
      expect.objectContaining({
        p_billing_email: "guest@example.test",
        p_customer_phone: "+51999999999",
      }),
    );
    expect(mock.upload).toHaveBeenCalledTimes(1);
  });
  it("offers optional access recovery by verified email without collecting a password", async () => {
    mock.guest = true;
    render(<Portal />);
    fireEvent.click(await screen.findByRole("button", { name: /Guardar acceso con una cuenta/ }));
    fireEvent.change(screen.getByLabelText("Correo para guardar tu acceso"), {
      target: { value: "recover@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de confirmación" }));
    await screen.findByText(/Revisa tu correo y confirma el enlace/);
    expect(mock.saveAccess).toHaveBeenCalledWith(
      { email: "recover@example.test" },
      expect.objectContaining({ emailRedirectTo: expect.stringContaining("/transferencias") }),
    );
    expect(screen.queryByLabelText("Elige una contraseña")).not.toBeInTheDocument();
    expect(mock.startGuest).not.toHaveBeenCalled();
  });
});
