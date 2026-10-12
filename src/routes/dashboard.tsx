import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Circle,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  Image,
  FileText,
  Search,
  Download,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EvidencePreview } from "@/components/evidence-preview";
import { OperationOverview } from "@/components/operation-overview";
import { TransferDetails } from "@/components/transfer-details";
import { TransferReview, type ReviewSubmission } from "@/components/transfer-review";
import { validateProof } from "@/lib/transfers";
import { BillingStatus } from "@/components/billing-status";
import { readBillingCompatible, billingIdentity } from "@/lib/billing";
import { countryLabels } from "@/lib/transfers";
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
  const queryClient = useQueryClient();
  const authIdentity = useRef<string | null | undefined>(undefined);
  const [staffId, setStaffId] = useState("");
  const [detailTab, setDetailTab] = useState("summary");
  const [currency, setCurrency] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const reviewLock = useRef(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  function openOperation(transfer: Transfer) {
    setDetailTab("summary");
    setReviewMessage("");
    setFileError("");
    setOpened(transfer);
  }
  async function openFiscalFile(path: string) {
    if (!supabase || fileBusy) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setFileBusy(true);
    setFileError("");
    try {
      const { data, error } = await supabase.storage
        .from("invoice-documents")
        .createSignedUrl(path, 60);
      if (error || !data?.signedUrl) throw new Error("No se pudo abrir el documento privado.");
      if (popup) popup.location.href = data.signedUrl;
      else setFileError("Permite abrir ventanas para consultar el documento.");
    } catch {
      popup?.close();
      setFileError("No se pudo abrir el documento. Revisa tus permisos e intenta otra vez.");
    } finally {
      setFileBusy(false);
    }
  }

  const [opened, setOpened] = useState<Transfer | null>(null);
  const [access, setAccess] = useState<"loading" | "staff" | "denied">("loading");

  const [status, setStatus] = useState("proof_submitted");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("deposits");
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);

  const [query, setQuery] = useState({ status: "proof_submitted", search: "", currency: "" });
  const summaryQuery = useQuery({
    queryKey: ["staff", "summary", staffId],
    enabled: access === "staff" && !!supabase,
    staleTime: 15000,
    gcTime: 60000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("staff_dashboard_summary");
      if (error) throw error;
      return data as Summary;
    },
  });
  const rowsQuery = useQuery({
    queryKey: ["staff", "rows", staffId, query, page],
    enabled: access === "staff" && !!supabase,
    staleTime: 15000,
    gcTime: 60000,
    retry: false,
    queryFn: async () => {
      // Never transfer signed XML/PDF/CDR payloads just to render a worklist.
      const join =
        query.status.startsWith("invoice_") || query.status.startsWith("email_")
          ? "invoices!inner"
          : "invoices";
      const { data, error, count } = await readBillingCompatible((fields, legacy) => {
        let request = supabase!
          .from("transfers")
          .select(`*, ${join}(${fields})`, { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * 50, page * 50 + 49);
        const billingFilters: Record<string, string[]> = {
          invoice_attention: [
            "blocked",
            "reconciliation_required",
            "beta_rejected",
            "beta_reconciliation_required",
          ],
          invoice_generated: [
            "accepted",
            "beta_accepted",
            "demo_generated",
            "demo_delivered",
            "delivered",
          ],
          invoice_delivered: ["delivered"],
          invoice_pending: ["queued", "processing", "sending"],
        };
        if (legacy && query.status.startsWith("email_"))
          throw new Error("Aplica la migración 012 para consultar los estados de correo.");
        if (query.status === "invoice_delivered")
          request = legacy
            ? request.eq("invoices.status", "delivered")
            : request.eq("invoices.email_status", "sent");
        else if (query.status === "email_attention")
          request = request.in("invoices.email_status", ["blocked", "reconciliation_required"]);
        else if (query.status === "email_retry")
          request = request.eq("invoices.email_status", "retry");
        else if (query.status === "email_pending")
          request = request.in("invoices.email_status", ["sending", "submitted"]);
        else if (billingFilters[query.status])
          request = request.in("invoices.status", billingFilters[query.status]!);
        else if (query.status === "pending_payout")
          request = request.in("status", ["proof_submitted", "verified"]);
        else if (query.status === "sent") request = request.in("status", ["paid_out", "completed"]);
        else if (query.status) request = request.eq("status", query.status);
        if (query.currency) request = request.eq("from_currency", query.currency);
        if (query.search)
          request = request.ilike(
            /^[0-9]+$/.test(query.search) ? "customer_document" : "customer_name",
            `%${query.search}%`,
          );
        return request.returns<Transfer[]>();
      });
      if (error) throw error;
      return { rows: (data ?? []) as Transfer[], count: count ?? 0 };
    },
  });
  const rows = access === "staff" ? (rowsQuery.data?.rows ?? []) : [];
  const summary = access === "staff" ? (summaryQuery.data ?? null) : null;
  const count = rowsQuery.data?.count ?? 0;
  const busy = rowsQuery.isFetching;
  const updated = rowsQuery.dataUpdatedAt
    ? new Date(rowsQuery.dataUpdatedAt).toLocaleTimeString("es-PE")
    : "";
  const loadError = error || rowsQuery.error?.message || summaryQuery.error?.message;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["staff"] });
  };
  async function reviewOperation(t: Transfer, data: ReviewSubmission): Promise<boolean> {
    if (!supabase || access !== "staff" || reviewLock.current) return false;
    reviewLock.current = true;
    setReviewBusy(true);
    setReviewMessage("");
    try {
      let path: string | null = null;
      if (data.action === "payout") {
        if (!data.payout) throw new Error("Adjunta la constancia de envío");
        validateProof(data.payout);
        const ext =
          data.payout.type === "application/pdf"
            ? "pdf"
            : data.payout.type === "image/png"
              ? "png"
              : "jpg";
        path = `${staffId}/${t.id}/payout/${crypto.randomUUID()}.${ext}`;
        const uploaded = await supabase.storage
          .from("transfer-proofs")
          .upload(path, data.payout, { contentType: data.payout.type, upsert: false });
        if (uploaded.error) throw uploaded.error;
      }
      const result =
        data.action === "cancel"
          ? await supabase.rpc("cancel_transfer", {
              p_transfer_id: t.id,
              p_expected_status: t.status,
              p_note: data.note,
            })
          : data.action === "restore"
            ? await supabase.rpc("restore_verified_transfer", {
                p_transfer_id: t.id,
                p_note: data.note,
              })
            : await supabase.rpc("review_transfer", {
                p_transfer_id: t.id,
                p_action: data.action,
                p_note: data.note,
                p_reference: data.reference || "",
                p_payout_path: path,
              });
      if (result.error) throw result.error;
      // Reset the submitted form even when the follow-up read fails.
      let refreshNote = "";
      try {
        const current = await readBillingCompatible((fields) =>
          supabase!
            .from("transfers")
            .select(`*, invoices(${fields})`)
            .eq("id", t.id)
            .returns<Transfer[]>()
            .maybeSingle(),
        );
        if (current.error || !current.data)
          throw current.error || new Error("Operación no disponible");
        setOpened(current.data as Transfer);
      } catch {
        setOpened(null);
        refreshNote = " Actualiza y vuelve a abrir la operación para continuar.";
      }
      refresh();
      setReviewMessage(
        (data.action === "payout"
          ? "Envío registrado. Facturación solicitada."
          : "Revisión guardada.") + refreshNote,
      );
      return true;
    } catch (cause) {
      setReviewMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar. Revisa el estado y vuelve a intentarlo.",
      );
      return false;
    } finally {
      reviewLock.current = false;
      setReviewBusy(false);
    }
  }
  useEffect(() => {
    setOpened((old) => (old ? (rowsQuery.data?.rows.find((t) => t.id === old.id) ?? old) : null));
  }, [rowsQuery.data]);
  useEffect(() => {
    if (access !== "staff" || !supabase) return;
    let timer: number | undefined;
    const invalidate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["staff"] });
      }, 500);
    };
    const channel = supabase
      .channel("staff-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "transfers" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, invalidate)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [access, queryClient]);
  useEffect(() => {
    if (!supabase) {
      setAccess("denied");
      return;
    }
    let active = true;
    async function checkUser(id: string | null) {
      if (!active || authIdentity.current === id) return;
      authIdentity.current = id;
      setOpened(null);
      setStaffId(id ?? "");
      setAccess("loading");
      setError("");
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] === "staff" && q.queryKey[2] !== id,
      });
      if (!id) {
        setAccess("denied");
        return;
      }
      const { data, error } = await supabase!
        .from("staff_members")
        .select("user_id")
        .eq("user_id", id)
        .maybeSingle();
      if (!active || authIdentity.current !== id) return;
      if (error) setError(error.message);
      setAccess(data && !error ? "staff" : "denied");
    }
    // Session is local; the role request still enforces the backend's RLS rules.
    void supabase.auth.getSession().then(({ data }) => checkUser(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid calling Supabase inside its auth callback while the auth lock is held.
      window.setTimeout(() => {
        void checkUser(session?.user.id ?? null);
      }, 0);
    });
    return () => {
      active = false;
      authIdentity.current = undefined;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);
  function filter(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery({ status, search: search.trim(), currency });
  }
  const openedInvoice = opened ? firstInvoice(opened.invoices) : null;
  const statuses = summary?.statuses ?? {},
    invoices = summary?.invoices ?? {};
  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <Link className="brand" to="/">
          brasper<span className="text-primary">.</span>
        </Link>
        <span className="ops-caption">BACKOFFICE · BRASPER</span>
        {[
          { id: "deposits", label: "Pagos por revisar", filter: "proof_submitted", icon: Image },
          { id: "payouts", label: "Envíos pendientes", filter: "pending_payout", icon: Landmark },
          { id: "operations", label: "Todas las operaciones", filter: "", icon: LayoutDashboard },
          { id: "billing", label: "Facturación", filter: "sent", icon: FileText },
        ].map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => {
              setTab(item.id);
              setStatus(item.filter);
              setSearch("");
              setCurrency("");
              setPage(0);
              setOpened(null);
              setQuery({ status: item.filter, search: "", currency: "" });
            }}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
        <button aria-pressed={tab === "launch"} onClick={() => setTab("launch")}>
          <ShieldCheck size={18} /> Puesta en marcha
        </button>
        <Link to="/transferencias">
          Bandeja de revisión <ArrowUpRight size={16} />
        </Link>
        <Link to="/">
          Página principal <ArrowUpRight size={16} />
        </Link>
        <p>Verificación de ingresos y envíos bancarios a cargo del equipo.</p>
      </aside>
      <main className="ops-main">
        <header className="ops-top">
          <span className="ops-breadcrumb">
            Brasper <span>/</span>{" "}
            {tab === "launch"
              ? "Puesta en marcha"
              : tab === "billing"
                ? "Comprobantes"
                : tab === "deposits"
                  ? "Pagos por revisar"
                  : tab === "payouts"
                    ? "Envíos pendientes"
                    : "Operaciones y transferencias"}
          </span>
          <Link to="/transferencias">
            <span className="ops-avatar" aria-hidden="true">
              BR
            </span>{" "}
            Equipo de operaciones <ArrowRight size={15} />
          </Link>
        </header>
        <div className="ops-heading">
          <div>
            <span className="ops-eyebrow">
              <span /> Centro de operaciones
            </span>
            <h1>
              {tab === "launch"
                ? "Preparar el servicio."
                : tab === "billing"
                  ? "Facturación y documentos"
                  : tab === "deposits"
                    ? "Pagos por revisar"
                    : tab === "payouts"
                      ? "Envíos pendientes"
                      : "Operaciones y transferencias"}
            </h1>
            <p>
              {tab !== "launch"
                ? "Prioriza la revisión de ingresos, los envíos y los comprobantes pendientes."
                : "Avance técnico según el plan del repositorio. No acredita activación en producción."}
            </p>
          </div>
          {access === "staff" && (
            <Button variant="outline" disabled={busy} onClick={refresh}>
              <RefreshCw size={16} /> {busy ? "Cargando…" : "Actualizar"}
            </Button>
          )}
        </div>
        {loadError && (
          <p role="alert" className="ops-alert">
            {loadError}
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
              <Link to="/transferencias">
                Soy cliente <ArrowRight />
              </Link>
            </Button>
          </section>
        ) : tab !== "launch" ? (
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
                    setCurrency("");
                    setQuery({ status: m.target, search: "", currency: "" });
                  }}
                >
                  <span>{m.label}</span>
                  <strong>{summary ? m.value : "—"}</strong>
                  <small>{m.hint}</small>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </section>
            <div className="ops-grid ops-operations-grid">
              <section className="ops-card ops-worklist">
                <div className="ops-card-heading">
                  <div>
                    <h2>
                      {tab === "billing"
                        ? "Comprobantes y estado fiscal"
                        : tab === "payouts"
                          ? "Depósitos recibidos · envío pendiente"
                          : tab === "deposits"
                            ? "Comprobantes de depósito por validar"
                            : "Bandeja de operaciones"}
                    </h2>
                    <p>
                      {tab === "payouts"
                        ? "Pruebas recibidas e ingresos confirmados. Valida el depósito y registra el envío desde esta bandeja."
                        : tab === "billing"
                          ? "Operaciones enviadas: estado del documento y entrega por correo, por separado."
                          : "Abre una operación para verificar el pago o registrar el envío."}
                    </p>
                  </div>
                  <span className="ops-count">{count} resultados</span>
                </div>
                {tab === "billing" && (
                  <div className="billing-legend" aria-label="Leyenda de facturación">
                    <span className="billing-tone-generated">● Generado · correo pendiente</span>
                    <span className="billing-tone-success">● Emitido y enviado</span>
                    <span className="billing-tone-warning">● Reintento</span>
                    <span className="billing-tone-danger">● Revisar</span>
                    <span className="billing-tone-demo">● Documento preparado</span>
                  </div>
                )}
                <form className="ops-filters" onSubmit={filter}>
                  <label>
                    Estado
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">Todos los estados</option>
                      <option value="sent">Todos los envíos registrados</option>
                      <option value="pending_payout">Depósito recibido · pendiente de envío</option>
                      <option value="invoice_attention">Facturación con errores</option>
                      <option value="invoice_generated">Comprobante generado</option>
                      <option value="invoice_delivered">Comprobante enviado por correo</option>
                      <option value="invoice_pending">En cola / en proceso</option>
                      <option value="email_pending">Correo enviando / en proveedor</option>
                      <option value="email_retry">Correo por reintentar</option>
                      <option value="email_attention">Correo requiere revisión</option>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cliente o documento
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nombre o número de documento"
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Moneda de origen
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option value="">Todas las monedas</option>
                      <option value="PEN">PEN · Soles</option>
                      <option value="BRL">BRL · Reales</option>
                    </select>
                  </label>
                  <Button type="submit" variant="outline" disabled={busy}>
                    <Search size={14} /> Filtrar
                  </Button>
                </form>
                <div className="ops-table-wrap">
                  <table aria-label="Operaciones de cambio">
                    <thead>
                      <tr>
                        <th>Cliente / operación</th>
                        <th>Ruta / destino</th>
                        <th>Importes</th>
                        <th>Comisión / tasa</th>
                        <th>Estado</th>
                        <th>Comprobante</th>
                        <th>Archivos y detalle</th>
                        <th>
                          <span className="sr-only">Acción</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => {
                        const invoice = firstInvoice(t.invoices);
                        const identity = billingIdentity(t);
                        return (
                          <tr key={t.id}>
                            <td>
                              <strong>{t.customer_name}</strong>
                              <small>
                                {t.demo_meta?.code || t.id.slice(0, 8)} ·{" "}
                                {new Date(t.created_at).toLocaleDateString("es-PE")}
                              </small>
                              <small>{t.customer_document || "Documento no registrado"}</small>
                            </td>
                            <td>
                              <span className="ops-route">
                                <span>{t.from_currency}</span>
                                <ArrowRight size={12} />
                                <span>{t.to_currency}</span>
                              </span>
                              <small>{t.recipient_bank}</small>
                              <small>Para {t.recipient_name}</small>
                            </td>
                            <td>
                              <strong>{money(t.amount, t.from_currency)}</strong>
                              <small>Recibe {money(t.recipient_amount, t.to_currency)}</small>
                            </td>
                            <td>
                              <strong>
                                {Number.isFinite(Number(t.commission))
                                  ? money(t.commission, t.from_currency)
                                  : "No registrada"}
                              </strong>
                              <small>
                                {Number.isFinite(Number(t.rate))
                                  ? `TC ${Number(t.rate).toLocaleString("es-PE", { maximumFractionDigits: 6 })}`
                                  : "Tasa no registrada"}
                              </small>
                            </td>
                            <td>
                              <span className={`ops-status state-${t.status}`}>
                                {statusLabels[t.status]}
                              </span>
                            </td>
                            <td>
                              <strong>{identity.label}</strong>
                              <small>{countryLabels[identity.country]}</small>
                              <small>{t.billing_email || t.customer_email}</small>
                              <BillingStatus invoice={invoice} details />
                              {invoice?.number && <small>{invoice.number}</small>}
                              {invoice?.environment === "beta" && <small>Entorno de prueba</small>}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ops-receipt-button"
                                onClick={() => openOperation(t)}
                              >
                                <Image size={16} />
                                {t.proof_path ? "Ver imagen / datos" : "Ver datos"}
                              </button>
                              <small>
                                {t.proof_path ? "Ingreso adjunto" : "Sin ingreso"} ·{" "}
                                {t.payout_path ? "Envío adjunto" : "Sin envío"}
                              </small>
                              {invoice?.pdf_path && (
                                <button
                                  type="button"
                                  className="ops-document-link"
                                  onClick={() => {
                                    openOperation(t);
                                    setDetailTab("documents");
                                  }}
                                >
                                  <FileText size={13} /> Comprobante PDF
                                </button>
                              )}
                            </td>
                            <td>
                              <Link
                                className="ops-open"
                                to="/transferencias"
                                hash={`operacion-${t.id}`}
                              >
                                Abrir <ArrowRight size={14} />
                              </Link>
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
              <aside className="ops-support" aria-label="Resumen financiero y facturación">
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
            <DialogContent className="operation-dialog ops-operation-dialog">
              <DialogTitle>
                Detalle de la operación{" "}
                <span className="ops-operation-code">
                  {opened?.demo_meta?.code || opened?.id.slice(0, 8).toUpperCase()}
                </span>
              </DialogTitle>
              <DialogDescription>
                Datos enviados por el cliente y sus archivos privados. Comprueba el ingreso en banco
                antes de confirmar.
              </DialogDescription>
              {opened && (
                <>
                  <div className="ops-operation-meta">
                    <span className={`ops-status state-${opened.status}`}>
                      {statusLabels[opened.status]}
                    </span>
                    <span>
                      <ShieldCheck size={14} />{" "}
                      {opened.verified_at ||
                      ["verified", "paid_out", "completed"].includes(opened.status)
                        ? "Ingreso confirmado"
                        : "Ingreso sin confirmar"}
                    </span>
                    <span className="ops-route">
                      {opened.from_currency}
                      <ArrowRight size={12} />
                      {opened.to_currency}
                    </span>
                  </div>
                  <div
                    className="ops-detail-tabs"
                    role="tablist"
                    aria-label="Secciones de la operación"
                  >
                    {[
                      { id: "summary", label: "Resumen" },
                      { id: "data", label: "Datos y fondos" },
                      { id: "documents", label: "Archivos" },
                      { id: "review", label: "Gestionar" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        id={`operation-tab-${item.id}`}
                        role="tab"
                        type="button"
                        aria-selected={detailTab === item.id}
                        tabIndex={detailTab === item.id ? 0 : -1}
                        onKeyDown={(e) => {
                          const ids = ["summary", "data", "documents", "review"];
                          let next: string | undefined;
                          if (e.key === "ArrowRight")
                            next = ids[(ids.indexOf(item.id) + 1) % ids.length];
                          if (e.key === "ArrowLeft")
                            next = ids[(ids.indexOf(item.id) + ids.length - 1) % ids.length];
                          if (e.key === "Home") next = ids[0];
                          if (e.key === "End") next = ids[ids.length - 1];
                          if (next) {
                            e.preventDefault();
                            setDetailTab(next);
                            document.getElementById(`operation-tab-${next}`)?.focus();
                          }
                        }}
                        aria-controls="operation-panel"
                        onClick={() => setDetailTab(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div
                    id="operation-panel"
                    role="tabpanel"
                    aria-labelledby={`operation-tab-${detailTab}`}
                  >
                    {detailTab === "summary" && <OperationOverview transfer={opened} />}
                    {detailTab === "data" && <TransferDetails transfer={opened} />}
                    {detailTab === "review" && (
                      <div className="ops-detail-card">
                        {reviewMessage && <p role="status">{reviewMessage}</p>}
                        {opened.proof_path && (
                          <EvidencePreview
                            path={opened.proof_path}
                            label="Comprobante de ingreso a verificar"
                          />
                        )}
                        <TransferReview
                          key={`${opened.id}:${opened.status}`}
                          id={opened.id}
                          status={opened.status}
                          busy={reviewBusy}
                          onReview={(data) => reviewOperation(opened, data)}
                        />
                      </div>
                    )}
                    {detailTab === "documents" && (
                      <div className="ops-files-grid">
                        <section className="ops-detail-card">
                          <h3>
                            <Image size={16} /> Prueba de ingreso
                          </h3>
                          {opened.proof_path ? (
                            <EvidencePreview
                              path={opened.proof_path}
                              label="Comprobante de pago enviado por el cliente"
                            />
                          ) : (
                            <p>El cliente todavía no adjuntó su prueba de pago.</p>
                          )}
                        </section>
                        <section className="ops-detail-card">
                          <h3>
                            <Landmark size={16} /> Constancia de envío
                          </h3>
                          {opened.payout_path ? (
                            <EvidencePreview
                              path={opened.payout_path}
                              label="Constancia del envío al destinatario"
                            />
                          ) : (
                            <p>El envío todavía no tiene constancia registrada.</p>
                          )}
                        </section>
                        <section className="ops-detail-card ops-fiscal-documents">
                          <h3>
                            <FileText size={16} /> Comprobante fiscal
                          </h3>
                          <BillingStatus invoice={openedInvoice} details />
                          {openedInvoice?.number && <strong>{openedInvoice.number}</strong>}
                          {openedInvoice?.demo_email && (
                            <p>
                              Entrega preparada para <strong>{openedInvoice.demo_email}</strong>
                              {openedInvoice.demo_delivered_at &&
                                ` · ${new Date(openedInvoice.demo_delivered_at).toLocaleString("es-PE")}`}
                              . No se envía a un servicio de correo real.
                            </p>
                          )}
                          {openedInvoice?.environment === "beta" && <p>Entorno de prueba</p>}
                          {openedInvoice?.status === "demo_generated" && (
                            <p>PDF disponible. Envío por correo pendiente de integración.</p>
                          )}
                          {openedInvoice?.error && (
                            <p className="ops-alert">{openedInvoice.error}</p>
                          )}
                          <div className="ops-document-actions">
                            {[
                              { label: "PDF", path: openedInvoice?.pdf_path },
                              { label: "XML", path: openedInvoice?.xml_path },
                              { label: "CDR", path: openedInvoice?.cdr_path },
                            ]
                              .filter((file) => file.path)
                              .map((file) => (
                                <Button
                                  key={file.label}
                                  variant="outline"
                                  disabled={fileBusy}
                                  onClick={() => void openFiscalFile(file.path!)}
                                >
                                  <Download size={14} /> Abrir {file.label}
                                </Button>
                              ))}
                          </div>
                          {fileError && <p role="alert">{fileError}</p>}
                        </section>
                      </div>
                    )}
                  </div>
                  <Button asChild variant="brand">
                    <Link to="/transferencias" hash={`operacion-${opened.id}`}>
                      Revisar esta operación <ArrowRight size={16} />
                    </Link>
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
      <input
        name="email"
        type="email"
        required
        placeholder="Correo del equipo"
        autoComplete="email"
        className="rounded-md border border-input bg-background px-3 py-2"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Contraseña"
        autoComplete="current-password"
        className="rounded-md border border-input bg-background px-3 py-2"
      />
      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
      <Button type="submit" variant="brand" disabled={busy}>
        {busy ? "Ingresando…" : "Ingresar al panel"}
      </Button>
    </form>
  );
}
