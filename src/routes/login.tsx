import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { hostedWhatsappToken, whatsappReturnPath } from "@/lib/hosted-whatsapp";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/login")({
  component: CustomerLogin,
  head: () => ({
    meta: [{ title: "Iniciar sesión | Brasper" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});
function CustomerLogin() {
  const navigate = useNavigate();
  const returnPath = whatsappReturnPath(
    typeof window === "undefined" ? "" : window.location.search,
  );
  async function continueToTransfers() {
    if (hostedWhatsappToken(window.location.search)) window.location.assign(returnPath);
    else await navigate({ to: "/transferencias" });
  }
  const [registeredSession, setRegisteredSession] = useState(false);
  const [ready, setReady] = useState(false);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setRegisteredSession(!!data.session && data.session.user.is_anonymous !== true);
      if (error) setMessage("No se pudo comprobar tu sesión. Inténtalo de nuevo.");
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setRegisteredSession(!!session && session.user.is_anonymous !== true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current || !supabase) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar el acceso. Inténtalo de nuevo.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await run(async () => {
      const credentials = {
        email: String(d.get("email")).trim(),
        password: String(d.get("password")),
      };
      const result = register
        ? await supabase!.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: window.location.origin + returnPath },
          })
        : await supabase!.auth.signInWithPassword(credentials);
      if (result.error)
        throw new Error(
          register
            ? result.error.message
            : "No se pudo iniciar sesión. Revisa tu correo y contraseña.",
        );
      if (result.data.session) await continueToTransfers();
      else setMessage("Revisa tu correo para confirmar tu cuenta y acceder a tus transferencias.");
    });
  }
  async function emailLink(form: HTMLFormElement) {
    const email = form.elements.namedItem("email") as HTMLInputElement;
    if (!email.reportValidity()) return;
    await run(async () => {
      const { error } = await supabase!.auth.signInWithOtp({
        email: email.value.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + returnPath,
        },
      });
      if (error) throw new Error("No se pudo solicitar el enlace. Inténtalo de nuevo.");
      setMessage("Si tienes una cuenta con este correo, recibirás un enlace para iniciar sesión.");
    });
  }
  async function googleLogin() {
    await run(async () => {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri:
          window.location.origin +
          "/login" +
          (hostedWhatsappToken(window.location.search)
            ? "?wa=" + encodeURIComponent(hostedWhatsappToken(window.location.search)!)
            : ""),
      });
      if (result.error) throw result.error;
      if (!result.redirected) await continueToTransfers();
    });
  }
  return (
    <div className="portal-page login-page">
      <header className="portal-header wrap">
        <Link to="/" className="brand">
          brasper<span className="text-primary">.</span>
        </Link>
        <Link to="/" className="portal-back">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
      </header>
      <main className="wrap login-main">
        <div className="login-intro">
          <span className="section-kicker">Tu cuenta Brasper</span>
          <h1>{register ? "Tus próximos envíos, más fáciles." : "Bienvenido de nuevo."}</h1>
          <p>
            Consulta tus transferencias, guarda tus cuentas de destino y sigue cada envío desde un
            solo lugar.
          </p>
          <p className="login-privacy">
            <LockKeyhole size={18} /> Tus cuentas guardadas son privadas.
          </p>
        </div>
        <section className="portal-card login-card" aria-labelledby="login-title">
          <h2 id="login-title">{register ? "Crear una cuenta" : "Iniciar sesión"}</h2>
          {!ready ? (
            <p>Comprobando tu sesión…</p>
          ) : !supabase ? (
            <p role="status">
              El acceso a cuentas estará disponible cuando se configure el servicio.
            </p>
          ) : registeredSession ? (
            <div className="login-session">
              <p>Ya tienes una sesión iniciada.</p>
              <Button variant="brand" asChild>
                <a href={returnPath}>
                  Ir a mis transferencias <ArrowRight size={16} />
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { error } = await supabase!.auth.signOut();
                    if (error) throw error;
                  })
                }
              >
                Usar otra cuenta
              </Button>
            </div>
          ) : (
            <>
              <form
                className="portal-form login-form"
                onSubmit={submit}
                aria-label="Acceso a tu cuenta"
              >
                <label>
                  Correo
                  <input name="email" type="email" required maxLength={254} autoComplete="email" />
                </label>
                <label>
                  Contraseña
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={register ? "new-password" : "current-password"}
                  />
                </label>
                <Button variant="brand" disabled={busy}>
                  {busy ? "Procesando…" : register ? "Crear cuenta" : "Ingresar"}{" "}
                  <ArrowRight size={16} />
                </Button>
                {!register && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={(e) => void emailLink(e.currentTarget.form!)}
                  >
                    <Mail size={16} /> Entrar con enlace por correo
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void googleLogin()}
                >
                  Continuar con Google
                </Button>
              </form>
              <button
                type="button"
                className="portal-text-button"
                disabled={busy}
                onClick={() => {
                  setRegister(!register);
                  setMessage("");
                }}
              >
                {register ? "Ya tengo una cuenta" : "Crear mi cuenta"}
              </button>
            </>
          )}
          {message && (
            <p className="portal-notice" role="status">
              {message}
            </p>
          )}
          <div className="login-guest">
            <p>También puedes realizar un cambio sin crear una cuenta.</p>
            <a href={returnPath}>
              Continuar sin cuenta <ArrowRight size={16} />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
