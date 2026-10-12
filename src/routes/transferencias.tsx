import { BillingStatus } from "@/components/billing-status";
import { INVOICE_LIST_FIELDS } from "@/lib/billing";
import { readExchangeIntent, exchangePath } from "@/lib/exchange-intent";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  RefreshCw,
  LogOut,
  ArrowLeftRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  countryLabels,
  billingTypeLabels,
  billingDocumentLabels,
  fundsOriginLabels,
  identityDocumentLabels,
  quoteAmounts,
  validateProof,
  statusLabels,
  invoiceLabels,
  firstInvoice,
  type Rate,
  type Transfer,
} from "@/lib/transfers";
import { Button } from "@/components/ui/button";
import { ReceiptUpload } from "@/components/receipt-upload";
import { EvidenceDetails } from "@/components/evidence-preview";
import { TransferReview, type ReviewSubmission } from "@/components/transfer-review";
import { TransferDetails } from "@/components/transfer-details";
import { recipientDetailsInput } from "@/lib/transfers";
export const Route = createFileRoute("/transferencias")({
  component: TransferPortal,
  head: () => ({ meta: [{ title: "Mis transferencias | Brasper" }] }),
});
const money = (n: number, c: string) =>
  `${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
function TransferPortal() {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [embedded, setEmbedded] = useState(false);
  const [embeddedOperation, setEmbeddedOperation] = useState<string | null>(null);
  useEffect(() => {
    setEmbedded(
      window.self !== window.top &&
        new URLSearchParams(window.location.search).get("embed") === "1",
    );
  }, []);
  useEffect(() => {
    if (embedded)
      window.parent.postMessage({ type: "brasper:exchange-step", step }, window.location.origin);
  }, [embedded, step]);
  const [saveGuestAccess, setSaveGuestAccess] = useState(false);
  const [reviewData, setReviewData] = useState<ReturnType<
    typeof recipientDetailsInput.parse
  > | null>(null);
  const [intent, setIntent] = useState<ReturnType<typeof readExchangeIntent>>(null);
  useEffect(() => {
    const requested = readExchangeIntent(window.location.search);
    setIntent(requested);
    if (requested) setAmount(requested.amount);
    else {
      const amount = new URLSearchParams(window.location.search).get("amount");
      if (amount && /^\d{1,9}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0) setAmount(amount);
    }
  }, []);
  useEffect(() => {
    formRef.current?.querySelector<HTMLHeadingElement>(`fieldset[data-step="${step}"] h3`)?.focus();
  }, [step]);
  function validStep(index: number) {
    const fields = formRef.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      `fieldset[data-step="${index}"] input,fieldset[data-step="${index}"] select,fieldset[data-step="${index}"] textarea`,
    );
    return Array.from(fields ?? []).every((field) => field.reportValidity());
  }
  function nextStep() {
    if (!validStep(step)) return;
    if (!rate || new Date(rate.valid_until).getTime() <= Date.now()) {
      setMessage("La cotización venció. Actualiza para obtener una tasa vigente.");
      return;
    }
    if (step === 2) {
      const result = recipientDetailsInput.safeParse({
        rateId: rate.id,
        amount,
        ...Object.fromEntries(new FormData(formRef.current!)),
      });
      if (!result.success) {
        setMessage(result.error.issues[0]?.message || "Revisa los datos.");
        return;
      }
      setReviewData(result.data);
    }
    setMessage("");
    setStep((old) => Math.min(old + 1, 3));
  }
  const [initialReceipt, setInitialReceipt] = useState<File | null>(null);
  const [accountType, setAccountType] = useState("bank_account");
  const [customerDocumentType, setCustomerDocumentType] = useState("1");
  const [fundsOrigin, setFundsOrigin] = useState("");
  const [initialBankReference, setInitialBankReference] = useState("");
  const [bankReferences, setBankReferences] = useState<Record<string, string>>({});
  const [billingType, setBillingType] = useState("boleta");
  const [brazilDocumentType, setBrazilDocumentType] = useState("foreign");
  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [newOperation, setNewOperation] = useState<string | null>(null);
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
  const sessionUserId = session?.user.id;
  const sessionEmail = session?.user.email;
  const sessionAnonymous = session?.user.is_anonymous;
  const guest = sessionAnonymous === true;
  useEffect(() => {
    if (newOperation) {
      const element = document.getElementById(`operacion-${newOperation}`);
      if (element) {
        if (!embedded) element.scrollIntoView({ behavior: "smooth", block: "start" });
        setNewOperation(null);
      }
    }
  }, [embedded, newOperation, transfers]);
  const rate = rates.find((r) => r.id === selected),
    amounts = rate
      ? quoteAmounts(Number(amount), Number(rate.rate), Number(rate.commission_percent))
      : null;
  const sourceCountry =
    rate?.from_currency === "PEN" ? "PE" : rate?.from_currency === "BRL" ? "BR" : "";
  const destinationCountry =
    rate?.to_currency === "PEN" ? "PE" : rate?.to_currency === "BRL" ? "BR" : "";
  const effectiveBillingType = destinationCountry === "BR" ? "nfse" : billingType;
  const involvesPeru = sourceCountry === "PE" || destinationCountry === "PE";
  const billingDocumentType = ["cpf", "cnpj"].includes(customerDocumentType)
    ? "0"
    : customerDocumentType;
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
  const load = useCallback(async () => {
    if (!supabase) return;
    if (sessionUserId && !sessionAnonymous && sessionEmail) {
      const { error } = await supabase.rpc("verify_transfer_contact");
      if (error) throw error;
    }
    const operation = window.location.hash.match(/^#operacion-([0-9a-f-]{36})$/i)?.[1];
    let transferQuery = supabase
      .from("transfers")
      .select(`*, invoices(${INVOICE_LIST_FIELDS})`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (operation) transferQuery = transferQuery.eq("id", operation);
    const [r, t, e, s] = await Promise.all([
      supabase
        .from("fx_rates")
        .select("*")
        .eq("active", true)
        .gt("valid_until", new Date().toISOString()),
      transferQuery,
      supabase
        .from("transfer_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("staff_members").select("user_id"),
    ]);
    for (const result of [r, t, e, s]) if (result.error) throw result.error;
    const available = (r.data ?? []).filter(
      (item) =>
        ["PEN", "BRL"].includes(item.from_currency) &&
        ["PEN", "BRL"].includes(item.to_currency) &&
        item.from_currency !== item.to_currency,
    );
    setRates(available);
    const routeParams = new URLSearchParams(window.location.search);
    const unsupported = [routeParams.get("from"), routeParams.get("to")].includes("USD");
    const requested = readExchangeIntent(window.location.search);
    const matching = available.find(
      (item) => item.from_currency === requested?.from && item.to_currency === requested?.to,
    );
    setSelected((old) =>
      !unsupported && available.some((item) => item.id === old)
        ? old
        : matching?.id || (requested || unsupported ? "" : available[0]?.id) || "",
    );
    if ((requested || unsupported) && !matching)
      setMessage(
        "La ruta elegida no tiene una cotización vigente. Elige una de las rutas disponibles para continuar.",
      );
    setTransfers(t.data ?? []);
    setEvents(e.data ?? []);
    setStaff(Boolean(s.data?.length));
    if (operation && s.data?.length) setAdmin(true);
  }, [sessionUserId, sessionAnonymous, sessionEmail]);
  useEffect(() => {
    setStep(0);
    setReviewData(null);
    if (sessionUserId) {
      setInitialReceipt(null);
      setProofFiles({});
      setTransfers([]);
      setEvents([]);
      setRates([]);
      setStaff(false);
      setAdmin(false);
      setSelected("");
    } else {
      setInitialReceipt(null);
      setProofFiles({});
      setTransfers([]);
      setStaff(false);
      setAdmin(false);
    }
  }, [sessionUserId]);
  useEffect(() => {
    if (sessionUserId) void load().catch((e) => setMessage(e.message));
  }, [load, sessionUserId]);

  async function startGuest() {
    await run(async () => {
      const { data, error } = await supabase!.auth.signInAnonymously();
      if (error) throw new Error("No se pudo abrir el acceso de invitado. " + error.message);
      if (!data.session) throw new Error("No se pudo abrir el acceso de invitado.");
      setSession(data.session);
    });
  }
  async function saveAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    await run(async () => {
      const { error } = await supabase!.auth.updateUser(
        { email: String(fields.get("email")) },
        { emailRedirectTo: window.location.origin + "/transferencias" },
      );
      if (error) throw error;
      setSaveGuestAccess(false);
      setMessage(
        "Revisa tu correo y confirma el enlace para guardar el acceso a estas operaciones. Conserva este navegador hasta confirmarlo.",
      );
    });
  }
  const actionInProgress = useRef(false);
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (actionInProgress.current) return false;
    actionInProgress.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No pudimos completar la operación.");
      return false;
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }
  async function emailLogin(form: HTMLFormElement) {
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    if (!emailInput.reportValidity()) return;
    await run(async () => {
      const { error } = await supabase!.auth.signInWithOtp({
        email: emailInput.value,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + "/transferencias",
        },
      });
      if (error) throw error;
      setMessage(
        "Si tienes una cuenta con este correo, recibirás un enlace para ingresar sin contraseña.",
      );
    });
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
            options: {
              emailRedirectTo:
                window.location.origin +
                (intent ? exchangePath(intent.from, intent.to, intent.amount) : "/transferencias"),
            },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (!register && result.data.user) {
        const { data: staff } = await supabase
          .from("staff_members")
          .select("user_id")
          .eq("user_id", result.data.user.id)
          .maybeSingle();
        if (staff) {
          window.location.assign("/dashboard");
          return;
        }
      }
      if (register) setMessage("Revisa tu correo para confirmar tu cuenta antes de operar.");
    });
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (step < 3) {
      nextStep();
      return;
    }
    for (let index = 0; index < 4; index++) {
      if (!validStep(index)) {
        setStep(index);
        return;
      }
    }
    const form = e.currentTarget,
      d = new FormData(form);
    await run(async () => {
      if (!supabase || !rate) return;
      const v = recipientDetailsInput.parse({ rateId: rate.id, amount, ...Object.fromEntries(d) });
      const file = initialReceipt;
      if (file) {
        validateProof(file);
        if (initialBankReference.trim().length < 2)
          throw new Error("Indica el número de operación de tu pago bancario");
      }
      const { data: id, error } = await supabase.rpc("create_validated_transfer", {
        p_declaration_accepted: d.get("declarationAccepted") === "yes",
        p_customer_document_type: v.customerDocumentType,
        p_source_country: v.sourceCountry,
        p_destination_country: v.destinationCountry,
        p_origin_bank: v.originBank,
        p_funds_origin: v.fundsOrigin,
        p_funds_detail: v.fundsDetail,
        p_transfer_purpose: v.transferPurpose,
        p_recipient_relationship: v.recipientRelationship,
        p_rate_id: v.rateId,
        p_amount: v.amount,
        p_customer_name: v.customerName,
        p_customer_document: v.customerDocument,
        p_recipient_name: v.recipientName,
        p_recipient_document: v.recipientDocument,
        p_recipient_bank: v.recipientBank,
        p_recipient_account: v.recipientAccount,
        p_recipient_account_type: v.recipientAccountType,
        p_recipient_account_holder: v.recipientAccountHolder,
        p_recipient_account_holder_document: v.recipientAccountHolderDocument,
        p_recipient_bank_branch: v.recipientBankBranch,
        p_customer_phone: v.customerPhone,
        p_recipient_phone: v.recipientPhone,
        p_transfer_note: v.transferNote,
        p_billing_type: v.billingType,
        p_billing_email: v.billingEmail,
        p_billing_name: v.billingType !== "boleta" ? v.billingLegalName : v.customerName,
        p_billing_document: v.billingType !== "boleta" ? v.billingRuc : v.customerDocument,
        p_billing_document_type: v.billingType === "factura" ? "6" : v.billingDocumentType,
      });
      if (error) throw error;
      form.reset();
      setStep(0);
      setReviewData(null);
      setIntent(null);
      setInitialReceipt(null);
      setBillingType("boleta");
      setCustomerDocumentType("1");
      setFundsOrigin("");
      setInitialBankReference("");
      let receiptError = "";
      if (file) {
        try {
          const path = await upload({ id }, file, "deposit");
          const { error: attachError } = await supabase.rpc("submit_transfer_proof", {
            p_bank_reference: initialBankReference.trim(),
            p_transfer_id: id,
            p_path: path,
          });
          if (attachError) throw attachError;
        } catch {
          receiptError =
            "Los datos quedaron guardados, pero no se pudo adjuntar el comprobante. Vuelve a subirlo en esta operación; no registres otra solicitud.";
        }
      }
      window.history.replaceState(
        null,
        "",
        window.location.pathname +
          (embedded
            ? `?embed=1${new URLSearchParams(window.location.search).get("demo") === "1" ? "&demo=1" : ""}`
            : ""),
      );
      await load();
      setNewOperation(id);
      if (embedded) {
        setEmbeddedOperation(id);
        window.parent.postMessage({ type: "brasper:exchange-created" }, window.location.origin);
      }
      setMessage(
        receiptError ||
          (file
            ? "Solicitud y comprobante enviados a revisión. El equipo verificará el ingreso bancario."
            : "Datos registrados. Paso siguiente: realiza el pago a la cuenta indicada y envía tu comprobante a revisión."),
      );
    });
  }
  async function upload(t: Pick<Transfer, "id">, file: File, kind: "deposit" | "payout") {
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
      const reference = (bankReferences[t.id] ?? t.deposit_bank_reference ?? "").trim();
      if (reference.length < 2 || reference.length > 100)
        throw new Error("Indica el número de operación de tu pago bancario");
      const path = await upload(t, file, "deposit");
      const { error } = await supabase!.rpc("submit_transfer_proof", {
        p_transfer_id: t.id,
        p_path: path,
        p_bank_reference: reference,
      });
      if (error) throw error;
      setProofFiles((old) => ({ ...old, [t.id]: null }));
      await load();
      setMessage("Prueba recibida. Nuestro equipo verificará el ingreso en la cuenta bancaria.");
    });
  }
  async function review(t: Transfer, data: ReviewSubmission) {
    return run(async () => {
      const { action, note } = data;
      let path: string | null = null;
      if (action === "payout") {
        if (!data.payout) throw new Error("Adjunta la constancia de envío");
        path = await upload(t, data.payout, "payout");
      }
      const result =
        action === "cancel"
          ? await supabase!.rpc("cancel_transfer", {
              p_transfer_id: t.id,
              p_expected_status: t.status,
              p_note: note,
            })
          : action === "restore"
            ? await supabase!.rpc("restore_verified_transfer", {
                p_transfer_id: t.id,
                p_note: note,
              })
            : await supabase!.rpc("review_transfer", {
                p_transfer_id: t.id,
                p_action: action,
                p_note: note,
                p_reference: data.reference || "",
                p_payout_path: path,
              });
      if (result.error) throw result.error;
      // A successful mutation must reset the form even if refreshing fails.
      let refreshError = "";
      try {
        await load();
      } catch {
        refreshError = " Actualiza para ver el estado guardado.";
      }
      setMessage(
        (action === "payout"
          ? "Envío registrado. Se creó la solicitud de facturación."
          : action === "cancel"
            ? "Operación cancelada con confirmación explícita."
            : action === "restore"
              ? "Ingreso confirmado restaurado. Puedes registrar el envío."
              : "Revisión registrada.") + refreshError,
      );
    });
  }
  async function loadMore() {
    const { data, error } = await supabase!
      .from("transfers")
      .select(`*, invoices(${INVOICE_LIST_FIELDS})`)
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
    <div
      className={`portal-page${embedded ? " portal-embedded" : ""}${embeddedOperation ? " embed-created" : ""}`}
    >
      <header className="portal-header wrap">
        <Link to="/" className="brand">
          brasper<span className="text-primary">.</span>
        </Link>
        <Link to="/" className="portal-back">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
        {staff && (
          <Link to="/dashboard" className="portal-back">
            Dashboard <ArrowRight size={16} />
          </Link>
        )}
        {session && !guest && (
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
          <p>Solicita tu cambio, registra la cuenta de destino y sigue cada paso desde la web.</p>
          {intent && (
            <div className="exchange-intent">
              Quieres cambiar <strong>{money(Number(intent.amount), intent.from)}</strong> a{" "}
              <strong>{intent.to}</strong>. La tasa vigente se confirma en el primer paso.
            </div>
          )}
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
            <h2>Inicia tu cambio sin registrarte</h2>
            <p>No necesitas crear una cuenta ni elegir una contraseña para registrar el cambio.</p>
            <Button variant="brand" disabled={busy} onClick={() => void startGuest()}>
              Continuar sin cuenta <ArrowRight size={16} />
            </Button>
            <details className="optional-account">
              <summary>Prefiero usar una cuenta</summary>
              <h3>{register ? "Crea tu cuenta" : "Accede a tus operaciones"}</h3>
              <p>Una cuenta permite consultar tus operaciones desde otros dispositivos.</p>
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
                {!register && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={(e) => void emailLogin(e.currentTarget.form!)}
                  >
                    Recibir enlace de acceso por correo
                  </Button>
                )}
              </form>
              <button className="portal-text-button" onClick={() => setRegister(!register)}>
                {register ? "Ya tengo una cuenta" : "Quiero crear una cuenta"}
              </button>
            </details>
          </section>
        ) : (
          <>
            <div className="portal-toolbar">
              <span>{guest ? "Acceso de invitado · sin registro" : session.user.email}</span>
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
            {guest && (
              <section className="portal-card guest-access">
                <h2>Tu cambio queda disponible en este navegador</h2>
                <p>
                  Conserva esta sesión para consultar el estado y subir el comprobante. Si borras
                  los datos del navegador o usas otro dispositivo, necesitarás ayuda del equipo.
                  Guarda la referencia de tu operación.
                </p>
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() => setSaveGuestAccess(!saveGuestAccess)}
                >
                  Guardar acceso con una cuenta (opcional)
                </button>
                {saveGuestAccess && (
                  <form className="portal-form" onSubmit={saveAccess}>
                    <label>
                      Correo para guardar tu acceso
                      <input name="email" type="email" required autoComplete="email" />
                    </label>
                    <Button variant="outline" disabled={busy}>
                      Enviar enlace de confirmación
                    </Button>
                  </form>
                )}
              </section>
            )}
            {!admin && (
              <section className="portal-card">
                <div className="portal-section-title">
                  <ArrowLeftRight />
                  <div>
                    <h2>Realiza tu cambio desde aquí</h2>
                    <p>Completa los datos, registra el pago y sigue la revisión del equipo.</p>
                  </div>
                </div>
                {!rates.length ? (
                  <p>
                    No hay cotizaciones vigentes. Nuestro equipo debe habilitar una tasa antes de
                    recibir nuevas solicitudes.
                  </p>
                ) : (
                  <form
                    ref={formRef}
                    className="portal-form transfer-form"
                    onSubmit={create}
                    noValidate
                    aria-label="Solicitud de cambio"
                  >
                    <ol className="exchange-progress wide" aria-label="Pasos de tu cambio">
                      {["Cotización", "Tus datos", "Cuenta de destino", "Revisión y pago"].map(
                        (label, index) => (
                          <li
                            key={label}
                            aria-current={step === index ? "step" : undefined}
                            className={step >= index ? "active" : ""}
                          >
                            <span>{index + 1}</span>
                            {label}
                          </li>
                        ),
                      )}
                    </ol>
                    <fieldset
                      className="exchange-fieldset wide"
                      data-step="0"
                      hidden={step !== 0}
                      disabled={busy}
                    >
                      <legend className="sr-only">Cotización</legend>
                      <div className="transfer-step-heading wide">
                        <span>01</span>
                        <div>
                          <h3 tabIndex={-1}>Cotiza tu envío</h3>
                          <p>Revisa cuánto pagas y cuánto recibe el destinatario.</p>
                        </div>
                      </div>
                      <label>
                        Ruta
                        <select
                          value={selected}
                          required
                          onChange={(e) => {
                            setSelected(e.target.value);
                            setAccountType("bank_account");
                          }}
                        >
                          <option value="" disabled>
                            Elige una ruta disponible
                          </option>
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
                    </fieldset>
                    <fieldset
                      className="exchange-fieldset wide"
                      data-step="1"
                      hidden={step !== 1}
                      disabled={busy}
                    >
                      <legend className="sr-only">Tus datos</legend>
                      <div className="transfer-step-heading wide">
                        <span>02</span>
                        <div>
                          <h3 tabIndex={-1}>Tus datos de contacto</h3>
                          <p>
                            Déjanos tu contacto y elige el comprobante que necesitas para este
                            cambio.
                          </p>
                        </div>
                      </div>
                      <label>
                        Tipo de documento del remitente
                        <select
                          name="customerDocumentType"
                          value={customerDocumentType}
                          onChange={(e) => setCustomerDocumentType(e.target.value)}
                        >
                          {Object.entries(identityDocumentLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {effectiveBillingType !== "nfse" && (
                        <input
                          type="hidden"
                          name="billingDocumentType"
                          value={billingDocumentType}
                        />
                      )}
                      {[
                        ["customerName", "Tu nombre completo"],
                        ["customerDocument", "Tu DNI, RUC o documento"],
                      ].map(([name, label]) => (
                        <label key={name}>
                          {label}
                          <input name={name} required minLength={2} maxLength={200} />
                        </label>
                      ))}
                      <label>
                        Correo para recibir el comprobante
                        <input
                          name="billingEmail"
                          type="email"
                          required
                          maxLength={254}
                          autoComplete="email"
                          defaultValue={guest ? "" : session.user.email || ""}
                        />
                      </label>
                      <label>
                        Tu teléfono con código de país
                        <input
                          name="customerPhone"
                          type="tel"
                          required
                          minLength={6}
                          maxLength={40}
                          autoComplete="tel"
                          pattern={"\\+[1-9][0-9]{7,14}"}
                          placeholder="Ej. +51 …"
                        />
                      </label>
                      {destinationCountry === "BR" ? (
                        <div className="wide billing-jurisdiction">
                          <strong>Brasil · Nota fiscal de serviço (NFS-e)</strong>
                          <p>
                            El destinatario recibe reales. La comisión se documentará en Brasil.
                          </p>
                          <input type="hidden" name="billingType" value="nfse" />
                        </div>
                      ) : (
                        <label>
                          Tipo de comprobante · Perú
                          <select
                            name="billingType"
                            value={billingType}
                            onChange={(e) => setBillingType(e.target.value)}
                          >
                            <option value="boleta">Boleta</option>
                            <option value="factura">Factura</option>
                          </select>
                        </label>
                      )}
                      {effectiveBillingType === "nfse" && (
                        <>
                          <label>
                            Nombre o razón social del receptor fiscal
                            <input name="billingLegalName" required minLength={2} maxLength={200} />
                          </label>
                          <label>
                            Documento fiscal
                            <select
                              name="billingDocumentType"
                              value={brazilDocumentType}
                              onChange={(e) => setBrazilDocumentType(e.target.value)}
                            >
                              <option value="foreign">Documento extranjero</option>
                              <option value="cpf">CPF</option>
                              <option value="cnpj">CNPJ</option>
                            </select>
                          </label>
                          <label>
                            Número del documento fiscal
                            <input
                              name="billingRuc"
                              required
                              minLength={2}
                              maxLength={
                                brazilDocumentType === "cnpj"
                                  ? 14
                                  : brazilDocumentType === "cpf"
                                    ? 11
                                    : 20
                              }
                              pattern={
                                brazilDocumentType === "cnpj"
                                  ? "[0-9]{14}"
                                  : brazilDocumentType === "cpf"
                                    ? "[0-9]{11}"
                                    : "[A-Za-z0-9-]{2,20}"
                              }
                            />
                          </label>
                        </>
                      )}
                      {effectiveBillingType === "factura" ? (
                        <>
                          <label>
                            RUC para la factura
                            <input
                              name="billingRuc"
                              required
                              inputMode="numeric"
                              pattern="[0-9]{11}"
                              minLength={11}
                              maxLength={11}
                            />
                          </label>
                          <label>
                            Razón social para la factura
                            <input name="billingLegalName" required minLength={2} maxLength={200} />
                          </label>
                        </>
                      ) : effectiveBillingType === "boleta" ? (
                        <>
                          <p className="wide">
                            La boleta usará tu nombre y documento indicados arriba.
                          </p>
                        </>
                      ) : null}
                      <label>
                        Banco desde el que pagarás
                        <input name="originBank" required minLength={2} maxLength={200} />
                      </label>
                      {[
                        {
                          name: "sourceCountry",
                          label: "País de la cuenta de origen",
                          currency: rate?.from_currency,
                          value: sourceCountry,
                        },
                        {
                          name: "destinationCountry",
                          label: "País de la cuenta receptora",
                          currency: rate?.to_currency,
                          value: destinationCountry,
                        },
                      ].map((country) => (
                        <label key={country.name}>
                          {country.label}
                          <input type="hidden" name={country.name} value={country.value} />
                          <span>{countryLabels[country.value]}</span>
                        </label>
                      ))}
                      {involvesPeru && (
                        <>
                          <p className="wide">
                            Para operaciones con Perú, declara de dónde proviene el dinero y para
                            qué realizarás el cambio. El equipo revisará estos datos junto con tu
                            pago.
                          </p>
                          <label>
                            Origen de los fondos
                            <select
                              name="fundsOrigin"
                              required
                              value={fundsOrigin}
                              onChange={(e) => setFundsOrigin(e.target.value)}
                            >
                              <option value="">Elige el origen</option>
                              {Object.entries(fundsOriginLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Detalle del origen de fondos{" "}
                            {fundsOrigin === "other" ? "" : "(opcional)"}
                            <textarea
                              name="fundsDetail"
                              required={fundsOrigin === "other"}
                              minLength={fundsOrigin === "other" ? 5 : undefined}
                              maxLength={500}
                            />
                          </label>
                          <label className="wide">
                            Motivo del cambio
                            <textarea
                              name="transferPurpose"
                              required
                              minLength={5}
                              maxLength={500}
                              placeholder="Ej. apoyar a mi familia, pagar estudios o a un proveedor"
                            />
                          </label>
                        </>
                      )}
                    </fieldset>
                    <fieldset
                      className="exchange-fieldset wide"
                      data-step="2"
                      hidden={step !== 2}
                      disabled={busy}
                    >
                      <legend className="sr-only">Cuenta de destino</legend>
                      <div className="transfer-step-heading wide">
                        <span>03</span>
                        <div>
                          <h3 tabIndex={-1}>Destinatario y cuenta a recibir</h3>
                          <p>
                            Copia los datos tal como aparecen en el banco. Destino:{" "}
                            {rate?.to_currency}.
                          </p>
                        </div>
                      </div>
                      {[
                        ["recipientName", "Nombre completo del destinatario"],
                        ["recipientDocument", "Documento del destinatario"],
                        ["recipientAccountHolder", "Titular de la cuenta receptora"],
                        [
                          "recipientAccountHolderDocument",
                          "Documento del titular (DNI / CPF / CNPJ u otro)",
                        ],
                        ["recipientBank", "Banco de la cuenta receptora"],
                      ].map(([name, label]) => (
                        <label key={name}>
                          {label}
                          <input name={name} required minLength={2} maxLength={200} />
                        </label>
                      ))}
                      <label>
                        Tipo de cuenta o clave
                        <select
                          name="recipientAccountType"
                          value={accountType}
                          onChange={(e) => setAccountType(e.target.value)}
                        >
                          <option value="bank_account">Cuenta bancaria</option>
                          {rate?.to_currency === "PEN" && (
                            <option value="cci">CCI (20 dígitos)</option>
                          )}
                          {rate?.to_currency === "BRL" && <option value="pix">Clave PIX</option>}
                        </select>
                      </label>
                      <label>
                        {accountType === "pix"
                          ? "Clave PIX del titular"
                          : accountType === "cci"
                            ? "CCI de la cuenta"
                            : "Número de cuenta receptora"}
                        <input
                          name="recipientAccount"
                          required
                          minLength={accountType === "cci" ? 20 : 2}
                          maxLength={accountType === "cci" ? 20 : 200}
                          inputMode={accountType === "cci" ? "numeric" : "text"}
                          pattern={accountType === "cci" ? "[0-9]{20}" : undefined}
                          placeholder={
                            accountType === "pix"
                              ? "CPF, CNPJ, correo, teléfono o clave aleatoria"
                              : "Sin abreviar"
                          }
                        />
                      </label>
                      <label>
                        Agencia / sucursal (si corresponde)
                        <input name="recipientBankBranch" maxLength={50} />
                      </label>
                      <label>
                        Teléfono del destinatario (opcional)
                        <input name="recipientPhone" type="tel" maxLength={40} />
                      </label>
                      <label className="wide">
                        Relación con el destinatario y el titular de la cuenta
                        <input
                          name="recipientRelationship"
                          maxLength={200}
                          placeholder="Obligatorio si envías a otra persona. Ej. familiar, proveedor o representante"
                        />
                      </label>
                      <label className="wide">
                        Información adicional (opcional)
                        <textarea
                          name="transferNote"
                          maxLength={500}
                          placeholder="Indicaciones que deba revisar el equipo"
                        />
                      </label>
                    </fieldset>
                    <fieldset
                      className="exchange-fieldset wide"
                      data-step="3"
                      hidden={step !== 3}
                      disabled={busy}
                    >
                      <legend className="sr-only">Revisión y pago</legend>
                      <div className="transfer-step-heading wide">
                        <span>04</span>
                        <div>
                          <h3 tabIndex={-1}>Revisa tu cambio y continúa al pago</h3>
                          <p>
                            Si ya realizaste el ingreso, adjunta la foto ahora. Si aún no pagaste,
                            registra los datos y recibirás las instrucciones para continuar.
                          </p>
                        </div>
                      </div>
                      {reviewData && rate && amounts && (
                        <div className="exchange-review wide">
                          <h4>Resumen de tu solicitud</h4>
                          <dl>
                            <div>
                              <dt>Pagas a Brasper</dt>
                              <dd>{money(Number(amount), rate.from_currency)}</dd>
                            </div>
                            <div>
                              <dt>Comisión incluida</dt>
                              <dd>{money(amounts.commission, rate.from_currency)}</dd>
                            </div>
                            <div>
                              <dt>Recibe el destinatario</dt>
                              <dd>{money(amounts.received, rate.to_currency)}</dd>
                            </div>
                            <div>
                              <dt>Remitente</dt>
                              <dd>
                                {reviewData.customerName} · {reviewData.customerDocument}
                              </dd>
                            </div>
                            <div>
                              <dt>Destinatario</dt>
                              <dd>
                                {reviewData.recipientName} · {reviewData.recipientDocument}
                              </dd>
                            </div>
                            <div>
                              <dt>Cuenta receptora</dt>
                              <dd>
                                {reviewData.recipientBank} · {reviewData.recipientAccount}
                              </dd>
                            </div>
                            <div>
                              <dt>Titular</dt>
                              <dd>
                                {reviewData.recipientAccountHolder} ·{" "}
                                {reviewData.recipientAccountHolderDocument}
                              </dd>
                            </div>
                            <div>
                              <dt>Banco de origen</dt>
                              <dd>
                                {reviewData.originBank} · {countryLabels[reviewData.sourceCountry]}
                              </dd>
                            </div>
                            <div>
                              <dt>País de recepción</dt>
                              <dd>{countryLabels[reviewData.destinationCountry]}</dd>
                            </div>
                            {reviewData.fundsOrigin && (
                              <div>
                                <dt>Origen de fondos</dt>
                                <dd>
                                  {fundsOriginLabels[reviewData.fundsOrigin]}
                                  {reviewData.fundsDetail && ` · ${reviewData.fundsDetail}`}
                                </dd>
                              </div>
                            )}
                            {reviewData.transferPurpose && (
                              <div>
                                <dt>Motivo del cambio</dt>
                                <dd>{reviewData.transferPurpose}</dd>
                              </div>
                            )}
                            {reviewData.recipientRelationship && (
                              <div>
                                <dt>Relación con el destinatario / titular</dt>
                                <dd>{reviewData.recipientRelationship}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Tipo de comprobante</dt>
                              <dd>{billingTypeLabels[reviewData.billingType]}</dd>
                            </div>
                            <div>
                              <dt>Correo de entrega</dt>
                              <dd>{reviewData.billingEmail}</dd>
                            </div>
                            <div>
                              <dt>Receptor del comprobante</dt>
                              <dd>
                                {reviewData.billingType !== "boleta"
                                  ? `${reviewData.billingLegalName} · ${reviewData.billingType === "nfse" ? billingDocumentLabels[reviewData.billingDocumentType] : "RUC"} ${reviewData.billingRuc}`
                                  : `${reviewData.customerName} · ${reviewData.customerDocument}`}
                              </dd>
                            </div>
                          </dl>
                          <p>
                            Revisa el número de cuenta antes de confirmar. Podrás volver para
                            corregirlo.
                          </p>
                        </div>
                      )}
                      <div className="wide">
                        <ReceiptUpload
                          file={initialReceipt}
                          onChange={setInitialReceipt}
                          disabled={busy}
                        />
                      </div>
                      {initialReceipt && (
                        <label className="wide">
                          Número de operación de tu pago bancario
                          <input
                            value={initialBankReference}
                            onChange={(e) => setInitialBankReference(e.target.value)}
                            required
                            minLength={2}
                            maxLength={100}
                            placeholder="El número que figura en la constancia de tu banco"
                          />
                        </label>
                      )}
                      <label className="wide portal-consent">
                        <input type="checkbox" name="declarationAccepted" value="yes" required />{" "}
                        Declaro que los fondos provienen de mi cuenta y que la información del
                        remitente, destinatario y origen de fondos es correcta. Autorizo su uso para
                        gestionar este envío y el comprobante.
                      </label>
                    </fieldset>
                    <div className="exchange-navigation wide">
                      {step > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="exchange-back"
                          disabled={busy}
                          onClick={() => setStep((old) => old - 1)}
                        >
                          <ArrowLeft size={16} /> Volver
                        </Button>
                      )}
                      {step < 3 && (
                        <Button
                          type="button"
                          variant="brand"
                          disabled={busy || !rate}
                          onClick={nextStep}
                        >
                          Continuar <ArrowRight size={16} />
                        </Button>
                      )}
                    </div>
                    <Button
                      type="submit"
                      variant="brand"
                      className="wide exchange-submit"
                      hidden={step !== 3}
                      disabled={busy || !rate}
                    >
                      {initialReceipt
                        ? "Enviar solicitud y comprobante a revisión"
                        : "Guardar datos y continuar al pago"}{" "}
                      <ArrowRight size={16} />
                    </Button>
                    <p className="wide" hidden={step !== 3}>
                      La prueba de pago será revisada por el equipo antes de enviar el dinero.
                    </p>
                  </form>
                )}
              </section>
            )}
            <section className="portal-operations">
              <h2>{admin ? "Bandeja de revisión" : "Historial de operaciones"}</h2>
              <Link to="/transferencias" className="portal-start-link">
                Ver todo el historial <ArrowRight size={14} />
              </Link>
              {!transfers.length && (
                <div className="portal-card">
                  <p>Aún no hay operaciones registradas.</p>
                </div>
              )}
              {transfers.map((t) => {
                const invoice = firstInvoice(t.invoices);
                return (
                  <article
                    className={`portal-card operation-card${t.id === embeddedOperation ? " operation-new" : ""}`}
                    key={t.id}
                    id={`operacion-${t.id}`}
                  >
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
                        <p>
                          {billingTypeLabels[t.billing_type || "factura"]} ·{" "}
                          {t.billing_email || t.customer_email}
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
                      <div className="operation-upload">
                        <h4>
                          {t.proof_path
                            ? "Actualizar la prueba de pago"
                            : "Completa tu pago y envía la prueba"}
                        </h4>
                        <label>
                          Número de operación de tu pago bancario
                          <input
                            value={bankReferences[t.id] ?? t.deposit_bank_reference ?? ""}
                            onChange={(e) =>
                              setBankReferences((old) => ({ ...old, [t.id]: e.target.value }))
                            }
                            minLength={2}
                            maxLength={100}
                            disabled={busy}
                          />
                        </label>
                        <ReceiptUpload
                          file={proofFiles[t.id] ?? null}
                          onChange={(file) => setProofFiles((old) => ({ ...old, [t.id]: file }))}
                          disabled={busy}
                        />
                        <Button
                          variant="brand"
                          disabled={
                            busy ||
                            !proofFiles[t.id] ||
                            (bankReferences[t.id] ?? t.deposit_bank_reference ?? "").trim().length <
                              2
                          }
                          onClick={() => void proof(t, proofFiles[t.id]!)}
                        >
                          Enviar comprobante a revisión <ArrowRight size={16} />
                        </Button>
                        <p>
                          El equipo recibirá tus datos y este archivo. La revisión bancaria es
                          manual.
                        </p>
                      </div>
                    )}
                    <details className="operation-recipient">
                      <summary>Datos de la cuenta receptora, remitente y comprobante</summary>
                      <TransferDetails transfer={t} />
                    </details>
                    {t.proof_path && (
                      <EvidenceDetails
                        path={t.proof_path}
                        label="Comprobante de pago a Brasper"
                        summary="Ver imagen o PDF del pago"
                      />
                    )}
                    {t.payout_path && (
                      <EvidenceDetails
                        path={t.payout_path}
                        label="Constancia del envío al destinatario"
                        summary="Ver imagen o PDF del envío al destinatario"
                      />
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
                          <FileText size={16} />{" "}
                          {invoice.environment === "beta" ? "PDF de prueba beta" : "Comprobante"}{" "}
                          {invoice.number}
                        </Button>
                      )}
                    </div>
                    {invoice && (
                      <div className="billing-status">
                        {invoice.environment === "beta" && (
                          <strong>ENSAYO SIN VALIDEZ TRIBUTARIA · </strong>
                        )}
                        <BillingStatus invoice={invoice} details={admin} />
                        {admin && invoice.error ? ` · ${invoice.error}` : ""}
                      </div>
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
                        {["proof_submitted", "verified", "awaiting_payment", "cancelled"].includes(
                          t.status,
                        ) && (
                          <TransferReview
                            key={`${t.id}:${t.status}`}
                            id={t.id}
                            status={t.status}
                            busy={busy}
                            onReview={(data) => review(t, data)}
                          />
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
                              restore_verified: "Ingreso confirmado restaurado",
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
