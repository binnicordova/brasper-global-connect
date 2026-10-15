import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { QuoteSummary } from "@/components/transfer/quote-summary";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/use-brasper-data";
import { api } from "@/lib/api/client";
import { fieldIssues, messageForError } from "@/lib/api/errors";
import {
  DOC_TYPES,
  FUNDS_SOURCES,
  type DocType,
  type Order,
  type OrderClientData,
  type Quote,
} from "@/lib/api/types";
import { banksFor, docTypeLabels, fundsSourceLabels } from "@/lib/banks";
import { cacheOrders, forgetProfile, savedProfile, saveProfile } from "@/lib/local-data";
import {
  isValidAccount,
  isValidDocNumber,
  isValidEmail,
  isValidName,
  normalizeDocNumber,
} from "@/lib/validators";

type Form = OrderClientData;
type Errors = Partial<Record<keyof Form, string>>;

const EMPTY: Form = {
  clientName: "",
  docType: "DNI",
  docNumber: "",
  email: "",
  fundsSource: "salary",
  sourceBank: "",
  sourceAccount: "",
  destinationBank: "",
  destinationAccount: "",
};

function validateForm(form: Form): Errors {
  const errors: Errors = {};
  if (!isValidName(form.clientName)) errors.clientName = "Escribe tu nombre y apellido.";
  if (!isValidDocNumber(form.docType, form.docNumber))
    errors.docNumber = `Ese ${form.docType} no es válido.`;
  if (!isValidEmail(form.email)) errors.email = "Escribe un correo válido.";
  if (!form.sourceBank.trim()) errors.sourceBank = "Indica el banco desde el que pagarás.";
  if (!isValidAccount(form.sourceAccount)) errors.sourceAccount = "Escribe al menos 4 caracteres.";
  if (!form.destinationBank.trim()) errors.destinationBank = "Indica el banco de destino.";
  if (!isValidAccount(form.destinationAccount))
    errors.destinationAccount = "Escribe al menos 4 caracteres.";
  return errors;
}

export function DetailsStep({
  quote,
  onBack,
  onCreated,
  onExpired,
}: {
  quote: Quote;
  onBack: () => void;
  onCreated: (order: Order) => void;
  onExpired: () => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const left = useCountdown(quote.expiresAt);
  const expired = left === 0;

  useEffect(() => {
    const profile = savedProfile();
    if (profile) {
      setForm({ ...EMPTY, ...profile });
      setRemember(true);
    }
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const data: Form = {
        ...form,
        clientName: form.clientName.trim(),
        docNumber: normalizeDocNumber(form.docType, form.docNumber),
        email: form.email.trim().toLowerCase(),
      };
      const order = await api.createOrder({ ...data, quoteId: quote.id, language: "es" });
      if (remember) saveProfile(data);
      else forgetProfile();
      cacheOrders(order.uid, [order]);
      onCreated(order);
    } catch (e) {
      const issues = fieldIssues(e);
      if (Object.keys(issues).length) setErrors(issues as Errors);
      setMessage(messageForError(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Form, label: string, props: Record<string, unknown> = {}) => (
    <label>
      {label}
      <input
        name={key}
        value={form[key]}
        onChange={(e) => set(key, e.target.value as never)}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${key}-error` : undefined}
        {...props}
      />
      {errors[key] && (
        <span className="field-error" id={`${key}-error`} role="alert">
          {errors[key]}
        </span>
      )}
    </label>
  );

  return (
    <section className="portal-card" aria-labelledby="details-title">
      <h2 id="details-title">2. Tus datos y el destino</h2>
      <QuoteSummary quote={quote} />
      {expired ? (
        <div className="portal-notice" role="alert">
          La cotización venció. Genera una nueva para ver la tasa vigente.
          <Button type="button" variant="brand" onClick={onExpired}>
            Cotizar de nuevo
          </Button>
        </div>
      ) : (
        <form ref={formRef} className="portal-form transfer-form" onSubmit={submit} noValidate>
          {field("clientName", "Nombre y apellido", { autoComplete: "name", maxLength: 100 })}
          <label>
            Tipo de documento
            <select
              name="docType"
              value={form.docType}
              onChange={(e) => set("docType", e.target.value as DocType)}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {docTypeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          {field("docNumber", "Número de documento", { inputMode: "text", autoComplete: "off" })}
          {field("email", "Correo", { type: "email", autoComplete: "email", maxLength: 200 })}
          <label className="wide">
            Origen de los fondos
            <select
              name="fundsSource"
              value={form.fundsSource}
              onChange={(e) => set("fundsSource", e.target.value as Form["fundsSource"])}
            >
              {FUNDS_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {fundsSourceLabels[s]}
                </option>
              ))}
            </select>
          </label>
          {field("sourceBank", `Banco desde el que pagas (${quote.sendCurrency})`, {
            list: "source-banks",
          })}
          {field("sourceAccount", "Tu cuenta de origen", { autoComplete: "off" })}
          {field("destinationBank", `Banco de destino (${quote.receiveCurrency})`, {
            list: "destination-banks",
          })}
          {field("destinationAccount", "Cuenta o clave PIX del destinatario", {
            autoComplete: "off",
          })}
          <datalist id="source-banks">
            {banksFor(quote.sendCurrency).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <datalist id="destination-banks">
            {banksFor(quote.receiveCurrency).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <label className="wide portal-consent">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                if (!e.target.checked) forgetProfile();
              }}
            />
            Recordar mis datos en este dispositivo para la próxima vez
          </label>
          <p className="wide">
            Tus datos se envían a Brasper para registrar la operación. Si marcas la casilla, una
            copia queda solo en este navegador y puedes borrarla desmarcándola.
          </p>
          {message && (
            <div className="wide portal-notice" role="alert">
              {message}
            </div>
          )}
          <div className="wide exchange-navigation">
            <Button type="button" variant="outline" className="exchange-back" onClick={onBack}>
              <ArrowLeft size={16} /> Cambiar monto
            </Button>
            <Button variant="brand" disabled={busy}>
              {busy ? "Creando operación…" : "Crear mi operación"} <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
