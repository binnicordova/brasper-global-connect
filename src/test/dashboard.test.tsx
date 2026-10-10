import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
const mock = vi.hoisted(() => ({
  staff: true,
  rpc: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  ilike: vi.fn(),
  sign: vi.fn(),
  invoices: [] as unknown,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "staff-user" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    rpc: mock.rpc,
    storage: { from: () => ({ createSignedUrl: mock.sign }) },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
    from: (table: string) => {
      const result = Promise.resolve({
        data:
          table === "staff_members"
            ? []
            : [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  customer_name: "Cliente de prueba",
                  recipient_name: "Destinatario",
                  recipient_bank: "Banco de prueba",
                  recipient_account: "123456789",
                  recipient_account_holder: "Titular de prueba",
                  proof_path: "staff-user/00000000-0000-4000-8000-000000000001/deposit/photo.jpg",
                  amount: 300,
                  recipient_amount: 420.38,
                  from_currency: "PEN",
                  to_currency: "BRL",
                  status: "proof_submitted",
                  created_at: "2026-10-10T00:00:00Z",
                  invoices: mock.invoices,
                },
              ],
        count: 1,
        error: null,
      });
      const query = {
        select: () => query,
        order: () => query,
        range: () => query,
        eq: (...args: unknown[]) => {
          mock.eq(...args);
          return query;
        },
        in: (...args: unknown[]) => {
          mock.in(...args);
          return query;
        },
        ilike: (...args: unknown[]) => {
          mock.ilike(...args);
          return query;
        },
        maybeSingle: async () => ({
          data: mock.staff ? { user_id: "staff-user" } : null,
          error: null,
        }),
        then: result.then.bind(result),
      };
      return query;
    },
  },
}));
import { Route } from "@/routes/dashboard";
const Dashboard = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mock.staff = true;
  mock.invoices = [];
  mock.rpc.mockResolvedValue({
    data: {
      statuses: { proof_submitted: 73, verified: 5, paid_out: 8, completed: 12 },
      invoices: { blocked: 3, reconciliation_required: 2 },
      amounts: [],
    },
    error: null,
  });
  mock.sign.mockResolvedValue({
    data: { signedUrl: "https://example.test/private-receipt.jpg?token=test" },
    error: null,
  });
});
afterEach(cleanup);
describe("Staff dashboard", () => {
  it("shows whole-history totals independently of visible rows and filters fiscal issues", async () => {
    render(<Dashboard />);
    const review = await screen.findByRole("button", { name: /Pagos por revisar 73/ });
    expect(review).toBeInTheDocument();
    expect(screen.getByText("Cliente de prueba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revisión fiscal 5/ }));
    await waitFor(() =>
      expect(mock.in).toHaveBeenCalledWith("invoices.status", [
        "blocked",
        "reconciliation_required",
        "beta_rejected",
        "beta_reconciliation_required",
      ]),
    );
    expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute(
      "href",
      "/transferencias#operacion-00000000-0000-4000-8000-000000000001",
    );
  });
  it("does not fetch operational data for a user without the staff role", async () => {
    mock.staff = false;
    render(<Dashboard />);
    expect(await screen.findByText("Acceso para el equipo")).toBeInTheDocument();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(screen.queryByText("Cliente de prueba")).not.toBeInTheDocument();
  });
  it("shows the documented launch plan with phases initially collapsed", async () => {
    render(<Dashboard />);
    await screen.findByRole("button", { name: /Pagos por revisar 73/ });
    fireEvent.click(screen.getByRole("button", { name: "Puesta en marcha" }));
    const phase = screen.getByText("02 · Conectar el entorno real");
    expect(phase.closest("details")).not.toHaveAttribute("open");
    expect(
      screen.getByText("Documento fiscal auténtico aceptado en homologación y correo probado."),
    ).toBeInTheDocument();
  });
  it("opens receiving-account details and the private receipt inside the dashboard", async () => {
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver imagen / datos" }));
    expect(await screen.findByText("Titular de prueba")).toBeInTheDocument();
    expect(screen.getByText("123456789")).toBeInTheDocument();
    const image = await screen.findByRole("img", {
      name: "Comprobante de pago enviado por el cliente",
    });
    expect(image).toHaveAttribute("src", "https://example.test/private-receipt.jpg?token=test");
    expect(mock.sign).toHaveBeenCalledWith(
      "staff-user/00000000-0000-4000-8000-000000000001/deposit/photo.jpg",
      60,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
