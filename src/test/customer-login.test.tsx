import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
const mock = vi.hoisted(() => ({
  navigate: vi.fn(),
  password: vi.fn(),
  signup: vi.fn(),
  otp: vi.fn(),
  google: vi.fn(),
  signout: vi.fn(),
  session: null as null | { user: { id: string; email: string; is_anonymous: boolean } },
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<object>()),
  useNavigate: () => mock.navigate,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mock.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: mock.password,
      signUp: mock.signup,
      signInWithOtp: mock.otp,
      signOut: mock.signout,
    },
  },
}));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: mock.google } } }));
import { Route } from "@/routes/login";
import { Route as IndexRoute } from "@/routes/index";
import { DemoNotice } from "@/components/demo-notice";
const Login = Route.options.component as ComponentType;
const Index = IndexRoute.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mock.session = null;
  mock.password.mockResolvedValue({ data: { session: { user: { id: "customer" } } }, error: null });
  mock.signup.mockResolvedValue({ data: { session: null }, error: null });
  mock.otp.mockResolvedValue({ error: null });
  mock.google.mockResolvedValue({ redirected: true });
  mock.signout.mockResolvedValue({ error: null });
  window.history.replaceState(null, "", "/login");
});
afterEach(cleanup);
it("keeps the landing on the self-service flow, with no login or dashboard entry points", () => {
  window.history.replaceState(null, "", "/?demo=1");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoNotice />
      <Index />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("link", { name: /Iniciar mi transferencia/ })).toHaveAttribute(
    "href",
    "/transferencias",
  );
  expect(document.querySelector('a[href*="login"]')).toBeNull();
  expect(document.querySelector('a[href*="dashboard"]')).toBeNull();
});
it("takes a password login to customer transfers instead of the staff dashboard", async () => {
  render(<Login />);
  await screen.findByLabelText("Correo");
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "client@example.test" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
  await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith({ to: "/transferencias" }));
  expect(mock.password).toHaveBeenCalledTimes(1);
});
it("offers an email link without requiring a password or creating an unintended user", async () => {
  render(<Login />);
  fireEvent.change(await screen.findByLabelText("Correo"), {
    target: { value: "client@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar con enlace por correo" }));
  await screen.findByText(/Si tienes una cuenta con este correo/);
  expect(mock.otp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + "/transferencias",
      },
    }),
  );
  expect(mock.password).not.toHaveBeenCalled();
});
it("keeps errors on the login page and waits for email verification after registration", async () => {
  mock.password.mockResolvedValue({ data: {}, error: { message: "Invalid credentials" } });
  render(<Login />);
  fireEvent.change(await screen.findByLabelText("Correo"), {
    target: { value: "client@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
  await screen.findByText(/Revisa tu correo y contraseña/);
  expect(mock.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
  fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
  await screen.findByText(/Revisa tu correo para confirmar tu cuenta/);
  expect(mock.navigate).not.toHaveBeenCalled();
});
it("preserves a logged-in customer session and uses the customer URL for Google", async () => {
  mock.session = { user: { id: "customer", email: "client@example.test", is_anonymous: false } };
  const view = render(<Login />);
  expect(await screen.findByRole("link", { name: /Ir a mis transferencias/ })).toHaveAttribute(
    "href",
    "/transferencias",
  );
  expect(mock.signout).not.toHaveBeenCalled();
  view.unmount();
  mock.session = null;
  render(<Login />);
  fireEvent.click(await screen.findByRole("button", { name: "Continuar con Google" }));
  await waitFor(() =>
    expect(mock.google).toHaveBeenCalledWith("google", {
      redirect_uri: window.location.origin + "/login",
    }),
  );
});

it("keeps the signed WhatsApp link through guest access and email login", async () => {
  const token = "00000000-0000-4000-8000-000000000001.1893456000." + "a".repeat(64);
  window.history.replaceState(null, "", "/login?wa=" + token);
  render(<Login />);
  expect(await screen.findByRole("link", { name: /Continuar sin cuenta/ })).toHaveAttribute(
    "href",
    "/transferencias?wa=" + token,
  );
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "client@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar con enlace por correo" }));
  await waitFor(() =>
    expect(mock.otp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + "/transferencias?wa=" + token,
        },
      }),
    ),
  );
});
