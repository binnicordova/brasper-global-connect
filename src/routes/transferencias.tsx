import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Upload,
  RefreshCw,
  LogOut,
  ArrowLeftRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  transferInput,
  quoteAmounts,
  validateProof,
  statusLabels,
  invoiceLabels,
  type Rate,
  type Transfer,
} from "@/lib/transfers";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/transferencias")({
  component: TransferPortal,
  head: () => ({ meta: [{ title: "Mis transferencias | Brasper" }] }),
});
const money = (n: number, c: string) =>
  `${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
function TransferPortal() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [staff, setStaff] = useState(false),
    [rates, setRates] = useState<Rate[]>([]),
    [selected, setSelected] = useState(""),
    [amount, setAmount] = useState("300"),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [events, setEvents] = useState<
      { transfer_id: string; action: string; note: string; created_at: string }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [register, setRegister] = useState(false),
    [admin, setAdmin] = useState(false);
  const rate = rates.find((r) => r.id === selected),
    amounts = rate
      ? quoteAmounts(Number(amount), Number(rate.rate), Number(rate.commission_percent))
      : null;
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  async function load() {
    if (!supabase) return;
    const [r, t, e, s] = await Promise.all([
      supabase
        .from("fx_rates")
        .select("*")
        .eq("active", true)
        .gt("valid_until", new Date().toISOString()),
      supabase
        .from("transfers")
        .select("*, invoices(*)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("transfer_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("staff_members").select("user_id"),
    ]);
    for (const result of [r, t, e, s]) if (result.error) throw result.error;
    setRates(r.data ?? []);
    setSelected((old) => (r.data?.some((item) => item.id === old) ? old : r.data?.[0]?.id || ""));
    setTransfers(t.data ?? []);
    setEvents(e.data ?? []);
    setStaff(Boolean(s.data?.length));
  }
  useEffect(() => {
    if (session) {
      setTransfers([]);
      setEvents([]);
      setRates([]);
      setStaff(false);
      setAdmin(false);
      setSelected("");
      void load().catch((e) => setMessage(e.message));
    } else {
      setTransfers([]);
      setStaff(false);
      setAdmin(false);
    }
  }, [session]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No pudimos completar la operación.");
    } finally {
      setBusy(false);
    }
  }
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await run(async () => {
      if (!supabase) return;
      const credentials = { email: String(d.get("email")), password: String(d.get("password")) };
      const result = register
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: window.location.origin + "/transferencias" },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (register) setMessage("Revisa tu correo para confirmar tu cuenta antes de operar.");
    });
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    await run(async () => {
      if (!supabase || !rate) return;
      const v = transferInput.parse({ rateId: rate.id, amount, ...Object.fromEntries(d) });
      const { error } = await supabase.rpc("create_transfer", {
        p_rate_id: v.rateId,
        p_amount: v.amount,
        p_customer_name: v.customerName,
        p_customer_document: v.customerDocument,
        p_recipient_name: v.recipientName,
        p_recipient_document: v.recipientDocument,
        p_recipient_bank: v.recipientBank,
        p_recipient_account: v.recipientAccount,
      });
      if (error) throw error;
      form.reset();
      await load();
      setMessage(
        "Solicitud registrada. Usa las instrucciones de pago de tu operación y adjunta la prueba.",
      );
    });
  }
  async function upload(t: Transfer, file: File, kind: "deposit" | "payout") {
    if (!supabase || !session) throw new Error("Inicia sesión");
    validateProof(file);
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `${session.user.id}/${t.id}/${kind}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("transfer-proofs")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }
  async function proof(t: Transfer, file: File) {
    await run(async () => {
      const path = await upload(t, file, "deposit");
      const { error } = await supabase!.rpc("submit_proof", { p_transfer_id: t.id, p_path: path });
      if (error) throw error;
      await load();
      setMessage("Prueba recibida. Nuestro equipo verificará el ingreso en la cuenta bancaria.");
    });
  }
  async function review(t: Transfer, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await run(async () => {
      const action = String(d.get("action"));
      let path: string | null = null;
      if (action === "payout") {
        const file = d.get("payout");
        if (!(file instanceof File) || !file.size)
          throw new Error("Adjunta la constancia de envío");
        path = await upload(t, file, "payout");
      }
      const { error } = await supabase!.rpc("review_transfer", {
        p_transfer_id: t.id,
        p_action: action,
        p_note: String(d.get("note")),
        p_reference: String(d.get("reference") || ""),
        p_payout_path: path,
      });
      if (error) throw error;
      await load();
      setMessage(
        action === "payout"
          ? "Envío registrado. Se creó la solicitud de facturación."
          : "Revisión registrada.",
      );
    });
  }
  async function loadMore() {
    const { data, error } = await supabase!
      .from("transfers")
      .select("*, invoices(*)")
      .order("created_at", { ascending: false })
      .range(transfers.length, transfers.length + 99);
    if (error) throw error;
    setTransfers((old) => [...old, ...(data ?? [])]);
    if (!data?.length) setMessage("No hay más operaciones.");
  }
  async function loadEvents(id: string) {
    const { data, error } = await supabase!
      .from("transfer_events")
      .select("*")
      .eq("transfer_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setEvents((old) => [...old.filter((event) => event.transfer_id !== id), ...(data ?? [])]);
  }
  async function openFile(bucket: string, path: string) {
    await run(async () => {
      const { data, error } = await supabase!.storage.from(bucket).createSignedUrl(path, 60);
      if (error) throw error;
      window.location.assign(data.signedUrl);
    });
  }
  return (
    <div className="portal-page">
      <header className="portal-header wrap">
        <a href="/" className="brand">
          brasper<span className="text-primary">.</span>
        </a>
        <a href="/" className="portal-back">
          <ArrowLeft size={16} /> Volver al inicio
        </a>
        {session && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { error } = await supabase!.auth.signOut();
                if (error) throw error;
              })
            }
          >
            <LogOut size={16} /> Salir
          </Button>
        )}
      </header>
      <main className="wrap portal-main">
        <div className="portal-heading">
          <span className="section-kicker">Tu dinero, paso a paso</span>
          <h1>{admin ? "Operaciones de Brasper" : "Tus transferencias, en un solo lugar"}</h1>
          <p>Cotiza, adjunta tu prueba de pago y sigue el envío hasta recibir tu comprobante.</p>
        </div>
        {message && (
          <div className="portal-notice" role="status">
            {message}
          </div>
        )}
        {!supabase ? (
          <section className="portal-card">
            <LockKeyhole />
            <h2>El portal se está preparando</h2>
            <p>
              Las solicitudes estarán disponibles cuando Brasper habilite el servicio. Puedes pedir
              atención por{" "}
              <a href="https://wa.me/51966991933" target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              .
            </p>
          </section>
        ) : !ready ? (
          <p>Cargando…</p>
        ) : !session ? (
          <section className="portal-card auth-card">
            <h2>{register ? "Crea tu cuenta" : "Accede a tus operaciones"}</h2>
            <p>Tu correo te permitirá consultar el avance y recibir tu comprobante.</p>
            <form onSubmit={auth} className="portal-form">
              <label>
                Correo
                <input name="email" type="email" required autoComplete="email" />
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
                {register ? "Crear cuenta" : "Ingresar"}
                <ArrowRight size={16} />
              </Button>
            </form>
            <button className="portal-text-button" onClick={() => setRegister(!register)}>
              {register ? "Ya tengo una cuenta" : "Quiero crear una cuenta"}
            </button>
          </section>
        ) : (
          <>
            <div className="portal-toolbar">
              <span>{session.user.email}</span>
              <div>
                {staff && (
                  <Button variant="outline" onClick={() => setAdmin(!admin)}>
                    {admin ? "Vista de cliente" : "Bandeja del equipo"}
                  </Button>
                )}
                <Button variant="outline" disabled={busy} onClick={() => void run(load)}>
                  <RefreshCw size={16} /> Actualizar
                </Button>
              </div>
            </div>
            {!admin && (
              <section className="portal-card">
                <div className="portal-section-title">
                  <ArrowLeftRight />
                  <div>
                    <h2>Una nueva transferencia</h2>
                    <p>La tasa y comisión se guardan con tu solicitud.</p>
                  </div>
                </div>
                {!rates.length ? (
                  <p>
                    No hay cotizaciones vigentes. Nuestro equipo debe habilitar una tasa antes de
                    recibir nuevas solicitudes.
                  </p>
                ) : (
                  <form className="portal-form transfer-form" onSubmit={create}>
                    <label>
                      Ruta
                      <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                        {rates.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.from_currency} → {r.to_currency}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Monto que pagas ({rate?.from_currency})
                      <input
                        type="number"
                        min={rate?.min_amount}
                        max={rate?.max_amount}
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </label>
                    {rate && amounts && (
                      <div className="quote-summary wide">
                        <div>
                          <span>Comisión</span>
                          <strong>{money(amounts.commission, rate.from_currency)}</strong>
                        </div>
                        <div>
                          <span>Neto a convertir</span>
                          <strong>
                            {money(Number(amount) - amounts.commission, rate.from_currency)}
                          </strong>
                        </div>
                        <div>
                          <span>El destinatario recibe</span>
                          <strong>{money(amounts.received, rate.to_currency)}</strong>
                        </div>
                        <p>
                          Tasa: {rate.rate} · Cotización disponible hasta{" "}
                          {new Date(rate.valid_until).toLocaleString("es-PE")}
                        </p>
                      </div>
                    )}
                    {[
                      ["customerName", "Tu nombre completo"],
                      ["customerDocument", "Tu DNI, RUC o documento"],
                      ["recipientName", "Nombre del destinatario"],
                      ["recipientDocument", "Documento del destinatario"],
                      ["recipientBank", "Banco de destino"],
                      ["recipientAccount", "Cuenta o clave de destino"],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input name={name} required minLength={2} maxLength={200} />
                      </label>
                    ))}
                    <label className="wide portal-consent">
                      <input type="checkbox" required /> Confirmo los datos del destinatario y
                      autorizo su uso para gestionar este envío y el comprobante.
                    </label>
                    <Button variant="brand" className="wide" disabled={busy}>
                      Registrar solicitud <ArrowRight size={16} />
                    </Button>
                    <p className="wide">
                      La prueba de pago será revisada por el equipo antes de enviar el dinero.
                    </p>
                  </form>
                )}
              </section>
            )}
            <section className="portal-operations">
              <h2>{admin ? "Bandeja de revisión" : "Historial de operaciones"}</h2>
              {!transfers.length && (
                <div className="portal-card">
                  <p>Aún no hay operaciones registradas.</p>
                </div>
              )}
              {transfers.map((t) => {
                const invoice = t.invoices?.[0];
                return (
                  <article className="portal-card operation-card" key={t.id}>
                    <div className="operation-top">
                      <div>
                        <span className="operation-id">
                          {t.id.slice(0, 8).toUpperCase()} ·{" "}
                          {new Date(t.created_at).toLocaleDateString("es-PE")}
                        </span>
                        <h3>
                          {money(t.amount, t.from_currency)} <ArrowRight size={18} />{" "}
                          {money(t.recipient_amount, t.to_currency)}
                        </h3>
                        <p>
                          Para {t.recipient_name} · {t.recipient_bank}
                        </p>
                      </div>
                      <span className={`operation-status status-${t.status}`}>
                        {statusLabels[t.status]}
                      </span>
                    </div>
                    <ol className="operation-steps">
                      {[
                        "Solicitud",
                        "Pago en revisión",
                        "Ingreso confirmado",
                        "Dinero enviado",
                        "Comprobante enviado",
                      ].map((label, i) => (
                        <li
                          key={label}
                          className={
                            [
                              "awaiting_payment",
                              "proof_submitted",
                              "verified",
                              "paid_out",
                              "completed",
                            ].indexOf(t.status) >= i
                              ? "done"
                              : ""
                          }
                        >
                          <CheckCircle2 size={15} />
                          {label}
                        </li>
                      ))}
                    </ol>
                    {t.status === "awaiting_payment" && (
                      <div className="payment-instructions">
                        <h4>Instrucciones de ingreso</h4>
                        {t.deposit_instructions.map((a) => (
                          <p key={a.account_number}>
                            <strong>
                              {a.bank} · {a.holder}
                            </strong>
                            <br />
                            Cuenta: {a.account_number}
                            <br />
                            {a.instructions}
                          </p>
                        ))}
                        <p>
                          Importe: <strong>{money(t.amount, t.from_currency)}</strong>. Indica la
                          referencia {t.id.slice(0, 8).toUpperCase()}.
                        </p>
                      </div>
                    )}
                    {["awaiting_payment", "proof_submitted"].includes(t.status) && !admin && (
                      <label className="upload-proof">
                        <Upload size={18} />
                        {t.proof_path ? "Adjuntar una nueva prueba" : "Subir prueba de pago"}
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void proof(t, f);
                            e.target.value = "";
                          }}
                        />
                        <small>PDF, JPG o PNG · máximo 5 MB</small>
                      </label>
                    )}
                    <div className="document-actions">
                      {t.proof_path && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openFile("transfer-proofs", t.proof_path!)}
                        >
                          Ver prueba de ingreso
                        </Button>
                      )}
                      {t.payout_path && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openFile("transfer-proofs", t.payout_path!)}
                        >
                          Ver constancia de envío
                        </Button>
                      )}
                      {invoice?.pdf_path && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openFile("invoice-documents", invoice.pdf_path!)}
                        >
                          <FileText size={16} /> Comprobante {invoice.number}
                        </Button>
                      )}
                    </div>
                    {invoice && (
                      <p className="billing-status">
                        {invoiceLabels[invoice.status]}
                        {admin && invoice.error ? ` · ${invoice.error}` : ""}
                      </p>
                    )}
                    {admin && (
                      <>
                        <details>
                          <summary>Datos de conciliación</summary>
                          <p>
                            {t.customer_name} · {t.customer_document} · {t.customer_email}
                          </p>
                          <p>
                            Destinatario: {t.recipient_document} · Cuenta: {t.recipient_account}
                          </p>
                          <p>
                            Comisión: {money(t.commission, t.from_currency)} · Tasa: {t.rate}
                          </p>
                          {t.payout_reference && <p>Referencia de envío: {t.payout_reference}</p>}
                        </details>
                        {["proof_submitted", "verified", "awaiting_payment"].includes(t.status) && (
                          <form
                            className="portal-form review-form"
                            onSubmit={(e) => void review(t, e)}
                          >
                            <label>
                              Acción
                              <select name="action">
                                {t.status === "proof_submitted" && (
                                  <>
                                    <option value="verify">Confirmar ingreso bancario</option>
                                    <option value="request_proof">Solicitar otra prueba</option>
                                  </>
                                )}
                                {t.status === "verified" && (
                                  <option value="payout">Registrar dinero enviado</option>
                                )}
                                <option value="cancel">Cancelar operación</option>
                              </select>
                            </label>
                            <label>
                              Observación
                              <input
                                name="note"
                                required
                                minLength={3}
                                maxLength={1000}
                                placeholder="Resultado de la verificación"
                              />
                            </label>
                            {t.status === "verified" && (
                              <>
                                <label>
                                  Referencia bancaria del envío
                                  <input name="reference" maxLength={200} />
                                </label>
                                <label>
                                  Constancia de envío
                                  <input
                                    name="payout"
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png"
                                  />
                                </label>
                              </>
                            )}
                            <Button variant="brand" disabled={busy}>
                              Guardar revisión
                            </Button>
                          </form>
                        )}
                      </>
                    )}
                    <details
                      className="event-history"
                      onToggle={(e) => {
                        if (e.currentTarget.open)
                          void loadEvents(t.id).catch((error) => setMessage(error.message));
                      }}
                    >
                      <summary>Seguimiento de la operación</summary>
                      {events
                        .filter((e) => e.transfer_id === t.id)
                        .map((e, i) => (
                          <p key={i}>
                            <strong>{new Date(e.created_at).toLocaleString("es-PE")}</strong> ·{" "}
                            {{
                              verify: "Ingreso bancario confirmado",
                              request_proof: "Nueva prueba solicitada",
                              cancel: "Operación cancelada",
                              payout: "Envío registrado",
                            }[e.action] || e.action}
                            {e.note && ` — ${e.note}`}
                          </p>
                        ))}
                    </details>
                  </article>
                );
              })}
              {transfers.length >= 100 && (
                <Button variant="outline" disabled={busy} onClick={() => void run(loadMore)}>
                  Mostrar más operaciones
                </Button>
              )}
            </section>
          </>
        )}
      </main>
      <footer className="wrap portal-footer">
        <LockKeyhole size={14} /> Tus archivos son privados. La confirmación del ingreso la realiza
        nuestro equipo.
      </footer>
    </div>
  );
}
