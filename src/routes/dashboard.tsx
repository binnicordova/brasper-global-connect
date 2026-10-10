import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Circle,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EvidencePreview } from "@/components/evidence-preview";
import { TransferDetails } from "@/components/transfer-details";
import { supabase } from "@/lib/supabase";
import { statusLabels, invoiceLabels, firstInvoice, type Transfer } from "@/lib/transfers";
import plan from "../../MASTER_PLAN.json";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Centro de operaciones | Brasper" }] }),
});
type Summary = {
  statuses: Record<string, number>;
  invoices: Record<string, number>;
  amounts: { currency: string; amount: number; operations: number }[];
};
const money = (amount: number, currency: string) =>
  `${Number(amount).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
function Dashboard() {
  const [opened, setOpened] = useState<Transfer | null>(null);
  const [access, setAccess] = useState<"loading" | "staff" | "denied">("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Transfer[]>([]);
  const [status, setStatus] = useState("proof_submitted");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("operations");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState({ status: "proof_submitted", search: "" });
  useEffect(() => {
    if (access !== "staff" || !supabase) return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setQuery((q) => ({ ...q })), 500);
    };
    const channel = supabase
      .channel("staff-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "transfers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [access]);
  useEffect(() => {
    if (!supabase) {
      setAccess("denied");
      return;
    }
    let active = true;
    async function checkAccess() {
      setSummary(null);
      setRows([]);
      setOpened(null);
      setAccess("loading");
      const { data: user, error: authError } = await supabase!.auth.getUser();
      if (!active) return;
      if (authError || !user.user) {
        setAccess("denied");
        return;
      }
      const { data, error: roleError } = await supabase!
        .from("staff_members")
        .select("user_id")
        .eq("user_id", user.user.id)
        .maybeSingle();
      if (!active) return;
      if (roleError) setError(roleError.message);
      setAccess(data && !roleError ? "staff" : "denied");
    }
    void checkAccess();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void checkAccess();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (access !== "staff" || !supabase) return;
    let active = true;
    setBusy(true);
    setError("");
    let request = supabase
      .from("transfers")
      .select(query.status === "invoice_attention" ? "*, invoices!inner(*)" : "*, invoices(*)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 50, page * 50 + 49);
    if (query.status === "invoice_attention")
      request = request.in("invoices.status", [
        "blocked",
        "reconciliation_required",
        "beta_rejected",
        "beta_reconciliation_required",
      ]);
    else if (query.status === "sent") request = request.in("status", ["paid_out", "completed"]);
    else if (query.status) request = request.eq("status", query.status);
    if (query.search) request = request.ilike("customer_name", `%${query.search}%`);
    void Promise.all([supabase.rpc("staff_dashboard_summary"), request])
      .then(([s, t]) => {
        if (!active) return;
        if (s.error || t.error) {
          setSummary(null);
          setRows([]);
          setCount(0);
          setError(s.error?.message || t.error?.message || "No se pudo cargar.");
        } else {
          setSummary(s.data);
          setRows(t.data ?? []);
          setOpened((old) => (old ? (t.data?.find((item) => item.id === old.id) ?? old) : null));
          setCount(t.count ?? 0);
          setUpdated(new Date().toLocaleTimeString("es-PE"));
        }
        setBusy(false);
      })
      .catch((e: Error) => {
        if (active) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [access, query, page]);
  function filter(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery({ status, search: search.trim() });
  }
  const statuses = summary?.statuses ?? {},
    invoices = summary?.invoices ?? {};
  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <a className="brand" href="/">
          brasper<span className="text-primary">.</span>
        </a>
        <span className="ops-caption">CENTRO DE OPERACIONES</span>
        <button aria-pressed={tab === "operations"} onClick={() => setTab("operations")}>
          <LayoutDashboard size={18} /> Operaciones
        </button>
        <button aria-pressed={tab === "launch"} onClick={() => setTab("launch")}>
          <ShieldCheck size={18} /> Puesta en marcha
        </button>
        <a href="/transferencias">
          Bandeja de revisión <ArrowUpRight size={16} />
        </a>
        <a href="/">
          Página principal <ArrowUpRight size={16} />
        </a>
        <p>Verificación de ingresos y envíos bancarios a cargo del equipo.</p>
      </aside>
      <main className="ops-main">
        <header className="ops-top">
          <span>Brasper / Equipo</span>
          <a href="/transferencias">
            Mi cuenta <ArrowRight size={15} />
          </a>
        </header>
        <div className="ops-heading">
          <div>
            <span className="section-kicker">Una operación, cada paso</span>
            <h1>{tab === "operations" ? "Tu centro de operaciones." : "Preparar el servicio."}</h1>
            <p>
              {tab === "operations"
                ? "Prioriza la revisión de ingresos, los envíos y los comprobantes pendientes."
                : "Avance técnico según el plan del repositorio. No acredita activación en producción."}
            </p>
          </div>
          {access === "staff" && (
            <Button variant="outline" disabled={busy} onClick={() => setQuery((q) => ({ ...q }))}>
              <RefreshCw size={16} /> {busy ? "Cargando…" : "Actualizar"}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="ops-alert">
            {error}
          </p>
        )}
        {access === "loading" ? (
          <section className="ops-card">
            <p role="status">Comprobando acceso del equipo…</p>
          </section>
        ) : access !== "staff" ? (
          <section className="ops-card ops-access">
            <ShieldCheck size={36} />
            <h2>Acceso para el equipo</h2>
            <p>
              Ingreso exclusivo para cuentas autorizadas por Brasper. Los clientes hacen sus
              transferencias desde su propia cuenta.
            </p>
            <StaffLogin />
            <Button asChild variant="outline">
              <a href="/transferencias">
                Soy cliente <ArrowRight />
              </a>
            </Button>
          </section>
        ) : tab === "operations" ? (
          <>
            <section className="ops-metrics" aria-label="Resumen de todo el historial">
              {[
                {
                  label: "Pagos por revisar",
                  value: statuses["proof_submitted"] ?? 0,
                  hint: "Prueba recibida · validar ingreso",
                  target: "proof_submitted",
                  primary: true,
                },
                {
                  label: "Listas para enviar",
                  value: statuses["verified"] ?? 0,
                  hint: "Ingreso confirmado por el equipo",
                  target: "verified",
                },
                {
                  label: "Envíos registrados",
                  value: (statuses["paid_out"] ?? 0) + (statuses["completed"] ?? 0),
                  hint: "Total histórico · incluye completadas",
                  target: "sent",
                },
                {
                  label: "Revisión fiscal",
                  value:
                    (invoices["blocked"] ?? 0) +
                    (invoices["reconciliation_required"] ?? 0) +
                    (invoices["beta_rejected"] ?? 0) +
                    (invoices["beta_reconciliation_required"] ?? 0),
                  hint: "Configuración o conciliación necesaria",
                  target: "invoice_attention",
                },
              ].map((m) => (
                <button
                  key={m.label}
                  className={`ops-metric ${m.primary ? "primary" : ""}`}
                  disabled={!summary}
                  onClick={() => {
                    setStatus(m.target);
                    setSearch("");
                    setPage(0);
                    setQuery({ status: m.target, search: "" });
                  }}
                >
                  <span>{m.label}</span>
                  <strong>{summary ? m.value : "—"}</strong>
                  <small>{m.hint}</small>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </section>
            <div className="ops-grid">
              <section className="ops-card ops-worklist">
                <div className="ops-card-heading">
                  <div>
                    <h2>Cola de operaciones</h2>
                    <p>Abre una operación para verificar el pago o registrar el envío.</p>
                  </div>
                  <span>{count} resultados</span>
                </div>
                <form className="ops-filters" onSubmit={filter}>
                  <label>
                    Estado
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">Todos los estados</option>
                      <option value="sent">Todos los envíos registrados</option>
                      <option value="invoice_attention">Facturación a revisar</option>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cliente
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nombre"
                      maxLength={200}
                    />
                  </label>
                  <Button type="submit" variant="outline" disabled={busy}>
                    Filtrar
                  </Button>
                </form>
                <div className="ops-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente / operación</th>
                        <th>Importes</th>
                        <th>Estado</th>
                        <th>Comprobante</th>
                        <th>Prueba de pago</th>
                        <th>
                          <span className="sr-only">Acción</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => {
                        const invoice = firstInvoice(t.invoices);
                        return (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.customer_name}</strong>
                            <small>
                              {t.id.slice(0, 8)} ·{" "}
                              {new Date(t.created_at).toLocaleDateString("es-PE")}
                            </small>
                            <small>Para {t.recipient_name}</small>
                          </td>
                          <td>
                            <strong>{money(t.amount, t.from_currency)}</strong>
                            <small>Recibe {money(t.recipient_amount, t.to_currency)}</small>
                          </td>
                          <td>
                            <span className={`ops-status state-${t.status}`}>
                              {statusLabels[t.status]}
                            </span>
                          </td>
                          <td>
                            {invoice ? invoiceLabels[invoice.status] : "Aún no solicitado"}
                            {invoice?.environment === "beta" && (
                              <small>Ensayo sin validez tributaria</small>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ops-receipt-button"
                              onClick={() => setOpened(t)}
                            >
                              <Image size={16} />
                              {t.proof_path ? "Ver imagen / datos" : "Ver datos"}
                            </button>
                            <small>
                              {t.proof_path ? "Archivo privado adjunto" : "Sin prueba adjunta"}
                            </small>
                          </td>
                          <td>
                            <a className="ops-open" href={`/transferencias#operacion-${t.id}`}>
                              Abrir <ArrowRight size={14} />
                            </a>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!busy && !rows.length && (
                  <p className="ops-empty">
                    {error
                      ? "Revisa el error de conexión antes de continuar."
                      : "No hay operaciones para este filtro."}
                  </p>
                )}
                <div className="ops-pagination">
                  <span>
                    {count ? `Página ${page + 1} de ${Math.ceil(count / 50)}` : "Sin resultados"}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={busy || page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy || (page + 1) * 50 >= count}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </section>
              <aside className="ops-support">
                <section className="ops-card">
                  <h2>Importes solicitados</h2>
                  <p>
                    Historial sin canceladas, separado por moneda. No representa saldo bancario.
                  </p>
                  {summary?.amounts.length ? (
                    summary.amounts.map((a) => (
                      <div className="ops-amount" key={a.currency}>
                        <strong>{money(a.amount, a.currency)}</strong>
                        <small>{a.operations} solicitudes</small>
                      </div>
                    ))
                  ) : (
                    <p>{summary ? "Sin solicitudes registradas." : "Datos no disponibles."}</p>
                  )}
                </section>
                <section className="ops-card">
                  <h2>Cola de facturación</h2>
                  {summary ? (
                    Object.entries(invoiceLabels).map(([key, label]) => (
                      <div className="ops-invoice" key={key}>
                        <span>{label}</span>
                        <strong>{invoices[key] ?? 0}</strong>
                      </div>
                    ))
                  ) : (
                    <p>Datos no disponibles.</p>
                  )}
                  <p>Una respuesta fiscal incierta requiere conciliación antes de reintentar.</p>
                </section>
              </aside>
            </div>
            <p className="ops-updated">
              {updated
                ? `Actualizado a las ${updated}. Resumen de todo el historial; listado de 50 operaciones por página.`
                : "Esperando datos del backend."}
            </p>
          </>
        ) : (
          <>
            <section className="ops-card">
              <h2>Métrica principal</h2>
              <p>{plan.northStar}. Consulta el valor real en Operaciones.</p>
            </section>
            <div className="ops-grid">
              <section className="ops-card">
                <h2>Fases del proyecto</h2>
                {plan.phases.map((phase) => {
                  const progress = Math.round(
                    (phase.tasks.filter((t) => t.done).length / phase.tasks.length) * 100,
                  );
                  return (
                    <details className="ops-phase" key={phase.name}>
                      <summary>
                        {phase.name}
                        <span>{progress}%</span>
                      </summary>
                      <progress
                        value={progress}
                        max={100}
                        aria-label={`Avance técnico ${phase.name}`}
                      />
                      {phase.tasks.map((t) => (
                        <p className="ops-task" key={t.label}>
                          {t.done ? <Check size={16} /> : <Circle size={16} />} {t.label}
                        </p>
                      ))}
                      <div className="ops-exit">
                        <strong>Criterio de salida</strong>
                        <p>{phase.exit}</p>
                      </div>
                    </details>
                  );
                })}
                <h2 className="ops-objectives">Objetivos</h2>
                {plan.objectives.map((o) => (
                  <details className="ops-phase" key={o.name}>
                    <summary>{o.name}</summary>
                    {o.results.map((r) => (
                      <div className="ops-result" key={r.label}>
                        <strong>{r.label}</strong>
                        <p>{r.state}</p>
                      </div>
                    ))}
                  </details>
                ))}
              </section>
              <section className="ops-card">
                <h2>Módulos</h2>
                {plan.modules.map((m) => (
                  <div className="ops-module" key={m.name}>
                    <strong>{m.name}</strong>
                    <span>{m.state}</span>
                  </div>
                ))}
                <p>
                  Este plan refleja requisitos documentados. Actualizar MASTER_PLAN.json después de
                  verificar cada activación.
                </p>
              </section>
            </div>
          </>
        )}
        {access === "staff" && (
          <Dialog
            open={Boolean(opened)}
            onOpenChange={(open) => {
              if (!open) setOpened(null);
            }}
          >
            <DialogContent className="operation-dialog">
              <DialogTitle>Operación {opened?.id.slice(0, 8).toUpperCase()}</DialogTitle>
              <DialogDescription>
                Datos enviados por el cliente y sus archivos privados. Comprueba el ingreso en banco
                antes de confirmar.
              </DialogDescription>
              {opened && (
                <>
                  <div className="operation-dialog-summary">
                    <strong>
                      {money(opened.amount, opened.from_currency)} →{" "}
                      {money(opened.recipient_amount, opened.to_currency)}
                    </strong>
                    <span>{statusLabels[opened.status]}</span>
                  </div>
                  <TransferDetails transfer={opened} />
                  {opened.proof_path ? (
                    <EvidencePreview
                      path={opened.proof_path}
                      label="Comprobante de pago enviado por el cliente"
                    />
                  ) : (
                    <p>El cliente todavía no adjuntó su prueba de pago.</p>
                  )}
                  {opened.payout_path && (
                    <EvidencePreview
                      path={opened.payout_path}
                      label="Constancia del envío al destinatario"
                    />
                  )}
                  <Button asChild variant="brand">
                    <a href={`/transferencias#operacion-${opened.id}`}>
                      Revisar esta operación <ArrowRight size={16} />
                    </a>
                  </Button>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
}

function StaffLogin() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void supabase?.auth
      .getUser()
      .then(({ data }) => setSignedIn(!!data.user && !data.user.is_anonymous));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({
      email: String(d.get("email")),
      password: String(d.get("password")),
    });
    setBusy(false);
    if (error) setMsg("Correo o contraseña incorrectos.");
  }
  if (signedIn)
    return (
      <div className="grid gap-2">
        <p role="alert">Esta cuenta no tiene permisos del equipo.</p>
        <Button
          variant="outline"
          onClick={() => void supabase?.auth.signOut().then(() => setSignedIn(false))}
        >
          Cerrar sesión
        </Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="grid w-full max-w-sm gap-3" aria-label="Ingreso del equipo">
      <input name="email" type="email" required placeholder="Correo del equipo" autoComplete="email" className="rounded-md border border-input bg-background px-3 py-2" />
      <input name="password" type="password" required placeholder="Contraseña" autoComplete="current-password" className="rounded-md border border-input bg-background px-3 py-2" />
      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      <Button type="submit" variant="brand" disabled={busy}>
        {busy ? "Ingresando…" : "Ingresar al panel"}
      </Button>
    </form>
  );
}
